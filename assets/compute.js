/* Pure estimation core — no DOM, no I/O. Usable in the browser (global) and in Node (module.exports)
   so the same code path is unit-tested (test/compute.test.mjs) and shipped. */
(function (root) {
  // bytes/param including block-scale overhead where it applies:
  //   fp16/bf16 = 16-bit; fp8/int8 = 8-bit; int4 = idealized W4 (0.5);
  //   nvfp4 = FP4 E2M1 + FP8 per-16 block scale = 4.5 bit; mxfp4 = FP4 + E8M0 per-32 scale = 4.25 bit.
  const BYTES_PER_PARAM = { fp16: 2, fp8: 1, int8: 1, nvfp4: 0.5625, mxfp4: 0.53125, int4: 0.5 };
  const KV_BYTES = 2;    // fp16 KV cache
  const MBU = 0.5;       // single-stream memory-bandwidth utilization (conservative)
  const BATCH_EFF = 0.7; // batching efficiency for aggregate serving throughput

  // `own` (optional) enables owned/on-prem purchase payback mode:
  //   { pricePerKwh, monthlyTokens, capexOverride?, powerOverride? }.
  //   Omitted/null -> return shape and behaviour are unchanged (rental-vs-API only).
  function compute(model, gpu, quant, context, concurrency, rentOverride, apiPer1m, own) {
    const bpp = BYTES_PER_PARAM[quant];
    const weightsGB = model.total_params_b * bpp;                 // params_b(×1e9) × bpp ÷ 1e9 = params_b × bpp
    const activeGB = model.active_params_b * bpp;
    const kvPerTokenGB = (2 * model.n_layers * model.kv_dim * KV_BYTES) / 1e9;
    const overheadGB = 1.2 + 0.05 * weightsGB;
    const kvSingleGB = kvPerTokenGB * context;
    const vramSingle = weightsGB + kvSingleGB + overheadGB;      // to hold weights + one full-context sequence
    const fits = vramSingle <= gpu.vram_gb;                       // fits on ONE device?

    // How many of this device to hold weights + one sequence (tensor/pipeline parallel).
    const gpusNeeded = Math.max(1, Math.ceil(vramSingle / gpu.vram_gb));
    const totalVram = gpusNeeded * gpu.vram_gb;

    // Aggregate memory bandwidth scales with device count, minus tensor-parallel comm overhead.
    const tpEff = gpusNeeded > 1 ? 0.8 : 1;
    const aggBandwidth = gpu.bandwidth_gbs * gpusNeeded * tpEff;

    const freeForKV = totalVram - weightsGB - overheadGB;
    const maxBatch = freeForKV > 0 ? Math.floor(freeForKV / kvSingleGB) : 0;
    // Longest single-sequence context (batch=1) that fits on this device count, capped at the
    // model's trained max. Answers the consumer question "what's the longest prompt+gen I can run?".
    const maxCtxTokens = kvPerTokenGB > 0 ? Math.min(model.context, Math.max(0, Math.floor(freeForKV / kvPerTokenGB))) : 0;

    const singleTokS = (MBU * aggBandwidth) / activeGB;           // decode is bandwidth-bound on ACTIVE weights
    const effBatch = Math.max(1, Math.min(concurrency, maxBatch || 1));
    const servingTokS = singleTokS * effBatch * BATCH_EFF;

    const rent = rentOverride != null && !isNaN(rentOverride) ? rentOverride : gpu.rent_usd_hr;
    let selfHostPer1m = null, requiredTokS = null, verdict = null, fleetRentHr = null;
    if (rent != null) {
      fleetRentHr = rent * gpusNeeded;                            // renting the whole fleet
      selfHostPer1m = ((fleetRentHr / 3600) / servingTokS) * 1e6;
      requiredTokS = (fleetRentHr / 3600) / (apiPer1m / 1e6);
      verdict = servingTokS >= requiredTokS ? "self" : "api";
    }
    // Owned / on-prem purchase payback mode. Electricity is "active-energy": only the GPU-hours
    // actually spent generating the month's tokens (idle power excluded — stated in the UI).
    let ownAvailable = false, capexFleet = null, fleetKw = null, activeHours = null,
      elecMonthly = null, apiMonthly = null, monthlyNetSaving = null, paybackMonths = null, tcoSeries = null,
      overSubscribed = false;
    if (own && own.monthlyTokens > 0 && servingTokS > 0) {
      const unitPrice = own.capexOverride != null && !isNaN(own.capexOverride) ? own.capexOverride : gpu.price_usd;
      const unitPower = own.powerOverride != null && !isNaN(own.powerOverride) ? own.powerOverride : gpu.power_w;
      const kwh = own.pricePerKwh;
      if (unitPrice != null && unitPower != null && kwh != null && !isNaN(kwh)) {
        ownAvailable = true;
        capexFleet = unitPrice * gpusNeeded;                       // buy the whole fleet once
        fleetKw = (unitPower * gpusNeeded) / 1000;
        activeHours = own.monthlyTokens / servingTokS / 3600;      // GPU-hours to produce the month's tokens
        overSubscribed = activeHours > 730;                        // more GPU-hours than a month has -> can't actually serve this volume on this fleet
        elecMonthly = fleetKw * activeHours * kwh;
        apiMonthly = (own.monthlyTokens / 1e6) * apiPer1m;         // API cost you avoid at this volume
        monthlyNetSaving = apiMonthly - elecMonthly;
        paybackMonths = monthlyNetSaving > 0 ? capexFleet / monthlyNetSaving : null;  // null = never at this volume
        tcoSeries = [];
        for (let m = 0; m <= 36; m++) tcoSeries.push({ month: m, selfhost: capexFleet + elecMonthly * m, api: apiMonthly * m });
      }
    }

    return { bpp, weightsGB, activeGB, kvPerTokenGB, overheadGB, kvSingleGB, vramSingle, fits,
      gpusNeeded, totalVram, aggBandwidth, freeForKV, maxBatch, maxCtxTokens, singleTokS, effBatch, servingTokS,
      rent, fleetRentHr, selfHostPer1m, requiredTokS, verdict,
      ownAvailable, capexFleet, fleetKw, activeHours, elecMonthly, apiMonthly, monthlyNetSaving, paybackMonths, tcoSeries, overSubscribed };
  }

  const api = { compute, BYTES_PER_PARAM, KV_BYTES, MBU, BATCH_EFF };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LLMCalc = api;
})(typeof self !== "undefined" ? self : this);
