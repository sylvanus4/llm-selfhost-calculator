#!/usr/bin/env node
/* Deterministic health audit for the LLM self-hosting calculator.
   Surfaces concrete, actionable PROBLEMS in the shipped data/UI so the daily
   maintainer run can fix → verify → deploy them. Code owns detection
   ([[sonnet-format-determinism]]); the model owns the fix.

   Checks (structural = offline, always; network = with --network):
     F1 engine version/image consistency (pin ↔ versions[0].latest_patch ↔ image tag)
     F2 no leftover `_review` on any model (unfinished add)
     F3 per-model data sanity (positive dims; MoE active<total; n_experts>1)
     F4 vLLM verdict↔arch (tier native ⇒ arch set AND in native_architectures)
     F5 tool_calling coverage (curated arch falling to _default on an engine)
     F6 i18n leak (surfaced Korean data string missing an EN DATA entry)
     N1 curated model HF repo reachable (HTTP<400)          [--network]
     N2 docs / version-card doc links reachable (HTTP<400)  [--network]

   Usage:
     node scripts/health-audit.mjs                 # structural report
     node scripts/health-audit.mjs --network       # + link/HF liveness
     node scripts/health-audit.mjs --json          # machine JSON
     node scripts/health-audit.mjs --fail-on error # exit 6 if any error-severity finding
   Writes audit/health-report.json. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const doNetwork = args.includes("--network");
const failOn = (() => { const i = args.indexOf("--fail-on"); return i >= 0 ? args[i + 1] : null; })();
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));

const findings = [];
const add = (severity, code, msg, fix) => findings.push({ severity, code, msg, fix });
const minorOf = (v) => String(v).split(".").slice(0, 2).join(".");

const models = read("data/models.json").models;
const ENG = [
  { key: "vllm", file: "data/vllm-support.json", pinField: "vllm_version" },
  { key: "sglang", file: "data/sglang-support.json", pinField: "version" },
  { key: "trtllm", file: "data/trtllm-support.json", pinField: "version" },
];
const support = {}; for (const e of ENG) support[e.key] = read(e.file);

// F1 — version / image consistency
for (const e of ENG) {
  const d = support[e.key]; const pin = String(d[e.pinField] || "");
  const cards = d.versions || [];
  if (!cards.length) { add("warn", "F1", `${e.key}: no versions[] cards`, "add a version card for the current pin"); continue; }
  const cur = cards[0];
  if (minorOf(cur.version) !== minorOf(pin))
    add("error", "F1", `${e.key}: pin v${pin} minor != top version card v${cur.version}`, `set versions[0] to the v${minorOf(pin)} card or reorder recent-first`);
  if (cur.latest_patch && cur.latest_patch !== pin)
    add("error", "F1", `${e.key}: pin v${pin} != versions[0].latest_patch v${cur.latest_patch}`, `run scripts/bump-engine-version.mjs ${e.key} ${pin}`);
  if (typeof d.image === "string" && pin && !d.image.includes(pin))
    add("error", "F1", `${e.key}: image "${d.image}" does not embed pin v${pin}`, `update the image tag to v${pin}`);
}

// F2..F5 — per-model
const vllmNative = new Set(support.vllm.native_architectures || []);
const usedArch = new Set();
for (const m of models) {
  if (m._review) add("error", "F2", `model "${m.id}" has a leftover _review (unfinished add)`, "resolve every _review item from the model card, then remove _review");
  // F3 data sanity
  for (const [k] of [["n_layers"], ["hidden"], ["kv_dim"], ["context"]])
    if (!(m[k] > 0)) add("error", "F3", `model "${m.id}": ${k} must be > 0 (got ${m[k]})`, "fill from config.json");
  if (m.total_params_b == null) add("warn", "F3", `model "${m.id}": total_params_b missing`, "fill from the model card / safetensors index");
  if (m.moe) {
    if (m.total_params_b != null && m.active_params_b != null && !(m.active_params_b < m.total_params_b))
      add("error", "F3", `model "${m.id}": MoE active (${m.active_params_b}) must be < total (${m.total_params_b})`, "recheck router math");
    if (m.n_experts != null && !(m.n_experts > 1)) add("warn", "F3", `model "${m.id}": MoE n_experts should be > 1`, "recheck n_experts");
  }
  // F4 vLLM verdict ↔ arch
  const v = m.vllm || {};
  if (v.tier === "native") {
    if (!v.arch) add("error", "F4", `model "${m.id}": vllm tier native but arch is null`, "set vllm.arch or lower the tier");
    else if (!vllmNative.has(v.arch)) add("error", "F4", `model "${m.id}": vllm arch ${v.arch} not in native_architectures`, `add ${v.arch} to vllm-support native_architectures or lower the tier`);
  }
  if (v.arch) usedArch.add(v.arch);
}

// F5 — tool_calling coverage for arches curated models actually use
for (const arch of usedArch) {
  for (const e of ENG) {
    const tc = support[e.key].tool_calling || {};
    if (!tc[arch]) add("info", "F5", `${e.key}: no tool_calling entry for arch ${arch} (falls to _default)`, `add ${arch} to ${e.file} tool_calling`);
  }
}

// F6 — i18n leak (surfaced Korean data strings must have an EN DATA entry)
{
  const i18nSrc = fs.readFileSync(path.join(root, "assets/i18n.js"), "utf8");
  const dataStart = i18nSrc.indexOf("const DATA = {");
  const dataKeys = new Set();
  for (const mm of i18nSrc.slice(dataStart, i18nSrc.indexOf("};", dataStart)).matchAll(/^\s{4}"((?:[^"\\]|\\.)+?)":\s*"/gm)) dataKeys.add(mm[1]);
  const surface = new Set();
  for (const m of models) { if (m.note) surface.add(m.note); for (const k of ["vllm", "sglang", "trtllm"]) if (m[k]) (m[k].caveats || []).forEach(c => surface.add(c)); }
  for (const e of ENG) { const d = support[e.key];
    if (d.tier_help) Object.values(d.tier_help).forEach(s => surface.add(s));
    if (d.arch_support) Object.values(d.arch_support).forEach(a => (a.caveats || []).forEach(c => surface.add(c)));
    if (d.hardware && d.hardware.note) surface.add(d.hardware.note); }
  const speech = read("data/speech.json");
  for (const k of ["image", "selfhost", "api"]) (speech[k] || []).forEach(x => ["note", "unit", "params", "vram"].forEach(f => { if (x[f] && /[가-힣]/.test(x[f])) surface.add(x[f]); }));
  for (const s of surface) if (/[가-힣]/.test(s) && !dataKeys.has(s)) add("error", "F6", `i18n leak: surfaced Korean string has no EN DATA entry: "${s.slice(0, 50)}…"`, "add a DATA (ko->en) entry in assets/i18n.js");
}

// N1/N2 — network liveness (optional)
if (doNetwork) {
  const head = async (url) => { try { const r = await fetch(url, { method: "GET", headers: { "user-agent": "llm-calc-health" } }); return r.status; } catch { return 0; } };
  for (const m of models) {
    if (!m.hf) continue;
    const st = await head(`https://huggingface.co/${m.hf}`);
    // 401/403 = gated or unreleased (e.g. pre-release weights) — noted, not broken. 404/0/5xx = real problem.
    if (st === 401 || st === 403) add("warn", "N1", `model "${m.id}": HF repo ${m.hf} gated/unreleased (HTTP ${st})`, "expected for pre-release/gated; verify it goes public as noted");
    else if (st === 0 || st >= 404) add("error", "N1", `model "${m.id}": HF repo ${m.hf} unreachable (HTTP ${st})`, "fix the hf id or remove the model");
  }
  const links = new Set();
  for (const e of ENG) { const d = support[e.key]; if (d.docs) links.add(d.docs); (d.versions || []).forEach(v => v.docs && links.add(v.docs)); }
  for (const url of links) { const st = await head(url); if (st === 0 || st >= 400) add("warn", "N2", `doc link unreachable (HTTP ${st}): ${url}`, "update the docs URL"); }
}

const bySev = { error: 0, warn: 0, info: 0 };
findings.forEach(f => bySev[f.severity]++);
const report = { generated_utc: new Date().toISOString(), network: doNetwork, counts: bySev, findings };
fs.mkdirSync(path.join(root, "audit"), { recursive: true });
fs.writeFileSync(path.join(root, "audit/health-report.json"), JSON.stringify(report, null, 2) + "\n");

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`health audit · ${report.generated_utc} · ${doNetwork ? "network" : "structural"}`);
  console.log(`  errors ${bySev.error} · warns ${bySev.warn} · info ${bySev.info}`);
  const icon = { error: "❌", warn: "⚠️ ", info: "ℹ️ " };
  for (const f of findings) console.log(`  ${icon[f.severity]}[${f.code}] ${f.msg}${f.fix ? `\n        → ${f.fix}` : ""}`);
  if (!findings.length) console.log("  ✅ no problems found");
}

const rank = { error: 3, warn: 2, info: 1 };
const worst = findings.reduce((a, f) => Math.max(a, rank[f.severity]), 0);
process.exit(failOn && worst >= (rank[failOn] || 3) ? 6 : 0);
