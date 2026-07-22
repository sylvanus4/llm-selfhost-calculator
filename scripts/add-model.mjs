#!/usr/bin/env node
/* Build a data/models.json entry for a new open-weight LLM from its HF config.json.
   Deterministic core of the "a major model dropped — add it to the calculator" flow.
   The LLM/skill layer decides WHICH model (from news/Twitter) and supplies name/hf/date;
   this script does the arithmetic and the engine-verdict matching, and flags anything it
   cannot confidently derive with a `_review` note (no fabrication).

   Usage:
     node scripts/add-model.mjs --hf owner/name [--name "Display"] [--released 2026-08] [--apply]
     node scripts/add-model.mjs --config ./config.json --hf owner/name [--apply]
       --config  local config.json (skip network); still needs --hf for the id/url
       --apply   prepend the entry to data/models.json (dedup by id) and run the test suite
   Prints the proposed entry as JSON. Exit 0 ok · 2 usage/error · 5 needs review (missing fields). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const has = (k) => argv.includes(k);

const hf = opt("--hf");
if (!hf || !/^[^/]+\/[^/]+$/.test(hf)) { console.error("required: --hf owner/name"); process.exit(2); }
const configPath = opt("--config");
const displayName = opt("--name") || hf.split("/")[1];
const released = opt("--released") || new Date().toISOString().slice(0, 7);
const apply = has("--apply");

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "llm-selfhost-calc-add-model" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
async function loadConfig() {
  if (configPath) return JSON.parse(fs.readFileSync(configPath, "utf8"));
  return getJson(`https://huggingface.co/${hf}/resolve/main/config.json`);
}
// total param count (billions) from the safetensors index total_size, if available.
async function totalParamsB() {
  if (configPath) return null;  // offline mode: caller supplies via _review
  try {
    const idx = await getJson(`https://huggingface.co/${hf}/resolve/main/model.safetensors.index.json`);
    const bytes = idx.metadata && idx.metadata.total_size;
    if (!bytes) return null;
    // dtype from config later; assume 2 bytes/param (bf16/fp16) unless fp8 checkpoint.
    return +(bytes / 2 / 1e9).toFixed(2);
  } catch { return null; }
}

const review = [];
function need(v, msg) { if (v == null) review.push(msg); return v; }

const cfg = await loadConfig();
const t = (cfg.text_config && typeof cfg.text_config === "object") ? cfg.text_config : cfg; // multimodal wrappers
const arch = Array.isArray(cfg.architectures) && cfg.architectures[0] || (Array.isArray(t.architectures) && t.architectures[0]) || null;
need(arch, "architectures[] missing — cannot classify engine support");

const n_layers = t.num_hidden_layers ?? cfg.num_hidden_layers ?? null;
const hidden = t.hidden_size ?? cfg.hidden_size ?? null;
const context = t.max_position_embeddings ?? cfg.max_position_embeddings ?? null;
const n_heads = t.num_attention_heads ?? cfg.num_attention_heads ?? null;
const n_kv_heads = t.num_key_value_heads ?? cfg.num_key_value_heads ?? n_heads;
const head_dim = t.head_dim ?? (hidden && n_heads ? Math.round(hidden / n_heads) : null);

// MoE detection
const n_experts = t.num_experts ?? t.num_local_experts ?? t.n_routed_experts ?? null;
const moe = n_experts != null && n_experts > 1;
const experts_per_tok = t.num_experts_per_tok ?? t.moe_topk ?? null;

// kv_dim: standard GQA = n_kv_heads * head_dim. MLA (kv_lora_rank present) is different -> flag.
let kv_dim = null;
if (t.kv_lora_rank != null || /Deepseek|MLA|Kimi|Glm4Moe/i.test(String(arch))) {
  kv_dim = t.kv_lora_rank ? (t.kv_lora_rank + (t.qk_rope_head_dim || 64)) : null;
  review.push("MLA/compressed-KV architecture — kv_dim is an approximation; verify against the model card (shown KV is an upper bound).");
} else if (n_kv_heads && head_dim) {
  kv_dim = n_kv_heads * head_dim;
}
need(kv_dim, "kv_dim could not be derived — set from the model config manually");
need(n_layers, "num_hidden_layers missing"); need(hidden, "hidden_size missing"); need(context, "max_position_embeddings missing");

const total_params_b = await totalParamsB();
if (total_params_b == null) review.push("total_params_b unknown (no safetensors index / offline) — fill from the model card.");
// active params: dense model = total; MoE needs router math -> best-effort flag.
let active_params_b = null;
if (!moe && total_params_b != null) active_params_b = total_params_b;
else if (moe) review.push("MoE active_params_b needs router math (dense backbone + experts_per_tok × expert size) — fill from the model card.");

// FP8 checkpoint hint (affects param-count byte assumption)
const q = cfg.quantization_config || t.quantization_config;
const quantMethod = q && String(q.quant_method || q.quant_algo || "").toLowerCase() || null;

// ---- engine verdicts by arch match ---------------------------------------
const vllmSup = JSON.parse(fs.readFileSync(path.join(root, "data/vllm-support.json")));
const sglangSup = JSON.parse(fs.readFileSync(path.join(root, "data/sglang-support.json")));
const trtSup = JSON.parse(fs.readFileSync(path.join(root, "data/trtllm-support.json")));

function vllmVerdict() {
  const native = new Set(vllmSup.native_architectures || []);
  const custom = !!(cfg.auto_map || cfg.trust_remote_code);
  if (arch && native.has(arch)) return { tier: "native", arch };
  if (custom) return { tier: "custom", arch: null, caveats: ["커스텀 모델링 코드(auto_map/trust_remote_code) — --trust-remote-code 필요, 실측 권장"] };
  if (arch) return { tier: "transformers", arch, caveats: ["네이티브 목록 미등록 → Transformers 백엔드(--model-impl transformers)로 near-native 시도"] };
  return { tier: "unknown", arch: null };
}
function engineVerdict(sup) {
  const map = sup.arch_support || {};
  if (arch && map[arch]) { const a = map[arch]; return { tier: a.tier, ...(a.min_ver ? { min_ver: a.min_ver } : {}), ...(a.caveats ? { caveats: a.caveats.slice() } : {}) }; }
  if (arch) return { tier: "unsupported", caveats: [`${arch} — 엔진 레지스트리 미등록, 지원 확인/실측 필요`] };
  return { tier: "unknown" };
}

const id = displayName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
const entry = {
  id, name: displayName, total_params_b, active_params_b, n_layers, hidden, kv_dim, context,
  moe, ...(n_experts ? { n_experts } : {}), released, license: cfg.license || t.license || "see model card",
  hf, vllm: vllmVerdict(), sglang: engineVerdict(sglangSup), trtllm: engineVerdict(trtSup),
};
if (review.length) entry._review = review;

console.log(JSON.stringify(entry, null, 2));
if (review.length) console.error("\n⚠️ NEEDS REVIEW before shipping:\n - " + review.join("\n - "));

if (apply) {
  if (review.length) { console.error("\nRefusing --apply while fields need review. Fill them, then re-run without _review."); process.exit(5); }
  const mfp = path.join(root, "data/models.json");
  let mtext = fs.readFileSync(mfp, "utf8");
  const doc = JSON.parse(mtext);
  if (doc.models.some(m => m.id === id)) { console.error(`model id "${id}" already present — nothing to do.`); process.exit(0); }
  // targeted single-line insert to preserve the compact one-model-per-line style
  const line = JSON.stringify(entry);
  if (!/("models":\s*\[\s*\n)/.test(mtext)) throw new Error('could not locate "models": [ open');
  mtext = mtext.replace(/("models":\s*\[\s*\n)/, `$1    ${line},\n`);
  mtext = mtext.replace(/("_updated":\s*")[0-9-]+(")/, `$1${new Date().toISOString().slice(0, 10)}$2`);
  JSON.parse(mtext);   // sanity
  fs.writeFileSync(mfp, mtext);
  console.error(`\napplied — prepended "${id}" to data/models.json. Running tests…`);
  for (const s of ["compute", "vllm", "engines", "i18n", "spark", "versions-tools"]) {
    execFileSync("node", [`test/${s}.test.cjs`], { cwd: root, stdio: "inherit" });
  }
  console.error("all tests passed.");
}
process.exit(review.length ? 5 : 0);
