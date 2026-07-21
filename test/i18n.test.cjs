/* Objective gate for i18n coverage. Run: node test/i18n.test.cjs
   Ensures: (1) every data-i18n* key in index.html exists in both ko and en UI dicts,
   (2) ko and en UI key sets are identical (no half-translated key),
   (3) every Korean string that surfaces from the data files (model notes, caveats,
   tier_help, hardware notes, speech notes) has a DATA (ko->en) entry — so EN mode
   never leaks Korean. Extraction is by regex over the source (no browser needed). */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const src = fs.readFileSync(path.join(root, "assets/i18n.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function keysInBlock(block) {
  const set = new Set();
  for (const m of block.matchAll(/^\s{6}"((?:[^"\\]|\\.)+?)":/gm)) set.add(m[1]);
  return set;
}
const koStart = src.indexOf("ko: {"), enStart = src.indexOf("en: {"), dataStart = src.indexOf("const DATA = {");
const koKeys = keysInBlock(src.slice(koStart, enStart));
const enKeys = keysInBlock(src.slice(enStart, dataStart));
// DATA keys (4-space indent inside the object literal)
const dataKeys = new Set();
for (const m of src.slice(dataStart, src.indexOf("};", dataStart)).matchAll(/^\s{4}"((?:[^"\\]|\\.)+?)":\s*"/gm)) dataKeys.add(m[1]);

const htmlKeys = new Set();
for (const m of html.matchAll(/data-i18n(?:-html|-ph)?="([^"]+)"/g)) htmlKeys.add(m[1]);

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }

console.log("i18n.js gate:");
ok("ko/en key sets identical", koKeys.size === enKeys.size && [...koKeys].every(k => enKeys.has(k)));
ok("ko UI has keys", koKeys.size > 100);
let htmlMiss = [];
for (const k of htmlKeys) { if (!koKeys.has(k) || !enKeys.has(k)) htmlMiss.push(k); }
ok("every data-i18n key exists in ko+en (" + htmlKeys.size + " keys)", htmlMiss.length === 0);
if (htmlMiss.length) console.log("    missing:", htmlMiss.join(", "));

// data-file Korean strings that surface -> must be DATA keys
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const surface = new Set();
for (const m of models) { if (m.note) surface.add(m.note); for (const e of ["vllm", "sglang", "trtllm"]) if (m[e]) (m[e].caveats || []).forEach(c => surface.add(c)); }
for (const f of ["vllm-support", "sglang-support", "trtllm-support"]) {
  const d = JSON.parse(fs.readFileSync(path.join(root, "data/" + f + ".json")));
  if (d.tier_help) Object.values(d.tier_help).forEach(v => surface.add(v));
  if (d.arch_support) Object.values(d.arch_support).forEach(a => (a.caveats || []).forEach(c => surface.add(c)));
  if (d.hardware && d.hardware.note) surface.add(d.hardware.note);
}
const speech = JSON.parse(fs.readFileSync(path.join(root, "data/speech.json")));
for (const k of ["image", "selfhost", "api"]) (speech[k] || []).forEach(x => { if (x.note && /[가-힣]/.test(x.note)) surface.add(x.note); });

const dataMiss = [...surface].filter(s => !dataKeys.has(s));
ok("every surfaced data string has an EN translation (" + surface.size + " strings)", dataMiss.length === 0);
if (dataMiss.length) { console.log("    untranslated (would leak Korean in EN mode):"); dataMiss.slice(0, 10).forEach(s => console.log("      - " + s.slice(0, 70))); }

console.log(`\ni18n.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
