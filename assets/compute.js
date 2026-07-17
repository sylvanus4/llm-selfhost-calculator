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

  // ---- vLLM serving readiness (pure, DOM-free, Node-testable) --------------

  // Parse an HF model reference from a URL or bare id -> "owner/name" or null.
  // Accepts: https://huggingface.co/Owner/Name, hf.co/Owner/Name/tree/main,
  // .../blob/main/config.json, ?query, #hash, or a bare "Owner/Name".
  function normalizeHfRef(input) {
    if (input == null) return null;
    let s = String(input).trim();
    if (!s) return null;
    s = s.replace(/^https?:\/\//i, "");
    s = s.replace(/^(www\.)?(huggingface\.co|hf\.co)\//i, "");
    s = s.split(/[?#]/)[0];
    const parts = s.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0], name = parts[1];
    const seg = /^[A-Za-z0-9][\w.-]*$/;
    if (!seg.test(owner) || !seg.test(name)) return null;
    // datasets/spaces/models path prefixes are not LLM serving targets
    if (["datasets", "spaces", "models", "collections"].includes(owner.toLowerCase())) return null;
    return owner + "/" + name;
  }

  function detectQuantMethod(cfg) {
    const q = cfg && cfg.quantization_config;
    if (!q) return null;
    const m = String(q.quant_method || q.quant_algo || q.quantization || "").toLowerCase();
    if (m) return m;
    if (q.bits) return q.bits + "-bit";
    return "quantized";
  }

  // Map a detected checkpoint quant method OR a calculator "what-if" quant to a
  // vLLM --quantization flag value. cfgMethod (from HF config) is authoritative.
  function vllmQuantFlag(uiQuant, cfgMethod) {
    const m = String(cfgMethod || "").toLowerCase();
    if (m.includes("awq")) return "awq";
    if (m.includes("gptq")) return "gptq";
    if (m.includes("compressed")) return "compressed-tensors";
    if (m.includes("mxfp4")) return "mxfp4";
    if (m.includes("nvfp4") || m.includes("modelopt")) return "modelopt_fp4";
    if (m.includes("fp8")) return "fp8";
    if (m.includes("bitsandbytes") || m === "bnb") return "bitsandbytes";
    if (m) return m;
    // calculator selection (only meaningful if a matching checkpoint exists)
    switch (uiQuant) {
      case "fp8": return "fp8";
      case "nvfp4": return "modelopt_fp4";
      case "mxfp4": return "mxfp4";
      case "int4": return "awq";
      default: return null; // fp16/bf16/int8 -> no flag
    }
  }

  const TIER_LABEL = {
    native: "네이티브 지원",
    transformers: "Transformers 백엔드",
    custom: "커스텀 코드 — 확인 필요",
    unknown: "판정 불가",
    unsupported: "미지원",
  };

  // input is one of:
  //   { curated: modelObj }            -> uses precomputed modelObj.vllm
  //   { config: hfConfigJson, id }     -> derives tier from architectures[]
  // support = parsed data/vllm-support.json
  function vllmVerdict(input, support) {
    const ver = (support && support.vllm_version) || "unknown";
    const nativeSet = new Set((support && support.native_architectures) || []);
    let tier, arch = null, minVllm = ver, flags = [], caveats = [], quant = null, source;

    if (input && input.curated) {
      const v = input.curated.vllm || {};
      source = "curated";
      tier = v.tier || "native";
      arch = v.arch || null;
      minVllm = v.min_vllm || ver;
      flags = (v.flags || []).slice();
      caveats = (v.caveats || []).slice();
      if (tier === "transformers" && !flags.includes("--model-impl transformers")) flags.push("--model-impl transformers");
    } else {
      const cfg = (input && input.config) || {};
      source = "fetched";
      arch = Array.isArray(cfg.architectures) && cfg.architectures.length ? cfg.architectures[0] : null;
      const custom = !!(cfg.auto_map || cfg.trust_remote_code);
      quant = detectQuantMethod(cfg);
      if (arch && nativeSet.has(arch)) {
        tier = "native";
      } else if (custom) {
        tier = "custom";
        flags.push("--trust-remote-code");
        caveats.push("커스텀 모델링 코드(auto_map) — Transformers 백엔드 호환은 그 코드에 달려 있어 config.json만으론 확정 불가.");
      } else if (arch) {
        tier = "transformers";
        flags.push("--model-impl transformers");
        caveats.push("네이티브 등록 목록에 없음 → Transformers 백엔드로 시도(표준 아키텍처면 near-native).");
      } else {
        tier = "unknown";
        caveats.push("config.json에 architectures가 없어 판정할 수 없습니다.");
      }
      if (quant) caveats.push("양자화 감지: " + quant + " — vLLM " + ver + "에서 해당 커널 지원을 확인하세요.");
    }

    const ok = tier === "native" || tier === "transformers";
    return { tier, label: TIER_LABEL[tier] || tier, ok, arch, min_vllm: minVllm, flags, caveats, quant, source, vllm_version: ver };
  }

  function servedName(id) {
    const tail = String(id || "").split("/").pop() || "model";
    return tail.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
  }

  // Build a vLLM serving spec (image + CLI args + gpu count) from calculator inputs.
  // o: { modelId, quant, context, modelMaxContext, concurrency, gpuCount,
  //      vllmVersion, custom, implTransformers, quantMethod }
  function buildServingSpec(o) {
    const id = o.modelId;
    const name = servedName(id);
    const tp = Math.max(1, Math.floor(o.gpuCount || 1));
    const wantCtx = o.context || 8192;
    const maxCtx = o.modelMaxContext || wantCtx;
    const maxLen = Math.max(1024, Math.min(wantCtx, maxCtx));
    const args = ["--model", id, "--served-model-name", name];
    if (tp > 1) args.push("--tensor-parallel-size", String(tp));
    args.push("--max-model-len", String(maxLen));
    args.push("--gpu-memory-utilization", "0.90");
    args.push("--max-num-seqs", String(Math.max(1, Math.floor(o.concurrency || 16))));
    const qflag = vllmQuantFlag(o.quant, o.quantMethod);
    if (qflag) args.push("--quantization", qflag);
    if (o.implTransformers) args.push("--model-impl", "transformers");
    if (o.custom) args.push("--trust-remote-code");
    return {
      image: "vllm/vllm-openai:v" + (o.vllmVersion || "latest"),
      modelId: id, servedName: name, args, gpuCount: tp, port: 8000, quant: qflag || null,
    };
  }

  const api = { compute, BYTES_PER_PARAM, KV_BYTES, MBU, BATCH_EFF,
    normalizeHfRef, vllmVerdict, buildServingSpec, servedName, vllmQuantFlag, detectQuantMethod };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LLMCalc = api;
})(typeof self !== "undefined" ? self : this);
