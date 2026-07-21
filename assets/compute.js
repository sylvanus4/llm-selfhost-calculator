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

  // ---- SGLang / TensorRT-LLM serving readiness (arch-match + hardware gate) --
  // Shared engine-verdict core. A curated model carries its canonical HF arch in
  // model.vllm.arch; we match that (or a fetched config's architectures[0]) against
  // the engine's arch_support map, then apply the engine's hardware gate. Per-model
  // overrides (model.sglang / model.trtllm) win when present (e.g. null-arch models).
  const ENGINE_TIER_LABEL = {
    native: "네이티브 지원",
    partial: "부분 지원 — 확인 필요",
    unsupported: "미지원",
    unknown: "판정 불가",
    incompatible: "하드웨어 미지원",
  };

  // Hardware compatibility: engine support JSON lists unsupported accelerator kinds.
  function engineHardwareGate(gpu, support) {
    const hw = support && support.hardware;
    if (!hw || !gpu) return { compatible: true };
    const un = hw.unsupported_kinds || [];
    if (un.indexOf(gpu.kind) !== -1) return { compatible: false, reason: hw.note || "이 하드웨어는 지원되지 않습니다." };
    return { compatible: true };
  }

  // o: { arch, override, gpu }  ·  support = parsed engine-support JSON
  function engineVerdict(o, support) {
    const ver = (support && support.version) || "unknown";
    const archMap = (support && support.arch_support) || {};
    const hw = engineHardwareGate(o.gpu, support);
    if (!hw.compatible) {
      return { tier: "incompatible", label: ENGINE_TIER_LABEL.incompatible, ok: false,
        arch: o.arch || null, min_ver: ver, caveats: [hw.reason], source: "hardware",
        version: ver, hardwareBlocked: true };
    }
    let tier, arch = o.arch || null, minVer = ver, caveats = [], source;
    const override = o.override;
    if (override && override.tier) {
      tier = override.tier; caveats = (override.caveats || []).slice();
      minVer = override.min_ver || ver; arch = override.arch || arch; source = "override";
    } else if (arch && archMap[arch]) {
      const a = archMap[arch]; tier = a.tier; caveats = (a.caveats || []).slice();
      minVer = a.min_ver || ver; source = "arch";
    } else if (arch) {
      tier = "unsupported"; source = "arch";
      caveats.push("엔진 모델 레지스트리에 없는 아키텍처(" + arch + ") — 지원 확인/실측이 필요합니다.");
    } else {
      tier = "unknown"; source = "none";
      caveats.push("아키텍처를 읽지 못해 판정할 수 없습니다 — 모델 카드를 확인하세요.");
    }
    const ok = tier === "native" || tier === "partial";
    return { tier, label: ENGINE_TIER_LABEL[tier] || tier, ok, arch, min_ver: minVer,
      caveats, source, version: ver };
  }

  // Normalize a verdict input ({curated} or {config,id}) to { arch, model, id, custom, quantMethod }.
  function engineResolveInput(input) {
    if (input && input.curated) {
      const m = input.curated;
      return { arch: (m.vllm && m.vllm.arch) || null, model: m, id: m.hf, custom: false, quantMethod: null };
    }
    const cfg = (input && input.config) || {};
    const arch = Array.isArray(cfg.architectures) && cfg.architectures.length ? cfg.architectures[0] : null;
    return { arch, model: null, id: (input && input.id) || null,
      custom: !!(cfg.auto_map || cfg.trust_remote_code), quantMethod: detectQuantMethod(cfg) };
  }

  function sglangVerdict(input, support, gpu) {
    const e = engineResolveInput(input);
    const override = (e.model && e.model.sglang) || null;
    return engineVerdict({ arch: e.arch, override, gpu }, support);
  }
  function trtllmVerdict(input, support, gpu) {
    const e = engineResolveInput(input);
    const override = (e.model && e.model.trtllm) || null;
    return engineVerdict({ arch: e.arch, override, gpu }, support);
  }

  // Map calculator "what-if" quant (or a detected checkpoint method) to an engine flag value.
  function sglangQuantFlag(uiQuant, cfgMethod) {
    const m = String(cfgMethod || "").toLowerCase();
    if (m.includes("awq")) return "awq";
    if (m.includes("gptq")) return "gptq";
    if (m.includes("mxfp4")) return "mxfp4";
    if (m.includes("nvfp4") || m.includes("modelopt")) return "modelopt_fp4";
    if (m.includes("fp8")) return "fp8";
    if (m) return m;
    switch (uiQuant) {
      case "fp8": return "fp8";
      case "int8": return "w8a8_int8";
      case "nvfp4": return "modelopt_fp4";
      case "mxfp4": return "mxfp4";
      case "int4": return "awq";
      default: return null; // fp16/bf16 -> no flag
    }
  }
  function trtllmQuantFlag(uiQuant, cfgMethod) {
    const m = String(cfgMethod || "").toLowerCase();
    if (m.includes("nvfp4") || m.includes("modelopt")) return "modelopt_fp4";
    if (m.includes("awq")) return "int4_awq";
    if (m.includes("fp8")) return "fp8";
    if (m) return m;
    switch (uiQuant) {
      case "fp8": return "fp8";
      case "nvfp4": return "modelopt_fp4";
      case "int8": return "int8_sq";
      case "int4": return "int4_awq";
      default: return null;
    }
  }

  // Serving-spec builders — same input shape as buildServingSpec, engine-specific command.
  function buildSglangSpec(o) {
    const id = o.modelId;
    const name = servedName(id);
    const tp = Math.max(1, Math.floor(o.gpuCount || 1));
    const wantCtx = o.context || 8192;
    const maxCtx = o.modelMaxContext || wantCtx;
    const maxLen = Math.max(1024, Math.min(wantCtx, maxCtx));
    const port = 30000;
    const cmd = ["python3", "-m", "sglang.launch_server", "--model-path", id,
      "--served-model-name", name, "--host", "0.0.0.0", "--port", String(port)];
    if (tp > 1) cmd.push("--tp", String(tp));
    cmd.push("--context-length", String(maxLen));
    cmd.push("--mem-fraction-static", "0.90");
    cmd.push("--max-running-requests", String(Math.max(1, Math.floor(o.concurrency || 16))));
    const qflag = sglangQuantFlag(o.quant, o.quantMethod);
    if (qflag) cmd.push("--quantization", qflag);
    if (o.custom) cmd.push("--trust-remote-code");
    return {
      engine: "sglang", engineLabel: "SGLang",
      image: o.image || ("lmsysorg/sglang:v" + (o.version || "latest")),
      modelId: id, servedName: name, containerName: "sglang",
      command: cmd, args: cmd, gpuCount: tp, port, healthPath: "/health",
      quant: qflag || null,
      requirement: "NVIDIA Container Toolkit(또는 AMD ROCm) · 게이트 모델이면 HF_TOKEN",
    };
  }
  function buildTrtllmSpec(o) {
    const id = o.modelId;
    const name = servedName(id);
    const tp = Math.max(1, Math.floor(o.gpuCount || 1));
    const wantCtx = o.context || 8192;
    const maxCtx = o.modelMaxContext || wantCtx;
    const maxLen = Math.max(1024, Math.min(wantCtx, maxCtx));
    const port = 8000;
    const cmd = ["trtllm-serve", id, "--backend", "pytorch", "--host", "0.0.0.0", "--port", String(port)];
    if (tp > 1) cmd.push("--tp_size", String(tp));
    cmd.push("--max_seq_len", String(maxLen));
    cmd.push("--max_batch_size", String(Math.max(1, Math.floor(o.concurrency || 16))));
    cmd.push("--kv_cache_free_gpu_memory_fraction", "0.90");
    const qflag = trtllmQuantFlag(o.quant, o.quantMethod);
    if (qflag === "fp8" || qflag === "modelopt_fp4") cmd.push("--kv_cache_dtype", "fp8");
    if (o.custom) cmd.push("--trust_remote_code");
    return {
      engine: "trtllm", engineLabel: "TensorRT-LLM",
      image: o.image || ("nvcr.io/nvidia/tensorrt-llm/release:" + (o.version || "latest")),
      modelId: id, servedName: name, containerName: "trtllm",
      command: cmd, args: cmd, gpuCount: tp, port, healthPath: "/health",
      quant: qflag || null,
      requirement: "NVIDIA GPU + NVIDIA Container Toolkit · 게이트 모델이면 HF_TOKEN · 양자화는 ModelOpt 사전 양자화 체크포인트 권장",
    };
  }

  // ---- Spark cluster / per-node memory layout (howtospark.com-style) --------
  // Faithful port of the howtospark.com "on the Sparks" view: force a node count,
  // pick a mixed-precision quant, optionally REAP-prune MoE experts, and see the
  // per-node memory stack (expert planes / KV / dense / overhead / free) + fit + tok/s.
  //
  // Constants anchored to howtospark.com recipe pages + Sapid-Labs/vLLM-Moet kernels
  // (spark-gb10, 2026-07); see test/golden/howtospark.json. All are PLANNING
  // approximations, not vendor guarantees.
  //   expert_bpp = bytes/param for MoE routed experts; dense_bpp = bytes/param for the
  //   always-on backbone (attention, embeddings, router, shared expert, lm_head).
  //   NVFP4 = E2M1(4b) + FP8 scale/16 = 4.5 bit = 0.5625 B (measured: Qwen3.6-35B 32.2B experts -> 17 GiB).
  //   2-bit expert kernel ~2.1 bit = 0.26 B (GLM-5.2: full-pool ~95 GB/rank, pruned 208/256 -> ~79 GB/rank).
  const SPARK_QUANT = [
    { id: "bf16",     label: "native bfloat16",             expert_bpp: 2.0,    dense_bpp: 2.0,    quality: "exact" },
    { id: "entropy",  label: "lossless entropy coding",     expert_bpp: 1.55,   dense_bpp: 1.55,   quality: "lossless" },
    { id: "int8",     label: "8-bit",                       expert_bpp: 1.0,    dense_bpp: 1.0,    quality: "near-lossless" },
    { id: "int4",     label: "4-bit",                       expert_bpp: 0.5,    dense_bpp: 0.5,    quality: "good" },
    { id: "gguf1",    label: "1-bit GGUF (dynamic)",        expert_bpp: 0.20,   dense_bpp: 0.5,    quality: "experimental" },
    { id: "e2_fp8",   label: "2-bit experts + FP8 dense",   expert_bpp: 0.26, dense_bpp: 1.0,    quality: "balanced" },
    { id: "e2_nvfp4", label: "2-bit experts + NVFP4 dense", expert_bpp: 0.26, dense_bpp: 0.5625, quality: "balanced" },
  ];
  // Speculative-decode tok/s multipliers (upper-bound; real acceptance is model/workload-dependent).
  // Anchored to vLLM-Moet MTP/dspark K=3 measurements (GLM-5.2: 15 -> 24.3 tok/s fast build ~=1.6x).
  const SPEC_MULT = { off: 1.0, ngram: 1.2, draft: 1.4, eagle: 1.9, mtp: 1.6 };
  const SPARK_TP_EFF = nc => (nc > 1 ? 0.8 : 1);          // tensor-parallel comm overhead
  const REAP_MAX = 0.5;                                    // REAP supports up to ~50% expert prune (Cerebras 2510.13999)

  // Usable memory of ONE device (bytes visible to the process). Unified-memory boxes
  // (DGX Spark, Apple) reserve a chunk for OS/driver; HBM cards expose ~all VRAM.
  function sparkUsableGB(gpu) {
    if (gpu.usable_gb != null) return gpu.usable_gb;
    const reserved = (gpu.kind === "apple") ? 0 : (gpu.id === "dgx-spark" ? 14 : 0);
    return Math.max(1, gpu.vram_gb - reserved);            // dgx-spark 128 -> ~114
  }

  // Split a model into dense backbone vs routed-expert params (billions).
  // Uses explicit dense_params_b when present (grounded), else a labeled estimate.
  function sparkParts(model) {
    const total = model.total_params_b;
    if (!model.moe) return { denseB: total, expertB: 0, nExperts: 0, estimated: false };
    let denseB = model.dense_params_b, estimated = false;
    if (denseB == null) {                                   // estimate: backbone ~ min(half total, ~0.6x active)
      denseB = Math.max(2, Math.min(total * 0.5, model.active_params_b * 0.6));
      estimated = true;
    }
    return { denseB, expertB: Math.max(0, total - denseB), nExperts: model.n_experts || 0, estimated };
  }

  // REAP expert pruning: prune p (0..0.5) of routed experts. Shrinks expert MEMORY;
  // active top-k count (and thus decode compute/tok-s) is unchanged.
  function sparkReap(parts, prunePct) {
    const keep = 1 - Math.max(0, Math.min(REAP_MAX, (prunePct || 0) / 100));
    const kept = parts.nExperts ? Math.round(parts.nExperts * keep) : 0;
    return { denseB: parts.denseB, expertB: parts.expertB * keep, keep, kept, nExperts: parts.nExperts, estimated: parts.estimated };
  }

  function sparkModeById(id) { return SPARK_QUANT.find(m => m.id === id) || SPARK_QUANT[SPARK_QUANT.length - 1]; }

  // Weight footprint (GB) for a quant mode after pruning.
  function sparkFootprint(reaped, mode) {
    const expertGB = reaped.expertB * mode.expert_bpp;
    const denseGB = reaped.denseB * mode.dense_bpp;
    return { expertGB, denseGB, weightsGB: expertGB + denseGB };
  }

  // Single-stream tok/s: bandwidth-bound on ACTIVE weight bytes, scaled by node count.
  function sparkTokS(model, gpu, nodeCount, mode, spec) {
    const total = model.total_params_b, active = model.active_params_b;
    const parts = sparkParts(model);
    const denseActiveB = model.moe ? parts.denseB : total;                 // dense is always active
    const expertActiveB = model.moe ? Math.max(0, active - parts.denseB) : 0; // active routed experts (top-k)
    const activeBytesGB = denseActiveB * mode.dense_bpp + expertActiveB * mode.expert_bpp;
    const aggBandwidth = gpu.bandwidth_gbs * nodeCount * SPARK_TP_EFF(nodeCount);
    const base = activeBytesGB > 0 ? (MBU * aggBandwidth) / activeBytesGB : 0;
    return base * (SPEC_MULT[spec] || 1);
  }

  // Per-node memory stack + cluster fit. context in tokens; spec = key of SPEC_MULT.
  function sparkFit(model, gpu, nodeCount, modeId, prunePct, context, spec) {
    const nodes = Math.max(1, Math.min(256, Math.floor(nodeCount || 1)));
    const total = model.total_params_b;
    const mode = sparkModeById(modeId);
    const reaped = sparkReap(sparkParts(model), prunePct);
    const fp = sparkFootprint(reaped, mode);
    const usablePerNode = sparkUsableGB(gpu);
    const usableTotal = usablePerNode * nodes;

    // KV cache (FP16 upper bound), sharded across nodes with the weights (TP).
    const kvPerTokenGB = (2 * model.n_layers * model.kv_dim * KV_BYTES) / 1e9;
    const kvTotalGB = kvPerTokenGB * (context || 0);
    // Draft model residency when spec-decode is on (small; MTP/EAGLE head or dspark drafter).
    const draftTotalGB = (spec && spec !== "off") ? Math.min(6, 0.02 * total + 1) : 0;
    // Activation/CUDA-graph/NCCL overhead, per node, grows slightly with weights.
    const overheadPerNode = 1.2 + 0.05 * (fp.weightsGB / nodes);

    const weightsPerNode = fp.weightsGB / nodes;
    const expertPerNode = fp.expertGB / nodes;
    const densePerNode = fp.denseGB / nodes;
    const kvPerNode = kvTotalGB / nodes;
    const draftPerNode = draftTotalGB / nodes;
    const usedPerNode = weightsPerNode + kvPerNode + draftPerNode + overheadPerNode;
    const freePerNode = usablePerNode - usedPerNode;

    // Longest context that fits: free memory (after weights+overhead+draft) / KV-per-token, cluster-wide.
    const freeForKV = usableTotal - fp.weightsGB - draftTotalGB - overheadPerNode * nodes;
    const maxCtxFits = kvPerTokenGB > 0 ? Math.max(0, Math.floor(freeForKV / kvPerTokenGB)) : 0;

    const tokS = sparkTokS(model, gpu, nodes, mode, spec);
    const perNode = [];
    for (let i = 0; i < nodes; i++) perNode.push({
      role: i === 0 ? "HEAD" : "WORKER",
      expertGB: expertPerNode, denseGB: densePerNode, weightsGB: weightsPerNode,
      kvGB: kvPerNode, draftGB: draftPerNode, overheadGB: overheadPerNode,
      freeGB: freePerNode, usedGB: usedPerNode, usableGB: usablePerNode,
      pct: usablePerNode > 0 ? (usedPerNode / usablePerNode) * 100 : 0,
    });

    return {
      nodes, mode, prunePct: Math.max(0, Math.min(REAP_MAX * 100, prunePct || 0)),
      keep: reaped.keep, expertsKept: reaped.kept, nExperts: reaped.nExperts,
      usablePerNode, usableTotal,
      expertGB: fp.expertGB, denseGB: fp.denseGB, weightsGB: fp.weightsGB,
      kvTotalGB, draftTotalGB, usedTotalGB: usedPerNode * nodes,
      fits: usedPerNode <= usablePerNode, tokS, maxCtxFits,
      estimated: reaped.estimated, perNode,
    };
  }

  // Full quant ladder: every mode at the current node/prune/context/spec -> row list.
  function sparkLadder(model, gpu, nodeCount, prunePct, context, spec) {
    return SPARK_QUANT.map(m => {
      const f = sparkFit(model, gpu, nodeCount, m.id, prunePct, context, spec);
      return { id: m.id, label: m.label, quality: m.quality, weightsGB: f.weightsGB,
        totalGB: f.usedTotalGB, tokS: f.tokS, fits: f.fits, usableTotal: f.usableTotal };
    });
  }

  const api = { compute, BYTES_PER_PARAM, KV_BYTES, MBU, BATCH_EFF,
    normalizeHfRef, vllmVerdict, buildServingSpec, servedName, vllmQuantFlag, detectQuantMethod,
    sglangVerdict, trtllmVerdict, buildSglangSpec, buildTrtllmSpec,
    sglangQuantFlag, trtllmQuantFlag, engineVerdict, engineHardwareGate,
    SPARK_QUANT, SPEC_MULT, sparkUsableGB, sparkParts, sparkReap, sparkFootprint,
    sparkTokS, sparkFit, sparkLadder };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LLMCalc = api;
})(typeof self !== "undefined" ? self : this);
