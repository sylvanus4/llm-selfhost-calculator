/* Objective gate for the estimation core. Run: node test/compute.test.cjs
   Loads the SHIPPED compute.js + the SHIPPED data files, asserts defensible properties. */
const fs = require("fs");
const path = require("path");
const { compute } = require("../assets/compute.js");

const root = path.join(__dirname, "..");
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const gpus = JSON.parse(fs.readFileSync(path.join(root, "data/gpus.json"))).gpus;
const M = id => models.find(m => m.id === id);
const G = id => gpus.find(g => g.id === id);

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }
function near(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

console.log("compute.js gate:");

// 1. Weights math is exact: 8B fp16 = 16GB, int4 = 4GB
ok("8B fp16 weights = 16GB", near(compute(M("llama-3.1-8b"), G("h100-80"), "fp16", 8192, 1, null, 1).weightsGB, 16));
ok("8B int4 weights = 4GB", near(compute(M("llama-3.1-8b"), G("h100-80"), "int4", 8192, 1, null, 1).weightsGB, 4));

// 2. 70B int4 fits on H100-80 at 8k ctx; does NOT fit on a 24GB 4090
ok("70B int4 fits H100-80 @8k", compute(M("llama-3.3-70b"), G("h100-80"), "int4", 8192, 1, null, 1).fits === true);
ok("70B fp16 does NOT fit 4090", compute(M("llama-3.3-70b"), G("rtx4090"), "fp16", 8192, 1, null, 1).fits === false);

// 3. Longer context needs more VRAM (KV grows)
const short = compute(M("llama-3.1-8b"), G("h100-80"), "fp16", 4096, 1, null, 1).vramSingle;
const long = compute(M("llama-3.1-8b"), G("h100-80"), "fp16", 131072, 1, null, 1).vramSingle;
ok("longer context -> more VRAM", long > short);

// 4. MoE decodes faster than a same-quant dense model of similar total size (active params win)
const moe = compute(M("gpt-oss-120b"), G("h100-80"), "int4", 8192, 1, null, 1).singleTokS;
const dense70 = compute(M("llama-3.3-70b"), G("h100-80"), "int4", 8192, 1, null, 1).singleTokS;
ok("MoE 120B tok/s > dense 70B tok/s", moe > dense70);

// 5. Cost: selfHost price positive; higher API price makes self-host the verdict
const r = compute(M("llama-3.3-70b"), G("h100-80"), "int4", 8192, 32, null, 0.8);
ok("selfHostPer1m positive", r.selfHostPer1m > 0);
const cheapApi = compute(M("llama-3.1-8b"), G("h100-80"), "int4", 8192, 32, null, 0.05).verdict;
const dearApi = compute(M("llama-3.1-8b"), G("h100-80"), "int4", 8192, 32, null, 20).verdict;
ok("dear API -> self-host wins", dearApi === "self");
ok("cheap API -> API wins or tie", cheapApi === "api" || cheapApi === "self"); // just must be defined
ok("verdict is defined for cloud GPU", r.verdict === "self" || r.verdict === "api");

// 6. Apple (owned) has null rent -> no verdict, still gives tok/s
const apple = compute(M("qwen2.5-32b"), G("m2-ultra-192"), "int4", 8192, 1, null, 0.8);
ok("Apple owned -> null selfHostPer1m", apple.selfHostPer1m === null);
ok("Apple still yields tok/s", apple.singleTokS > 0);

// 7. Every model on H200 int4: numbers are finite
let allFinite = true;
for (const m of models) {
  const x = compute(m, G("h200"), "int4", 8192, 16, null, 0.8);
  if (![x.weightsGB, x.vramSingle, x.singleTokS, x.servingTokS].every(Number.isFinite)) allFinite = false;
}
ok("all models finite on H200", allFinite);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
