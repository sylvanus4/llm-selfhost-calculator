/* Objective gate for the vLLM serving-readiness core. Run: node test/vllm.test.cjs
   Loads the SHIPPED compute.js + manifest.js + data files, asserts HF-ref parsing,
   3-tier verdict logic, serving-spec derivation, and manifest well-formedness. */
const fs = require("fs");
const path = require("path");
const { normalizeHfRef, vllmVerdict, buildServingSpec, servedName } = require("../assets/compute.js");
const Manifest = require("../assets/manifest.js");

const root = path.join(__dirname, "..");
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const support = JSON.parse(fs.readFileSync(path.join(root, "data/vllm-support.json")));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }

console.log("vllm.js gate:");

// 1. normalizeHfRef — URL variants all collapse to owner/name
ok("bare id", normalizeHfRef("Qwen/Qwen3-8B") === "Qwen/Qwen3-8B");
ok("https url", normalizeHfRef("https://huggingface.co/Qwen/Qwen3-8B") === "Qwen/Qwen3-8B");
ok("hf.co short", normalizeHfRef("hf.co/Qwen/Qwen3-8B") === "Qwen/Qwen3-8B");
ok("tree/main suffix", normalizeHfRef("https://huggingface.co/Qwen/Qwen3-8B/tree/main") === "Qwen/Qwen3-8B");
ok("blob/config suffix", normalizeHfRef("huggingface.co/Qwen/Qwen3-8B/blob/main/config.json") === "Qwen/Qwen3-8B");
ok("query string", normalizeHfRef("https://huggingface.co/Qwen/Qwen3-8B?library=transformers") === "Qwen/Qwen3-8B");
ok("hash", normalizeHfRef("https://huggingface.co/Qwen/Qwen3-8B#usage") === "Qwen/Qwen3-8B");
ok("trailing slash", normalizeHfRef("Qwen/Qwen3-8B/") === "Qwen/Qwen3-8B");
ok("empty -> null", normalizeHfRef("") === null);
ok("single segment -> null", normalizeHfRef("Qwen") === null);
ok("datasets prefix -> null", normalizeHfRef("https://huggingface.co/datasets/foo/bar") === null);
ok("junk -> null", normalizeHfRef("!!!") === null);

// 2. vllmVerdict — curated precomputed
const qwen = models.find(m => m.id === "qwen3-8b");
const vq = vllmVerdict({ curated: qwen }, support);
ok("curated qwen3-8b native", vq.tier === "native" && vq.ok === true);
ok("curated carries arch", vq.arch === "Qwen3ForCausalLM");
ok("curated vllm_version pinned", vq.vllm_version === support.vllm_version);
ok("all curated models have vllm.tier", models.every(m => m.vllm && typeof m.vllm.tier === "string"));
// Curated models resolve to a valid tier. Most are native/transformers (ok=true), but a
// curated model MAY legitimately be pre-release / novel-arch (tier custom/unknown, ok=false)
// — e.g. Kimi K3 (weights 2026-07-27, KDA/LatentMoE not yet in vLLM). Assert valid tier, not ok.
const VALID_TIERS = new Set(["native", "transformers", "custom", "unknown", "unsupported"]);
ok("all curated resolve to a valid tier", models.every(m => VALID_TIERS.has(vllmVerdict({ curated: m }, support).tier)));
ok("most curated resolve ok (native/transformers)",
  models.filter(m => vllmVerdict({ curated: m }, support).ok).length >= models.length - 2);

// 3. vllmVerdict — fetched config, 3-tier
const nativeArch = vllmVerdict({ config: { architectures: ["LlamaForCausalLM"] }, id: "x/y" }, support);
ok("fetched native arch -> native", nativeArch.tier === "native" && nativeArch.arch === "LlamaForCausalLM");

const tb = vllmVerdict({ config: { architectures: ["SomeBrandNewForCausalLM"] }, id: "x/y" }, support);
ok("fetched unknown-but-standard -> transformers", tb.tier === "transformers");
ok("transformers verdict carries --model-impl flag", tb.flags.includes("--model-impl transformers"));
ok("transformers is ok", tb.ok === true);

