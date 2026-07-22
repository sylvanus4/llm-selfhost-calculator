/* Objective gate for the engine version-history + per-model tool-calling schema.
   Run: node test/versions-tools.test.cjs
   Loads the SHIPPED compute.js + support data, asserts:
   (1) each engine has >=1 version card with version/docs and highlights that carry
       BOTH ko and en (no EN leak in the versions block),
   (2) tool_calling has a _default and every entry's note (if present) carries ko+en,
   (3) toolCallingConfig resolves for every curated model's arch on all three engines
       and the emitted flags are consistent with the resolved parser + engine syntax. */
const fs = require("fs");
const path = require("path");
const C = require("../assets/compute.js");

const root = path.join(__dirname, "..");
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const support = {
  vllm: JSON.parse(fs.readFileSync(path.join(root, "data/vllm-support.json"))),
  sglang: JSON.parse(fs.readFileSync(path.join(root, "data/sglang-support.json"))),
  trtllm: JSON.parse(fs.readFileSync(path.join(root, "data/trtllm-support.json"))),
};

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }
const bilingual = o => o && typeof o === "object" && typeof o.ko === "string" && o.ko.trim() && typeof o.en === "string" && o.en.trim();

console.log("versions+tools gate:");

for (const engine of ["vllm", "sglang", "trtllm"]) {
  const sup = support[engine];
  const vers = C.engineVersionHistory(sup);
  ok(engine + ": >=3 version cards", vers.length >= 3);
  let verOk = true, hiOk = true, flagOk = true;
  for (const v of vers) {
    if (!v.version || !v.docs) verOk = false;
    for (const h of (v.highlights || [])) if (!bilingual(h)) hiOk = false;
    if (!(v.highlights || []).length) hiOk = false;               // must have highlights
    if (!Array.isArray(v.notable_flags) || !v.notable_flags.length) flagOk = false;
  }
  ok(engine + ": every version has version+docs", verOk);
  ok(engine + ": every highlight is bilingual {ko,en} (no EN leak)", hiOk);
  ok(engine + ": every version lists notable_flags", flagOk);

  const tc = sup.tool_calling;
  ok(engine + ": tool_calling has _default", tc && tc._default !== undefined);
  let noteOk = true, parserOk = true;
  for (const [k, v] of Object.entries(tc || {})) {
    if (k.startsWith("_")) { if (k === "_default" && v.note && !bilingual(v.note)) noteOk = false; continue; }
    if (v.note && !bilingual(v.note)) noteOk = false;
    // tool_parser present -> must be a non-empty string; null is allowed (honest "unconfirmed")
    if (v.tool_parser !== null && (typeof v.tool_parser !== "string" || !v.tool_parser)) parserOk = false;
  }
  ok(engine + ": every tool_calling note is bilingual {ko,en}", noteOk);
  ok(engine + ": tool_parser values are string|null", parserOk);
}

// toolCallingConfig resolves for every curated model on every engine, flags consistent.
let resolveOk = true, flagConsistent = true, resolvedCount = 0, withParser = 0;
for (const m of models) {
  for (const engine of ["vllm", "sglang", "trtllm"]) {
    const arch = (m.vllm && m.vllm.arch) || null;   // canonical arch lives on model.vllm.arch
    const cfg = C.toolCallingConfig(arch, m, support[engine], engine);
    if (!cfg || cfg.source == null || !Array.isArray(cfg.flags)) { resolveOk = false; continue; }
    resolvedCount++;
    if (cfg.tool_parser) {
      withParser++;
      // flags must reference the resolved parser; empty iff no parser
      const joined = cfg.flags.join(" ");
      if (!cfg.flags.length || joined.indexOf(cfg.tool_parser) === -1) flagConsistent = false;
      if (cfg.reasoning_parser && joined.indexOf(cfg.reasoning_parser) === -1) flagConsistent = false;
      // engine-specific flag syntax
      if (engine === "trtllm" && joined.indexOf("--tool_call_parser") === -1) flagConsistent = false;
      if (engine === "sglang" && joined.indexOf("--tool-call-parser") === -1) flagConsistent = false;
      if (engine === "vllm" && joined.indexOf("--enable-auto-tool-choice") === -1) flagConsistent = false;
    } else if (cfg.flags.length !== 0) flagConsistent = false;   // no parser -> no flags
  }
}
ok("toolCallingConfig resolves for all curated models × 3 engines (" + resolvedCount + ")", resolveOk && resolvedCount === models.length * 3);
ok("emitted tool flags reference the resolved parser + engine syntax (" + withParser + " with parser)", flagConsistent);

console.log(`\nversions+tools.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
