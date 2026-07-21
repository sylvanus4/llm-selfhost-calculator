/* Objective gate for the SGLang + TensorRT-LLM serving-readiness cores.
   Run: node test/engines.test.cjs
   Loads the SHIPPED compute.js + manifest.js + data files, asserts arch-match verdicts,
   the hardware gate (SGLang !Apple/!NPU · TensorRT-LLM NVIDIA-only), serving-spec
   derivation, and generic-engine manifest well-formedness. */
const fs = require("fs");
const path = require("path");
const {
  sglangVerdict, trtllmVerdict, buildSglangSpec, buildTrtllmSpec, servedName,
} = require("../assets/compute.js");
const Manifest = require("../assets/manifest.js");

const root = path.join(__dirname, "..");
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const gpus = JSON.parse(fs.readFileSync(path.join(root, "data/gpus.json"))).gpus;
const sg = JSON.parse(fs.readFileSync(path.join(root, "data/sglang-support.json")));
const trt = JSON.parse(fs.readFileSync(path.join(root, "data/trtllm-support.json")));

const M = id => models.find(m => m.id === id);
const G = id => gpus.find(g => g.id === id);
const H100 = G("h100-80"), MI300 = G("mi300x"), APPLE = G("m4-max-128"), NPU = G("furiosa-rngd"), B200 = G("b200");

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }

console.log("engines.js gate (SGLang + TensorRT-LLM):");

// ---- data-file integrity -------------------------------------------------
const VALID = new Set(["native", "partial", "unsupported", "unknown", "incompatible"]);
for (const [label, data] of [["sglang", sg], ["trtllm", trt]]) {
  ok(`${label} has version`, typeof data.version === "string");
  ok(`${label} arch_support tiers valid`, Object.values(data.arch_support).every(a => VALID.has(a.tier)));
  ok(`${label} tier_help covers every tier`, ["native", "partial", "unsupported", "unknown", "incompatible"].every(t => data.tier_help[t]));
  ok(`${label} hardware lists kinds`, Array.isArray(data.hardware.unsupported_kinds));
}

// ---- every curated model resolves to a valid tier on a compatible GPU ----
ok("all curated resolve valid SGLang tier (H100)", models.every(m => VALID.has(sglangVerdict({ curated: m }, sg, H100).tier)));
ok("all curated resolve valid TRT-LLM tier (H100)", models.every(m => VALID.has(trtllmVerdict({ curated: m }, trt, H100).tier)));

// ---- arch-match verdicts (curated) ---------------------------------------
{
  const v = sglangVerdict({ curated: M("glm-5.2") }, sg, H100);       // Glm4MoeForCausalLM -> native
  ok("SGLang glm-5.2 native", v.tier === "native" && v.ok === true);
  ok("SGLang carries arch", v.arch === "Glm4MoeForCausalLM");
  const d = sglangVerdict({ curated: M("kimi-k2.7-code") }, sg, H100); // DeepseekV3 -> native (MLA strength)
  ok("SGLang deepseek native", d.tier === "native");
  const nem = sglangVerdict({ curated: M("nemotron-3-nano") }, sg, H100); // NemotronH hybrid -> partial
  ok("SGLang nemotron-H partial", nem.tier === "partial" && nem.ok === true);
}
{
  const v = trtllmVerdict({ curated: M("kimi-k2.7-code") }, trt, H100);  // DeepseekV3 -> native
  ok("TRT-LLM deepseek native", v.tier === "native" && v.ok === true);
  const nem = trtllmVerdict({ curated: M("nemotron-3-super") }, trt, H100); // NVIDIA own -> native
  ok("TRT-LLM nemotron native", nem.tier === "native");
  const mm = trtllmVerdict({ curated: M("minimax-m2.7") }, trt, H100);   // MiniMax -> unsupported
  ok("TRT-LLM minimax unsupported", mm.tier === "unsupported" && mm.ok === false);
}

// ---- hardware gate -------------------------------------------------------
{
  // SGLang: NVIDIA + AMD ok; Apple + NPU incompatible
  ok("SGLang ok on H100", sglangVerdict({ curated: M("qwen3-8b") }, sg, H100).tier === "native");
  ok("SGLang ok on MI300X (ROCm)", sglangVerdict({ curated: M("qwen3-8b") }, sg, MI300).tier === "native");
  ok("SGLang incompatible on Apple", sglangVerdict({ curated: M("qwen3-8b") }, sg, APPLE).tier === "incompatible");
  ok("SGLang incompatible on NPU", sglangVerdict({ curated: M("qwen3-8b") }, sg, NPU).tier === "incompatible");
  // TensorRT-LLM: NVIDIA only
  ok("TRT-LLM ok on H100", trtllmVerdict({ curated: M("qwen3-8b") }, trt, H100).tier === "native");
  ok("TRT-LLM incompatible on MI300X", trtllmVerdict({ curated: M("qwen3-8b") }, trt, MI300).tier === "incompatible");
  ok("TRT-LLM incompatible on Apple", trtllmVerdict({ curated: M("qwen3-8b") }, trt, APPLE).tier === "incompatible");
  ok("TRT-LLM incompatible on NPU", trtllmVerdict({ curated: M("qwen3-8b") }, trt, NPU).tier === "incompatible");
  const inc = trtllmVerdict({ curated: M("qwen3-8b") }, trt, MI300);
  ok("incompatible carries reason + ok=false", inc.ok === false && inc.caveats.length > 0);
}

