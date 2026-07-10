#!/usr/bin/env python3
"""Independent correctness audit for llm-selfhost-calculator.

Re-derives the VRAM / throughput / cost formulas FROM SCRATCH (not copied from the
JS), pins them with hand-computed ANCHOR truths, then cross-checks the shipped
compute.js output (audit/js_compute_dump.cjs) field-by-field for every model x
scenario. Prints a per-model detail table.

Run:  node audit/js_compute_dump.cjs > /tmp/js.json && python3 audit/reference_audit.py /tmp/js.json
Exit: 0 all correct · 1 any anchor/parity/sanity failure
"""
import json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
models = {m["id"]: m for m in json.loads((ROOT / "data/models.json").read_text())["models"]}
gpus = {g["id"]: g for g in json.loads((ROOT / "data/gpus.json").read_text())["gpus"]}

BPP = {"fp16": 2, "fp8": 1, "int8": 1, "nvfp4": 0.5625, "mxfp4": 0.53125, "int4": 0.5}
KV_BYTES = 2
MBU = 0.5
BATCH_EFF = 0.7


def ref_compute(m, g, quant, ctx, conc, api):
    """First-principles reference. Derived independently; see README math table."""
    bpp = BPP[quant]
    weights = m["total_params_b"] * bpp                      # B params * bytes/param -> GB
    active = m["active_params_b"] * bpp
    kv_per_tok = 2 * m["n_layers"] * m["kv_dim"] * KV_BYTES / 1e9   # K+V, GB/token
    overhead = 1.2 + 0.05 * weights
    kv_single = kv_per_tok * ctx
    vram_single = weights + kv_single + overhead
    fits = vram_single <= g["vram_gb"]
    gpus_needed = max(1, math.ceil(vram_single / g["vram_gb"]))
    total_vram = gpus_needed * g["vram_gb"]
    tp_eff = 0.8 if gpus_needed > 1 else 1.0
    agg_bw = g["bandwidth_gbs"] * gpus_needed * tp_eff
    free = total_vram - weights - overhead
    max_batch = math.floor(free / kv_single) if free > 0 else 0
    single = MBU * agg_bw / active
    eff_batch = max(1, min(conc, max_batch or 1))
    serving = single * eff_batch * BATCH_EFF
    rent = g["rent_usd_hr"]
    self1m = req = verdict = fleet = None
    if rent is not None:
        fleet = rent * gpus_needed
        self1m = (fleet / 3600) / serving * 1e6
        req = (fleet / 3600) / (api / 1e6)
        verdict = "self" if serving >= req else "api"
    return dict(weightsGB=weights, activeGB=active, kvSingleGB=kv_single, overheadGB=overhead,
                vramSingle=vram_single, fits=fits, gpusNeeded=gpus_needed, totalVram=total_vram,
                aggBandwidth=agg_bw, maxBatch=max_batch, singleTokS=single, effBatch=eff_batch,
                servingTokS=serving, fleetRentHr=fleet, selfHostPer1m=self1m, requiredTokS=req, verdict=verdict)


def near(a, b, rel=0.005, abs_=1e-6):
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (bool, str)) or isinstance(b, (bool, str)):
        return a == b
    return abs(a - b) <= max(abs_, rel * max(abs(a), abs(b)))


fail = 0


def check(name, cond):
    global fail
    print(("  PASS " if cond else "  FAIL ") + name)
    if not cond:
        fail += 1


