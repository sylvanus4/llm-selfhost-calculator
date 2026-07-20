/* Objective gate for the Spark cluster / per-node memory core (howtospark-style).
   Run: node test/spark.test.cjs
   Loads the SHIPPED compute.js + data/models.json, asserts the split/fit/tokS model
   against structural invariants and the howtospark.com recipe golden anchors
   (test/golden/howtospark.json). Numeric bounds are loose on purpose — this is a
   planning approximation, not a per-tensor reproduction. */
const fs = require("fs");
const path = require("path");
const C = require("../assets/compute.js");

const root = path.join(__dirname, "..");
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const gpus = JSON.parse(fs.readFileSync(path.join(root, "data/gpus.json"))).gpus;
// Golden anchors documented in test/golden/howtospark.json (harvested from howtospark.com recipes).

const M = id => models.find(m => m.id === id);
const G = id => gpus.find(g => g.id === id);
const spark = G("dgx-spark");

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }
function near(name, got, want, tolPct) {
  const d = Math.abs(got - want) / (Math.abs(want) || 1) * 100;
  const cond = d <= tolPct;
  cond ? (pass++, console.log(`  PASS ${name} (${got.toFixed(1)} ~ ${want} ±${tolPct}%)`))
       : (fail++, console.log(`  FAIL ${name} (${got.toFixed(1)} vs ${want}, off ${d.toFixed(1)}%)`));
}

console.log("spark.js gate:");

// 1. Part split invariant: dense + expert == total; non-MoE -> all dense.
for (const m of models) {
  const p = C.sparkParts(m);
  ok(`split sums total: ${m.id}`, Math.abs((p.denseB + p.expertB) - m.total_params_b) < 0.01);
  if (!m.moe) ok(`non-moe all dense: ${m.id}`, p.expertB === 0 && p.denseB === m.total_params_b);
}

// 2. Grounded dense fields are used (not estimated) for recipe-anchored models.
ok("glm-5.2 dense grounded", C.sparkParts(M("glm-5.2")).estimated === false);
ok("deepseek-v4-flash dense grounded", C.sparkParts(M("deepseek-v4-flash")).estimated === false);

// 3. DGX Spark usable ~114 GiB (128 - ~14 reserve).
near("dgx-spark usable", C.sparkUsableGB(spark), 114, 5);

// 4. GLM-5.2 golden: 2 nodes, 2-bit experts, REAP 18.75% -> ~79 GB expert planes/rank.
{
  const f = C.sparkFit(M("glm-5.2"), spark, 2, "e2_fp8", 18.75, 8192, "mtp");
  near("glm expert planes/rank (pruned)", f.perNode[0].expertGB, 79, 20);
  const full = C.sparkFit(M("glm-5.2"), spark, 2, "e2_fp8", 0, 8192, "mtp");
  near("glm expert planes/rank (full-pool)", full.perNode[0].expertGB, 95, 20);
  ok("REAP shrinks expert planes", f.perNode[0].expertGB < full.perNode[0].expertGB);
  ok("glm experts kept 208/256", Math.abs(f.expertsKept - 208) <= 2);
}

// 5. DeepSeek-V4-Flash golden: 2 nodes, FP4 experts (int4) -> ~66 GB expert planes/rank.
{
  const f = C.sparkFit(M("deepseek-v4-flash"), spark, 2, "int4", 0, 1048576, "draft");
  near("deepseek expert planes/rank", f.perNode[0].expertGB, 66, 20);
}

// 6. tok/s scales ~linearly with node count (bandwidth-bound), REAP does not change it.
{
  const one = C.sparkTokS(M("glm-5.2"), spark, 1, C.SPARK_QUANT.find(q => q.id === "e2_nvfp4"), "off");
  const three = C.sparkTokS(M("glm-5.2"), spark, 3, C.SPARK_QUANT.find(q => q.id === "e2_nvfp4"), "off");
  near("tokS 3x/1x ~ 2.4 (3*0.8)", three / one, 2.4, 8);
  const a = C.sparkFit(M("glm-5.2"), spark, 2, "e2_nvfp4", 0, 8192, "off").tokS;
  const b = C.sparkFit(M("glm-5.2"), spark, 2, "e2_nvfp4", 40, 8192, "off").tokS;
  ok("REAP leaves tokS unchanged", Math.abs(a - b) < 0.01);
}

// 7. Spec-decode multiplies tok/s; per-node pct = used/usable; fit flips when overfilled.
{
  const off = C.sparkFit(M("glm-5.2"), spark, 2, "int8", 0, 8192, "off").tokS;
  const mtp = C.sparkFit(M("glm-5.2"), spark, 2, "int8", 0, 8192, "mtp").tokS;
  near("mtp spec x1.6", mtp / off, 1.6, 1);
  const f = C.sparkFit(M("glm-5.2"), spark, 2, "e2_nvfp4", 0, 8192, "off");
  near("pct == used/usable", f.perNode[0].pct, f.perNode[0].usedGB / f.perNode[0].usableGB * 100, 0.1);
  const bf16 = C.sparkFit(M("glm-5.2"), spark, 1, "bf16", 0, 8192, "off");   // 753B bf16 on 1 spark -> impossible
  ok("bf16 753B on 1 node does not fit", bf16.fits === false);
  const small = C.sparkFit(M("qwen3-8b"), spark, 1, "int4", 0, 8192, "off");  // 8B int4 fits easily
  ok("qwen3-8b int4 fits on 1 spark", small.fits === true);
}

// 8. Ladder returns every quant mode, ordered heaviest->lightest weights.
{
  const rows = C.sparkLadder(M("glm-5.2"), spark, 2, 0, 8192, "off");
  ok("ladder has all modes", rows.length === C.SPARK_QUANT.length);
  ok("ladder bf16 heaviest", rows[0].id === "bf16" && rows[0].weightsGB === Math.max(...rows.map(r => r.weightsGB)));
}

console.log(`\nspark.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
