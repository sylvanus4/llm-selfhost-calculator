#!/usr/bin/env node
/* Daily engine-version drift check for llm-selfhost-calculator.
   Fetches the latest released version of vLLM (PyPI), SGLang (PyPI) and
   TensorRT-LLM (GitHub releases), compares each to the version pinned in the
   matching data/*-support.json, and reports drift.

   Pure reporting — it NEVER edits data files. Feature-highlight prose must be
   curated by a human/LLM (anti-fabrication), so this only surfaces the delta.
   Use scripts/bump-engine-version.mjs to apply the mechanical version bump.

   Usage:
     node scripts/check-engine-versions.mjs                # human report -> stdout
     node scripts/check-engine-versions.mjs --json         # machine JSON -> stdout
     node scripts/check-engine-versions.mjs --fail-on-drift # exit 3 if any drift (for CI gate)
   Writes audit/engine-version-report.json always. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const failOnDrift = args.has("--fail-on-drift");

// Which data file holds the pin, the field name, and how to fetch upstream latest.
const ENGINES = [
  { key: "vllm", label: "vLLM", file: "data/vllm-support.json", pinField: "vllm_version",
    fetch: () => pypiLatest("vllm") },
  { key: "sglang", label: "SGLang", file: "data/sglang-support.json", pinField: "version",
    fetch: () => pypiLatest("sglang") },
  { key: "trtllm", label: "TensorRT-LLM", file: "data/trtllm-support.json", pinField: "version",
    fetch: () => githubLatest("NVIDIA", "TensorRT-LLM") },
];

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "user-agent": "llm-selfhost-calc-version-check", ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function pypiLatest(pkg) {
  const d = await getJson(`https://pypi.org/pypi/${pkg}/json`);
  return String(d.info.version);
}
async function githubLatest(owner, repo) {
  const headers = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  try {
    const d = await getJson(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, headers);
    return String(d.tag_name || d.name || "").replace(/^v/i, "");
  } catch {
    // fall back to tags (some repos have no "latest release")
    const tags = await getJson(`https://api.github.com/repos/${owner}/${repo}/tags`, headers);
    return String((tags[0] && tags[0].name) || "").replace(/^v/i, "");
  }
}

// semver-ish compare of dotted numeric versions; returns 1 if a>b, -1 if a<b, 0 if equal.
function cmpVer(a, b) {
  const pa = String(a).split(/[.+-]/).map(Number), pb = String(b).split(/[.+-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return String(a) === String(b) ? 0 : (String(a) < String(b) ? -1 : 1);
    if (x > y) return 1; if (x < y) return -1;
  }
  return 0;
}

const results = [];
for (const e of ENGINES) {
  const data = JSON.parse(fs.readFileSync(path.join(root, e.file), "utf8"));
  const pinned = String(data[e.pinField] || "");
  let latest = null, error = null, drift = false, cmp = 0;
  try {
    latest = await e.fetch();
    cmp = cmpVer(latest, pinned);
    drift = cmp > 0;                                  // upstream is newer than the pin
  } catch (err) { error = String(err.message || err); }
  results.push({ engine: e.key, label: e.label, pinned, latest, drift, cmp, error, file: e.file, pinField: e.pinField });
}

const report = { generated_utc: new Date().toISOString(), any_drift: results.some(r => r.drift),
  any_error: results.some(r => r.error), results };

fs.mkdirSync(path.join(root, "audit"), { recursive: true });
fs.writeFileSync(path.join(root, "audit/engine-version-report.json"), JSON.stringify(report, null, 2) + "\n");

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`engine version check · ${report.generated_utc}`);
  for (const r of results) {
    const status = r.error ? `ERROR (${r.error})` : r.drift ? `DRIFT: pinned v${r.pinned} < upstream v${r.latest}`
      : `up to date (v${r.pinned}${r.latest && r.latest !== r.pinned ? ` · upstream v${r.latest}` : ""})`;
    console.log(`  ${r.drift ? "⚠️ " : r.error ? "❓ " : "✅ "}${r.label.padEnd(14)} ${status}`);
  }
  if (report.any_drift) console.log("\nDrift found — curate data/*-support.json (versions[] highlights need human/LLM prose) then bump the pin.");
}

// GitHub Actions step output (drift flag) when running in CI.
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `drift=${report.any_drift}\n`);
}

process.exit(failOnDrift && report.any_drift ? 3 : 0);