// ---- fetched arbitrary HF model (arch from config) -----------------------
{
  const nativeCfg = sglangVerdict({ config: { architectures: ["LlamaForCausalLM"] }, id: "x/y" }, sg, H100);
  ok("SGLang fetched Llama native", nativeCfg.tier === "native" && nativeCfg.arch === "LlamaForCausalLM");
  const unsup = sglangVerdict({ config: { architectures: ["SomeBrandNewForCausalLM"] }, id: "x/y" }, sg, H100);
  ok("SGLang fetched unknown-arch unsupported", unsup.tier === "unsupported" && unsup.ok === false);
  const noArch = trtllmVerdict({ config: {}, id: "x/y" }, trt, H100);
  ok("TRT-LLM fetched no-arch unknown", noArch.tier === "unknown" && noArch.ok === false);
}

// ---- serving spec derivation ---------------------------------------------
{
  const s1 = buildSglangSpec({ modelId: "Qwen/Qwen3-8B", quant: "fp16", context: 8192, modelMaxContext: 40960, concurrency: 16, gpuCount: 1, version: "0.6.2", image: "lmsysorg/sglang:v0.6.2" });
  ok("SGLang image pinned", s1.image === "lmsysorg/sglang:v0.6.2");
  ok("SGLang command launches server", s1.command.includes("sglang.launch_server") && s1.command.includes("--model-path"));
  ok("SGLang single-gpu no --tp", !s1.command.includes("--tp"));
  ok("SGLang context-length present", s1.command.includes("--context-length") && s1.command.includes("8192"));
  ok("SGLang fp16 -> no --quantization", !s1.command.includes("--quantization"));
  ok("SGLang port 30000", s1.port === 30000);
  const s2 = buildSglangSpec({ modelId: "deepseek-ai/DeepSeek-V4-Pro", quant: "fp8", context: 262144, modelMaxContext: 1048576, concurrency: 64, gpuCount: 8, version: "0.6.2" });
  ok("SGLang multi-gpu --tp 8", s2.command.includes("--tp") && s2.command.includes("8"));
  ok("SGLang fp8 -> --quantization fp8", s2.command.includes("--quantization") && s2.command.includes("fp8"));

  const t1 = buildTrtllmSpec({ modelId: "Qwen/Qwen3-8B", quant: "fp16", context: 8192, modelMaxContext: 40960, concurrency: 16, gpuCount: 1, version: "1.2.0", image: "nvcr.io/nvidia/tensorrt-llm/release:1.2.0" });
  ok("TRT-LLM image pinned", t1.image === "nvcr.io/nvidia/tensorrt-llm/release:1.2.0");
  ok("TRT-LLM trtllm-serve pytorch backend", t1.command.includes("trtllm-serve") && t1.command.includes("pytorch"));
  ok("TRT-LLM single-gpu no --tp_size", !t1.command.includes("--tp_size"));
  ok("TRT-LLM max_seq_len present", t1.command.includes("--max_seq_len") && t1.command.includes("8192"));
  const t2 = buildTrtllmSpec({ modelId: "x/y", quant: "fp8", context: 4096, modelMaxContext: 4096, concurrency: 32, gpuCount: 4, version: "1.2.0" });
  ok("TRT-LLM multi-gpu --tp_size 4", t2.command.includes("--tp_size") && t2.command.includes("4"));
  ok("TRT-LLM fp8 -> kv_cache_dtype fp8", t2.command.includes("--kv_cache_dtype") && t2.command.includes("fp8"));
  const t3 = buildTrtllmSpec({ modelId: "x/y", quant: "fp16", context: 999999, modelMaxContext: 8192, concurrency: 4, gpuCount: 1, version: "1.2.0" });
  ok("max_seq_len clamped to model max", t3.command[t3.command.indexOf("--max_seq_len") + 1] === "8192");
}

// ---- generic-engine manifests well-formed --------------------------------
for (const [label, spec] of [
  ["sglang", buildSglangSpec({ modelId: "zai-org/GLM-5.2", quant: "fp8", context: 65536, modelMaxContext: 1048576, concurrency: 64, gpuCount: 8, version: "0.6.2", image: "lmsysorg/sglang:v0.6.2" })],
  ["trtllm", buildTrtllmSpec({ modelId: "deepseek-ai/DeepSeek-V4-Pro", quant: "fp8", context: 65536, modelMaxContext: 1048576, concurrency: 64, gpuCount: 8, version: "1.2.0", image: "nvcr.io/nvidia/tensorrt-llm/release:1.2.0" })],
]) {
  const dc = Manifest.engineCompose(spec);
  ok(`${label} compose has services`, /^services:/m.test(dc) && dc.includes("image: " + spec.image));
  ok(`${label} compose has gpu count`, dc.includes("count: " + spec.gpuCount));
  ok(`${label} compose has command`, dc.includes(spec.command[0]));
  const k8s = Manifest.engineK8s(spec);
  ok(`${label} k8s has Deployment + Service`, k8s.includes("kind: Deployment") && k8s.includes("kind: Service"));
  ok(`${label} k8s gpu limit`, k8s.includes("nvidia.com/gpu: " + spec.gpuCount));
  ok(`${label} k8s doc separator`, k8s.includes("\n---\n"));
  const helm = Manifest.engineHelm(spec);
  ok(`${label} helm has model url`, helm.includes("url: " + spec.modelId));
  ok(`${label} helm has gpu`, helm.includes("nvidia.com/gpu: " + spec.gpuCount));
}

console.log(`\nengines.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