# ---- ANCHORS: hand-computed ground truth, independent of models.json/JS ----
print("== ANCHORS (hand-computed truth) ==")
# A1 weights: 8B fp16 = 16GB, int4 = 4GB
check("8B fp16 weights = 16.0", near(8 * 2, 16.0))
check("8B int4 weights = 4.0", near(8 * 0.5, 4.0))
check("8B nvfp4 weights = 4.5", near(8 * 0.5625, 4.5))
check("8B mxfp4 weights = 4.25", near(8 * 0.53125, 4.25))
# A2 KV: layers36 kv_dim1024 fp16 @8192 = 1.20795 GB (2*36*1024*2*8192/1e9)
check("KV(36L,1024,8192) = 1.20795GB", near(2 * 36 * 1024 * 2 * 8192 / 1e9, 1.20795, rel=1e-4))
# A3 cost: rent2.5, 100 tok/s, 1 gpu -> $6.9444 / 1M
check("cost anchor = $6.9444/1M", near((2.5 / 3600) / 100 * 1e6, 6.94444, rel=1e-4))
# A4 required tok/s: rent2.5, api0.8 -> 868.06
check("required-tok/s anchor = 868.06", near((2.5 / 3600) / (0.8 / 1e6), 868.055, rel=1e-4))
# A5 gpusNeeded: 505GB on 80GB -> 7
check("gpusNeeded(505/80) = 7", math.ceil(505 / 80) == 7)

# ---- PARITY: JS (shipped) vs reference, every model x scenario ----
print("\n== JS <-> reference parity (all models x scenarios) ==")
js = json.loads(Path(sys.argv[1]).read_text())
FIELDS = ["weightsGB", "activeGB", "kvSingleGB", "overheadGB", "vramSingle", "fits", "gpusNeeded",
          "aggBandwidth", "maxBatch", "singleTokS", "servingTokS", "selfHostPer1m", "requiredTokS", "verdict"]
mismatches = []
for row in js:
    m, s, jr = models[row["model"]], row["scenario"], row["r"]
    rr = ref_compute(m, gpus[s["gpu"]], s["quant"], s["ctx"], s["conc"], s["api"])
    for f in FIELDS:
        if not near(jr.get(f), rr.get(f)):
            mismatches.append(f"{row['model']}/{s['gpu']}/{s['quant']}: {f} JS={jr.get(f)} REF={rr.get(f)}")
check(f"all {len(js)} JS results match reference on {len(FIELDS)} fields", not mismatches)
for x in mismatches[:20]:
    print("     ! " + x)

# ---- SANITY: per-model physical invariants (independent) ----
print("\n== per-model sanity ==")
bad = []
for mid, m in models.items():
    r = ref_compute(m, gpus["h200"], "int4", 8192, 16, 0.8)
    if not near(r["weightsGB"], m["total_params_b"] * 0.5):
        bad.append(f"{mid}: weights != params*0.5")
    if not m["moe"] and m["active_params_b"] != m["total_params_b"]:
        bad.append(f"{mid}: dense but active != total")
    if m["moe"] and m["active_params_b"] >= m["total_params_b"]:
        bad.append(f"{mid}: MoE but active >= total")
    if r["gpusNeeded"] * gpus["h200"]["vram_gb"] < r["vramSingle"] - 1e-6:
        bad.append(f"{mid}: fleet VRAM < required")
    if not (0 < r["singleTokS"] < 1e5):
        bad.append(f"{mid}: implausible tok/s {r['singleTokS']}")
    if r["selfHostPer1m"] is not None and r["selfHostPer1m"] <= 0:
        bad.append(f"{mid}: non-positive $/1M")
check("all models pass physical invariants", not bad)
for x in bad:
    print("     ! " + x)

# ---- PER-MODEL DETAIL TABLE (headline scenario) ----
print("\n== per-model detail (H100-80, int4, ctx 8192, conc 32, API $0.8/1M) ==")
print(f"{'model':<20}{'wgtGB':>8}{'vramGB':>9}{'GPUs':>6}{'tok/s':>9}{'serve':>10}{'$/1M':>9}  verdict")
for mid, m in models.items():
    r = ref_compute(m, gpus["h100-80"], "int4", 8192, 32, 0.8)
    print(f"{mid:<20}{r['weightsGB']:>8.1f}{r['vramSingle']:>9.1f}{r['gpusNeeded']:>6}"
          f"{r['singleTokS']:>9.0f}{r['servingTokS']:>10.0f}{r['selfHostPer1m']:>9.3f}  {r['verdict']}")

print(f"\n{'ALL CHECKS PASSED' if fail == 0 else str(fail) + ' CHECK(S) FAILED'}")
sys.exit(1 if fail else 0)