const custom = vllmVerdict({ config: { architectures: ["WeirdModel"], auto_map: { AutoModel: "modeling.WeirdModel" } }, id: "x/y" }, support);
ok("fetched custom code -> custom", custom.tier === "custom");
ok("custom carries --trust-remote-code", custom.flags.includes("--trust-remote-code"));

const unknown = vllmVerdict({ config: {}, id: "x/y" }, support);
ok("fetched no arch -> unknown, not ok", unknown.tier === "unknown" && unknown.ok === false);

const quantCfg = vllmVerdict({ config: { architectures: ["LlamaForCausalLM"], quantization_config: { quant_method: "awq" } }, id: "x/y" }, support);
ok("quantization detected in caveats", quantCfg.caveats.some(c => c.toLowerCase().includes("awq")));

// 4. buildServingSpec
const spec1 = buildServingSpec({ modelId: "Qwen/Qwen3-8B", quant: "fp16", context: 8192, modelMaxContext: 40960, concurrency: 16, gpuCount: 1, vllmVersion: "0.25.1" });
ok("spec image pinned", spec1.image === "vllm/vllm-openai:v0.25.1");
ok("spec served-name derived", spec1.servedName === "qwen3-8b" && spec1.args.includes("--served-model-name"));
ok("single gpu -> no TP flag", !spec1.args.includes("--tensor-parallel-size"));
ok("max-model-len present", spec1.args.includes("--max-model-len") && spec1.args.includes("8192"));
ok("fp16 -> no --quantization", !spec1.args.includes("--quantization"));

const spec2 = buildServingSpec({ modelId: "deepseek-ai/DeepSeek-V4-Pro", quant: "fp8", context: 262144, modelMaxContext: 1048576, concurrency: 64, gpuCount: 8, vllmVersion: "0.25.1" });
ok("multi-gpu -> TP flag", spec2.args.includes("--tensor-parallel-size") && spec2.args.includes("8"));
ok("fp8 -> --quantization fp8", spec2.args.includes("--quantization") && spec2.args.includes("fp8"));

const spec3 = buildServingSpec({ modelId: "x/y", quant: "fp16", context: 999999, modelMaxContext: 8192, concurrency: 4, gpuCount: 1, vllmVersion: "0.25.1" });
ok("max-model-len clamped to model max", spec3.args[spec3.args.indexOf("--max-model-len") + 1] === "8192");

const specT = buildServingSpec({ modelId: "x/y", quant: "fp16", context: 4096, modelMaxContext: 4096, concurrency: 8, gpuCount: 1, vllmVersion: "0.25.1", implTransformers: true, custom: true });
ok("transformers+custom flags emitted", specT.args.includes("--model-impl") && specT.args.includes("transformers") && specT.args.includes("--trust-remote-code"));

ok("servedName sanitizes to RFC1123-safe", servedName("Org/My_Weird.Model!!") === "my-weird.model");

// 5. Manifest well-formedness
const dc = Manifest.dockerCompose(spec2);
ok("compose has image", dc.includes("vllm/vllm-openai:v0.25.1"));
ok("compose has model arg", dc.includes('"--model"') && dc.includes('"deepseek-ai/DeepSeek-V4-Pro"'));
ok("compose has gpu count", dc.includes("count: 8"));
ok("compose has services key", /^services:/m.test(dc));

const k8s = Manifest.k8sManifest(spec2);
ok("k8s has Deployment + Service", k8s.includes("kind: Deployment") && k8s.includes("kind: Service"));
ok("k8s gpu limit", k8s.includes("nvidia.com/gpu: 8"));
ok("k8s readiness probe /health", k8s.includes("path: /health"));
ok("k8s document separator", k8s.includes("\n---\n"));

const helm = Manifest.helmValues(spec2);
ok("helm has modelURL", helm.includes("modelURL: deepseek-ai/DeepSeek-V4-Pro"));
ok("helm has requestGPU", helm.includes("requestGPU: 8"));
ok("helm repository keeps full image path", helm.includes("repository: vllm/vllm-openai") && helm.includes("tag: v0.25.1"));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
