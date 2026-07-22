/* Objective gate for the deterministic new-model builder (scripts/add-model.mjs).
   Run: node test/add-model.test.cjs
   Runs the SHIPPED script in offline (--config) mode against fixtures and asserts the
   computed entry: GQA kv_dim, MoE detection, arch->engine verdict matching, and the
   honest _review flags (no fabricated params). Offline mode must NEVER --apply. */
const { execFileSync } = require("child_process");
const path = require("path");
const root = path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }
function build(fixture, extra = []) {
  // dry-run against a fixture always exits 5 (offline -> _review flags); stdout still carries the JSON.
  let out;
  try {
    out = execFileSync("node", ["scripts/add-model.mjs", "--config", "test/fixtures/" + fixture, "--hf", "Owner/Name", ...extra],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    if (e.status === 5 && e.stdout) out = e.stdout; else throw e;
  }
  return JSON.parse(out);
}

console.log("add-model gate:");

// dense Qwen3 -> native everywhere, GQA kv_dim = n_kv_heads * head_dim = 8*128
const dense = build("config-dense.json", ["--name", "Dense T"]);
ok("dense: id slug", dense.id === "dense-t");
ok("dense: kv_dim = 8*128 = 1024", dense.kv_dim === 1024);
ok("dense: moe false", dense.moe === false);
ok("dense: n_layers/hidden/context read", dense.n_layers === 48 && dense.hidden === 5120 && dense.context === 262144);
ok("dense: vllm native (arch matched)", dense.vllm.tier === "native" && dense.vllm.arch === "Qwen3ForCausalLM");
ok("dense: sglang+trtllm native", dense.sglang.tier === "native" && dense.trtllm.tier === "native");
ok("dense: honest _review for unknown params (offline)", Array.isArray(dense._review) && dense._review.some(s => /total_params_b/.test(s)));

// MoE -> moe true, n_experts carried, kv_dim = 4*128
const moe = build("config-moe.json");
ok("moe: detected", moe.moe === true && moe.n_experts === 128);
ok("moe: kv_dim = 4*128 = 512", moe.kv_dim === 512);
ok("moe: active_params flagged for review", moe._review.some(s => /active_params/.test(s)));

// unknown arch + custom code -> vllm custom, engines unsupported
const unk = build("config-unknown.json");
ok("unknown+custom: vllm custom", unk.vllm.tier === "custom");
ok("unknown: sglang/trtllm unsupported", unk.sglang.tier === "unsupported" && unk.trtllm.tier === "unsupported");

// offline --apply must be refused (can't ship with _review / fabricate params) -> exit 5
let applyRefused = false;
try { execFileSync("node", ["scripts/add-model.mjs", "--config", "test/fixtures/config-dense.json", "--hf", "Owner/Name", "--apply"],
  { cwd: root, stdio: "ignore" }); }
catch (e) { applyRefused = e.status === 5; }
ok("offline --apply refused with exit 5 (no fabrication)", applyRefused);

console.log(`\nadd-model.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
