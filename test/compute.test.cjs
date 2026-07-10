/* Objective gate for the estimation core. Run: node test/compute.test.cjs
   Loads the SHIPPED compute.js + SHIPPED data files, asserts defensible properties
   including multi-GPU fan-out for trillion-param MoE models. */
const fs = require("fs");
const path = require("path");
const { compute } = require("../assets/compute.js");

const root = path.join(__dirname, "..");
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const gpus = JSON.parse(fs.readFileSync(path.join(root, "data/gpus.json"))).gpus;
const M = id => { const m = models.find(x => x.id === id); if (!m) throw new Error("missing model " + id); return m; };
const G = id => { const g = gpus.find(x => x.id === id); if (!g) throw new Error("missing gpu " + id); return g; };

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }
function near(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

console.log("compute.js gate:");

// 1. Weights math exact
ok("8B fp16 weights = 16GB", near(compute(M("qwen3-8b"), G("h100-80"), "fp16", 8192, 1, null, 1).weightsGB, 16));
ok("8B int4 weights = 4GB", near(compute(M("qwen3-8b"), G("h100-80"), "int4", 8192, 1, null, 1).weightsGB, 4));

// 2. Single-GPU fit for a mid dense model; small model = 1 GPU
ok("Qwen3.6-27B int4 fits H100-80 @8k", compute(M("qwen3.6-27b"), G("h100-80"), "int4", 8192, 1, null, 1).fits === true);
ok("Qwen3-8B needs exactly 1 GPU", compute(M("qwen3-8b"), G("h100-80"), "int4", 8192, 1, null, 1).gpusNeeded === 1);

// 3. Trillion-param MoE fans out across many GPUs (does NOT fit one, gpusNeeded > 1)
const kimi = compute(M("kimi-k2.7-code"), G("h100-80"), "int4", 8192, 1, null, 1);
ok("Kimi K2.7 (1T) does not fit one H100", kimi.fits === false);
ok("Kimi K2.7 needs multiple GPUs", kimi.gpusNeeded > 1);
const dsp = compute(M("deepseek-v4-pro"), G("h100-80"), "int4", 8192, 1, null, 1);
ok("DeepSeek-V4-Pro (1.6T) needs even more GPUs than Kimi", dsp.gpusNeeded > kimi.gpusNeeded);

// 4. Longer context -> more VRAM
const shortV = compute(M("qwen3.6-27b"), G("h100-80"), "fp16", 4096, 1, null, 1).vramSingle;
const longV = compute(M("qwen3.6-27b"), G("h100-80"), "fp16", 262144, 1, null, 1).vramSingle;
ok("longer context -> more VRAM", longV > shortV);

// 5. MoE decodes faster than a same-quant dense model (active params win)
const flash = compute(M("deepseek-v4-flash"), G("h100-80"), "int4", 8192, 1, null, 1).singleTokS;
const dense27 = compute(M("qwen3.6-27b"), G("h100-80"), "int4", 8192, 1, null, 1).singleTokS;
ok("MoE flash tok/s > dense 27B tok/s", flash > dense27);

// 6. Cost scales with the fleet; verdict defined; dear API -> self-host
const c = compute(M("kimi-k2.7-code"), G("h100-80"), "int4", 8192, 32, null, 0.8);
ok("fleet rent = rent * gpusNeeded", near(c.fleetRentHr, (G("h100-80").rent_usd_hr) * c.gpusNeeded, 0.001));
ok("selfHostPer1m positive", c.selfHostPer1m > 0);
ok("dear API -> self-host wins", compute(M("qwen3-8b"), G("h100-80"), "int4", 8192, 32, null, 20).verdict === "self");
ok("verdict defined for cloud GPU", c.verdict === "self" || c.verdict === "api");

// 7. Apple (owned) -> null rent, still tok/s, gpusNeeded computed
const apple = compute(M("qwen3.6-27b"), G("m2-ultra-192"), "int4", 8192, 1, null, 0.8);
ok("Apple owned -> null selfHostPer1m", apple.selfHostPer1m === null);
ok("Apple still yields tok/s", apple.singleTokS > 0);

// 8. gpusNeeded always >= 1; all numbers finite on H200 int4
let allFinite = true, allGpu = true;
for (const m of models) {
  const x = compute(m, G("h200"), "int4", 8192, 16, null, 0.8);
  if (![x.weightsGB, x.vramSingle, x.singleTokS, x.servingTokS, x.selfHostPer1m].every(Number.isFinite)) allFinite = false;
  if (!(x.gpusNeeded >= 1)) allGpu = false;
}
ok("all models finite on H200", allFinite);
ok("gpusNeeded >= 1 for all", allGpu);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
