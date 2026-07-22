/* Objective gate for the shipped health audit (scripts/health-audit.mjs, structural mode).
   Run: node test/health-audit.test.cjs
   Fails CI if the audit reports ANY error-severity structural problem (version/image
   drift, leftover _review, bad dims, vLLM verdict↔arch mismatch, i18n leak). Network
   checks (HF/doc liveness) are NOT run here — they're for the daily maintainer run. */
const { execFileSync } = require("child_process");
const path = require("path");
const root = path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }

console.log("health-audit gate (structural):");
let report;
try {
  const out = execFileSync("node", ["scripts/health-audit.mjs", "--json"], { cwd: root, encoding: "utf8" });
  report = JSON.parse(out);
} catch (e) { report = null; ok("audit runs and emits JSON", false); }

if (report) {
  ok("audit runs and emits JSON", true);
  ok("audit executed checks (findings is an array)", Array.isArray(report.findings));
  const errs = report.findings.filter(f => f.severity === "error");
  ok("no error-severity structural findings (" + report.counts.error + ")", errs.length === 0);
  if (errs.length) errs.slice(0, 10).forEach(f => console.log(`      [${f.code}] ${f.msg}`));
}

console.log(`\nhealth-audit.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
