/* Dump the SHIPPED compute.js output for every (model × scenario) as JSON,
   so an independent Python reference can cross-check it. Run: node audit/js_compute_dump.cjs */
const fs = require("fs"), path = require("path");
const { compute } = require("../assets/compute.js");
const root = path.join(__dirname, "..");
const models = JSON.parse(fs.readFileSync(path.join(root, "data/models.json"))).models;
const gpus = JSON.parse(fs.readFileSync(path.join(root, "data/gpus.json"))).gpus;
const G = id => gpus.find(g => g.id === id);

const scenarios = [
  { gpu: "h100-80", quant: "int4", ctx: 8192, conc: 32, api: 0.8 },
  { gpu: "h200", quant: "fp16", ctx: 32768, conc: 1, api: 0.8 },
  { gpu: "rtx4090", quant: "int4", ctx: 4096, conc: 8, api: 0.5 },
  { gpu: "m2-ultra-192", quant: "int4", ctx: 8192, conc: 1, api: 0.8 },
];

const out = [];
for (const m of models) {
  for (const s of scenarios) {
    const r = compute(m, G(s.gpu), s.quant, s.ctx, s.conc, null, s.api);
    out.push({ model: m.id, scenario: s, r });
  }
}
console.log(JSON.stringify(out));
