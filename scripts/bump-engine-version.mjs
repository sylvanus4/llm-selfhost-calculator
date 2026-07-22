#!/usr/bin/env node
/* Mechanically apply an engine version bump to data/<engine>-support.json.
   Targeted TEXT edits (not full re-serialize) so the compact arch_support/tool_calling
   formatting is preserved and the diff stays minimal.

   ONLY numeric facts are auto-applied: the version pin + the matching version card's
   latest_patch. When the MINOR changes (e.g. 1.2 -> 1.3) a stub card is prepended with
   TODO highlights — feature-highlight prose is NEVER fabricated; a human/LLM fills it
   from the release notes (anti-fabrication).

   Usage: node scripts/bump-engine-version.mjs <vllm|sglang|trtllm> <newVersion>
   Exit 0 = applied · 2 = usage/error · 4 = new-minor stub added (needs highlight prose). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [engine, newVer] = process.argv.slice(2);
const CFG = {
  vllm: { file: "data/vllm-support.json", pinField: "vllm_version" },
  sglang: { file: "data/sglang-support.json", pinField: "version" },
  trtllm: { file: "data/trtllm-support.json", pinField: "version" },
};
if (!CFG[engine] || !newVer || !/^\d+\.\d+/.test(newVer)) {
  console.error("usage: node scripts/bump-engine-version.mjs <vllm|sglang|trtllm> <newVersion e.g. 1.2.1>");
  process.exit(2);
}
const { file, pinField } = CFG[engine];
const fp = path.join(root, file);
let text = fs.readFileSync(fp, "utf8");
const data = JSON.parse(text);
const oldPin = String(data[pinField] || "");
const minorOf = v => String(v).split(".").slice(0, 2).join(".");
const newMinor = minorOf(newVer);
const today = new Date().toISOString().slice(0, 10);

function replaceOnce(re, repl, label) {
  if (!re.test(text)) throw new Error("could not locate " + label);
  text = text.replace(re, repl);
}

// 1) version pin  (e.g. "vllm_version": "0.25.1")
replaceOnce(new RegExp(`("${pinField}":\\s*")${oldPin.replace(/[.]/g, "\\.")}(")`), `$1${newVer}$2`, "pin field");
// 2) _updated date
text = text.replace(/("_updated":\s*")[0-9-]+(")/, `$1${today}$2`);
// 2b) container image tag when it embeds the pinned version (sglang/trtllm; vLLM builds its image from the pin)
if (typeof data.image === "string" && oldPin && data.image.includes(oldPin)) {
  const newImage = data.image.replace(oldPin, newVer);
  replaceOnce(new RegExp(`("image":\\s*")${data.image.replace(/[.\\/]/g, s => "\\" + s)}(")`), `$1${newImage}$2`, "image tag");
}

let exit = 0;
const cards = data.versions || [];
const cur = cards[0];
if (cur && minorOf(cur.version) === newMinor) {
  // same minor -> just bump latest_patch of the first (current) card
  const oldLp = cur.latest_patch || cur.version;
  replaceOnce(new RegExp(`("latest_patch":\\s*")${String(oldLp).replace(/[.]/g, "\\.")}(")`), `$1${newVer}$2`, "latest_patch");
  console.log(`${engine}: pin ${oldPin} -> ${newVer} (patch bump within v${newMinor})`);
} else {
  // new minor -> prepend a stub card with TODO highlights (prose curated by human/LLM)
  const docs = (cur && cur.docs) || data.docs || "";
  const stub = {
    version: newMinor, latest_patch: newVer, released: today.slice(0, 7), docs,
    highlights: [
      { ko: "[TODO] 릴리스 노트에서 핵심 변경을 요약 — 새 아키텍처/양자화/툴 파서 등", en: "[TODO] Summarize key changes from the release notes — new arch/quant/tool parsers, etc." },
    ],
    notable_flags: [],
  };
  const stubJson = JSON.stringify(stub, null, 6).replace(/\n/g, "\n    ");
  replaceOnce(/("versions":\s*\[\s*\n)/, `$1    ${stubJson},\n`, "versions array open");
  console.log(`${engine}: pin ${oldPin} -> ${newVer} · prepended stub card v${newMinor} (⚠️ fill highlights from release notes)`);
  exit = 4;
}

// keep only the most-recent 3 cards if we grew past 3 (trim the oldest, structurally via re-read)
const after = JSON.parse(text);
if ((after.versions || []).length > 3) {
  console.log(`  note: versions[] now has ${after.versions.length} cards — trim the oldest to keep recent 3 (manual, to preserve formatting).`);
}

// sanity: still valid JSON
JSON.parse(text);
fs.writeFileSync(fp, text);
console.log(`wrote ${file}`);
process.exit(exit);
