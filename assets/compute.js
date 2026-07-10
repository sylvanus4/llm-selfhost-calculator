/* Pure estimation core — no DOM, no I/O. Usable in the browser (global) and in Node (module.exports)
   so the same code path is unit-tested (test/compute.test.mjs) and shipped. */
(function (root) {
  const BYTES_PER_PARAM = { fp16: 2, int8: 1, int4: 0.5 };
  const KV_BYTES = 2;    // fp16 KV cache
  const MBU = 0.5;       // single-stream memory-bandwidth utilization (conservative)
  const BATCH_EFF = 0.7; // batching efficiency for aggregate serving throughput

  function compute(model, gpu, quant, context, concurrency, rentOverride, apiPer1m) {
    const bpp = BYTES_PER_PARAM[quant];
    const weightsGB = model.total_params_b * bpp;                 // params_b(×1e9) × bpp ÷ 1e9 = params_b × bpp
    const activeGB = model.active_params_b * bpp;
    const kvPerTokenGB = (2 * model.n_layers * model.kv_dim * KV_BYTES) / 1e9;
    const overheadGB = 1.2 + 0.05 * weightsGB;
    const kvSingleGB = kvPerTokenGB * context;
    const vramSingle = weightsGB + kvSingleGB + overheadGB;
    const fits = vramSingle <= gpu.vram_gb;

    const freeForKV = gpu.vram_gb - weightsGB - overheadGB;
    const maxBatch = freeForKV > 0 ? Math.floor(freeForKV / kvSingleGB) : 0;

    const singleTokS = (MBU * gpu.bandwidth_gbs) / activeGB;
    const effBatch = Math.max(1, Math.min(concurrency, maxBatch || 1));
    const servingTokS = singleTokS * effBatch * BATCH_EFF;

    const rent = rentOverride != null && !isNaN(rentOverride) ? rentOverride : gpu.rent_usd_hr;
    let selfHostPer1m = null, requiredTokS = null, verdict = null;
    if (rent != null) {
      selfHostPer1m = ((rent / 3600) / servingTokS) * 1e6;
      requiredTokS = (rent / 3600) / (apiPer1m / 1e6);
      verdict = servingTokS >= requiredTokS ? "self" : "api";
    }
    return { bpp, weightsGB, activeGB, kvPerTokenGB, overheadGB, kvSingleGB, vramSingle, fits,
      maxBatch, singleTokS, effBatch, servingTokS, rent, selfHostPer1m, requiredTokS, verdict };
  }

  const api = { compute, BYTES_PER_PARAM, KV_BYTES, MBU, BATCH_EFF };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LLMCalc = api;
})(typeof self !== "undefined" ? self : this);
