/* llm-selfhost-calculator — client-side UI glue. No backend, no keys, no data leaves the browser.
   Pure estimation core lives in compute.js (LLMCalc.compute), shared with the Node unit tests.
   UI text is translated via i18n.js: tr(key, vars) for UI strings, td(koString) for data strings. */

const compute = LLMCalc.compute;
const tr = (k, v) => I18N.t(k, v);       // UI string
const td = (s) => I18N.td(s);            // data-file string (ko source -> current lang)
I18N.initTheme();                        // set <html data-theme> early to avoid a flash
I18N.initLang();

const state = { models: [], gpus: [], apiPresets: [], speech: null, vllm: null, sglang: null, trtllm: null };

// vLLM tab state: fetched = {id, config} for an arbitrary HF model (null = use curated dropdown);
// manifests/spec cached from last render; active = which manifest tab is shown.
// The single vllmState.fetched is shared by all three engine tabs.
const vllmState = { fetched: null, spec: null, manifests: null, active: "compose" };
const sglangState = { spec: null, manifests: null, active: "compose" };
const trtState = { spec: null, manifests: null, active: "compose" };

async function loadData() {
  const [m, g, a, s, v, sg, trt] = await Promise.all([
    fetch("data/models.json").then(r => r.json()),
    fetch("data/gpus.json").then(r => r.json()),
    fetch("data/api-prices.json").then(r => r.json()),
    fetch("data/speech.json").then(r => r.json()),
    fetch("data/vllm-support.json").then(r => r.json()),
    fetch("data/sglang-support.json").then(r => r.json()),
    fetch("data/trtllm-support.json").then(r => r.json()),
  ]);
  state.models = m.models;
  state.gpus = g.gpus;
  state.apiPresets = a.presets;
  state.speech = s;
  state.vllm = v;
  state.sglang = sg;
  state.trtllm = trt;
}

function fmt(x, d = 1) { return x == null || isNaN(x) ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d }); }
function ctxShort(t) { return t >= 1e6 ? (t / 1e6).toFixed(t % 1e6 ? 1 : 0) + "M" : Math.round(t / 1000) + "K"; }

// Owned/on-prem purchase payback rendering (capex + electricity → months to break even vs API).
function renderOwnCost(cost, r, N) {
  if (!r.ownAvailable) {
    const msg = isNaN(parseFloat(el("kwh").value))
      ? tr("dyn.own.needkwh")
      : tr("dyn.own.needcapex", { n: N > 1 ? tr("dyn.own.needN", { N }) : "" });
    cost.innerHTML = `<div class="dim">${msg}</div>`;
    return;
  }
  const fleet = N > 1 ? ` (${N}×)` : "";
  const pb = r.paybackMonths, recovers = pb != null;
  cost.innerHTML =
    `<div class="cost-row"><span>${tr("dyn.own.capex")}${fleet}</span><b>$${fmt(r.capexFleet, 0)}</b></div>` +
    `<div class="cost-row"><span>${tr("dyn.own.elec")} <span class="dim">(active ${fmt(r.activeHours, 0)} GPU-h · ${fmt(r.fleetKw, 2)}kW)</span></span><b>$${fmt(r.elecMonthly, 2)}</b></div>` +
    `<div class="cost-row"><span>${tr("dyn.own.apicost")}</span><b>$${fmt(r.apiMonthly, 2)}</b></div>` +
    `<div class="cost-row dim"><span>${tr("dyn.own.netsave")}</span><b>$${fmt(r.monthlyNetSaving, 2)}</b></div>` +
    (r.overSubscribed ? `<div class="cost-row" style="border:0"><span style="color:var(--k)">${tr("dyn.own.oversub", { h: fmt(r.activeHours, 0) })}</span></div>` : "") +
    `<div class="verdict ${recovers ? "self" : "api"}">${recovers
      ? tr("dyn.own.recovers", { pb: fmt(pb, 1), warn: pb > 60 ? tr("dyn.own.recovers.warn") : "" })
      : tr("dyn.own.norecover")}</div>` +
    (recovers ? ownChartSVG(r.tcoSeries, pb) : "");
}

// Cumulative-cost crossover: self-host (capex + electricity) vs API, over the 36-month series.
function ownChartSVG(series, pb) {
  const W = 300, H = 90, pad = 5;
  const last = series[series.length - 1], maxX = series.length - 1;
  const maxY = Math.max(last.selfhost, last.api) || 1;
  const px = m => pad + (m / maxX) * (W - 2 * pad);
  const py = v => H - pad - (v / maxY) * (H - 2 * pad);
  const line = (key, color) => `<polyline fill="none" stroke="${color}" stroke-width="2" points="${series.map(p => `${fmt(px(p.month), 1)},${fmt(py(p[key]), 1)}`).join(" ")}"/>`;
  const inWindow = pb <= maxX;                                 // only draw the crossover marker if it actually falls inside the 36-month plot
  const crossMark = inWindow ? `<line x1="${fmt(px(pb), 1)}" y1="${pad}" x2="${fmt(px(pb), 1)}" y2="${H - pad}" stroke="var(--dim)" stroke-width="1" stroke-dasharray="3 3"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="margin-top:12px" role="img" aria-label="${tr("dyn.chart.aria")}">` +
    crossMark + line("api", "var(--k)") + line("selfhost", "var(--ok)") + `</svg>` +
    `<div class="dim" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:2px">` +
    `<span><span class="dot" style="background:var(--ok)"></span>${tr("dyn.chart.buycum")}</span>` +
    `<span><span class="dot" style="background:var(--k)"></span>${tr("dyn.chart.apicum")}</span>` +
    `<span>${inWindow ? tr("dyn.chart.cross", { pb: fmt(pb, 1) }) : tr("dyn.chart.outside", { pb: fmt(pb, 1) })}</span></div>`;
}

function render() {
  const model = state.models.find(m => m.id === el("model").value);
  const gpu = state.gpus.find(g => g.id === el("gpu").value);
  const quant = el("quant").value;
  const context = parseInt(el("context").value, 10);
  const concurrency = parseInt(el("concurrency").value, 10);
  const rentRaw = el("rent").value.trim();
  const rentOverride = rentRaw === "" ? null : parseFloat(rentRaw);
  const apiPer1m = parseFloat(el("api").value);

  const mode = document.querySelector('input[name="costmode"]:checked').value;
  const monthlyTokensB = parseFloat(el("monthlyTokens").value);            // billions/month
  const capexRaw = el("capex").value.trim();
  const own = mode === "own" ? {
    pricePerKwh: parseFloat(el("kwh").value),
    monthlyTokens: monthlyTokensB * 1e9,
    capexOverride: capexRaw === "" ? null : parseFloat(capexRaw),
  } : null;

  el("rentGroup").hidden = mode === "own";
  el("ownInputs").hidden = mode !== "own";
  el("contextLabel").textContent = context.toLocaleString() + " tok";
  el("concurrencyLabel").textContent = concurrency + " concurrent";
  el("mtokLabel").textContent = tr("dyn.mtok", { v: fmt(monthlyTokensB) });

  const r = compute(model, gpu, quant, context, concurrency, rentOverride, apiPer1m, own);
  const N = r.gpusNeeded;

  // model meta chips
  const chip = (t) => `<span class="chip">${t}</span>`;
  el("modelChips").innerHTML =
    chip(model.moe ? `${fmt(model.total_params_b, 0)}B total · A${fmt(model.active_params_b, 0)}B active` : `${fmt(model.total_params_b, 0)}B dense`) +
    chip(model.moe ? "MoE" : "dense") +
    chip(`ctx ${model.context.toLocaleString()}`) +
    chip(model.license) +
    chip(`released ${model.released}`);

  // VRAM bar spans the whole requirement; vertical ticks mark each device's VRAM boundary
  const total = r.vramSingle;
  const seg = (v, cls) => `<span class="seg ${cls}" style="width:${(v / total) * 100}%"></span>`;
  let ticks = "";
  for (let i = 1; i <= N && i * gpu.vram_gb < total; i++)
    ticks += `<span class="cap" style="left:${(i * gpu.vram_gb / total) * 100}%"></span>`;
  el("vramBar").innerHTML = seg(r.weightsGB, "w") + seg(r.kvSingleGB, "k") + seg(r.overheadGB, "o") + ticks;

  const gpuShortName = esc(gpu.name.split(" (")[0]);
  el("fitBadge").innerHTML = r.fits
    ? `<span class="badge ok">${tr("dyn.fit.single", { gpu: gpuShortName })}</span>`
    : `<span class="badge multi">${tr("dyn.fit.multi", { gpu: gpuShortName, n: N })}</span>`;

  const maxCtxSuffix = r.maxCtxTokens >= model.context ? tr("dyn.vram.maxctx.head") : tr("dyn.vram.maxctx.over");
  el("vramNums").innerHTML =
    tr("dyn.vram.line", { w: fmt(r.weightsGB), kv: fmt(r.kvSingleGB), ctx: context.toLocaleString(), o: fmt(r.overheadGB), tot: fmt(r.vramSingle) }) +
    (N > 1 ? tr("dyn.vram.multi", { n: N, vram: gpu.vram_gb, total: fmt(r.totalVram) }) : tr("dyn.vram.single", { vram: gpu.vram_gb })) +
    (r.maxCtxTokens > 0
      ? `<div class="dim" style="margin-top:4px">${tr("dyn.vram.maxctx", { tok: r.maxCtxTokens.toLocaleString(), suffix: maxCtxSuffix })}</div>`
      : `<div class="dim warn" style="margin-top:4px">${tr("dyn.vram.weightsover")}</div>`);

  const nNote = N > 1 ? tr("dyn.tokS.nnote", { n: N }) : "";
  el("tokS").innerHTML = `<b>${fmt(r.singleTokS)}</b> tok/s <span class="dim">${tr("dyn.tokS.stream")}${nNote}</span>`;
  el("throughput").innerHTML = `<b>${fmt(r.servingTokS)}</b> tok/s <span class="dim">${tr("dyn.tokS.serving", { b: r.effBatch, m: r.maxBatch })}</span>`;

  const cost = el("costBox");
  if (mode === "own") {
    renderOwnCost(cost, r, N);
  } else if (r.rent == null) {
    const ownedKind = gpu.kind === "apple" ? tr("dyn.cost.owned.apple") : gpu.kind === "npu" ? tr("dyn.cost.owned.npu") : tr("dyn.cost.owned.gen");
    cost.innerHTML = `<div class="dim">${tr("dyn.cost.owned", { kind: ownedKind, n: N > 1 ? tr("dyn.cost.ownedN", { N }) : "" })}</div>`;
  } else {
    const cheaper = r.verdict === "self";
    const fleet = N > 1 ? ` (${N}× $${fmt(r.rent, 2)} = $${fmt(r.fleetRentHr, 2)}/hr)` : ` ($${fmt(r.rent, 2)}/hr)`;
    cost.innerHTML =
      `<div class="cost-row"><span>${tr("dyn.cost.selfrate")}${fleet}</span><b>$${fmt(r.selfHostPer1m, 2)} / 1M tok</b></div>` +
      `<div class="cost-row"><span>${tr("dyn.cost.apirate")}</span><b>$${fmt(apiPer1m, 2)} / 1M tok</b></div>` +
      `<div class="cost-row dim"><span>${tr("dyn.cost.needtput")}</span><b>${fmt(r.requiredTokS)} tok/s</b> ${tr("dyn.cost.needtput.cur", { v: fmt(r.servingTokS) })}</div>` +
      `<div class="verdict ${cheaper ? "self" : "api"}">${cheaper
        ? tr("dyn.cost.cheaper", { n: N > 1 ? tr("dyn.cost.cheaperN", { N }) : "" })
        : tr("dyn.cost.apicheaper", { v: fmt(r.requiredTokS) })}</div>`;
  }

  const moeNote = model.moe ? tr("dyn.moenote", { t: fmt(model.total_params_b, 0), a: fmt(model.active_params_b, 1) }) : "";
  const kvNote = model.note ? ` · <span class="warn">${esc(td(model.note))}</span>` : "";
  el("modelNote").innerHTML = `<a href="https://huggingface.co/${model.hf}" target="_blank" rel="noopener">${model.hf}</a>${moeNote}${kvNote}`;
  if (context > model.context) el("modelNote").innerHTML += ` <span class="warn">${tr("dyn.ctxover", { m: model.context.toLocaleString() })}</span>`;

  renderVllm(r);
  renderSglang(r);
  renderTrt(r);
  renderSpark(model, gpu, context);
}

// ---- vLLM serving-readiness tab -------------------------------------------

const TIER_BADGE = { native: "ok", transformers: "multi", partial: "multi", custom: "warn", unknown: "no", unsupported: "no", incompatible: "no" };

function renderVllm(r) {
  const support = state.vllm;
  if (!support) return;
  const quant = el("quant").value;
  const context = parseInt(el("context").value, 10);
  const concurrency = parseInt(el("concurrency").value, 10);

  let verdictInput, modelId, modelMaxContext, gpuCount, custom = false, quantMethod = null, vramNote = "";
  if (vllmState.fetched) {
    const cfg = vllmState.fetched.config;
    verdictInput = { config: cfg, id: vllmState.fetched.id };
    modelId = vllmState.fetched.id;
    modelMaxContext = cfg.max_position_embeddings || context;
    gpuCount = 1;
    custom = !!(cfg.auto_map || cfg.trust_remote_code);
    quantMethod = (cfg.quantization_config && (cfg.quantization_config.quant_method || cfg.quantization_config.quant_algo)) || null;
    vramNote = tr("dyn.rd.vramnote.vllm");
  } else {
    const model = state.models.find(m => m.id === el("model").value);
    verdictInput = { curated: model };
    modelId = model.hf;
    modelMaxContext = model.context;
    gpuCount = r.gpusNeeded;
  }

  const verdict = LLMCalc.vllmVerdict(verdictInput, support);
  const spec = LLMCalc.buildServingSpec({
    modelId, quant, context, modelMaxContext, concurrency, gpuCount,
    vllmVersion: support.vllm_version, custom,
    implTransformers: verdict.tier === "transformers", quantMethod,
  });
  vllmState.spec = spec;
  vllmState.manifests = {
    compose: Manifest.dockerCompose(spec),
    k8s: Manifest.k8sManifest(spec),
    helm: Manifest.helmValues(spec),
  };

  el("vllmBadge").innerHTML = `<span class="badge ${TIER_BADGE[verdict.tier] || "no"}">${verdict.ok ? "✅" : "⚠️"} ${esc(td(verdict.label))}</span>`;

  const help = (support.tier_help && support.tier_help[verdict.tier]) || "";
  const caveats = (verdict.caveats || []).length
    ? `<ul class="caveats">${verdict.caveats.map(c => `<li>${esc(td(c))}</li>`).join("")}</ul>` : "";
  el("vllmVerdictBox").innerHTML =
    `<div><b>${tr("dyn.rd.model")}</b> <a href="https://huggingface.co/${esc(modelId)}" target="_blank" rel="noopener">${esc(modelId)}</a></div>` +
    (verdict.arch ? `<div class="dim"><b>${tr("dyn.rd.arch")}</b> <code>${esc(verdict.arch)}</code></div>` : "") +
    `<div class="dim"><b>${tr("dyn.rd.base", { engine: "vLLM" })}</b> v${esc(support.vllm_version)}${verdict.min_vllm && verdict.min_vllm !== support.vllm_version ? tr("dyn.rd.min", { v: esc(verdict.min_vllm) }) : ""}</div>` +
    (help ? `<div class="verdict ${verdict.ok ? "self" : "api"}">${esc(td(help))}</div>` : "") +
    caveats +
    (vramNote ? `<div class="dim warn" style="margin-top:6px">${esc(vramNote)}</div>` : "");

  const cli = "vllm serve " + spec.args.join(" ").replace(/ --/g, " \\\n  --");
  const quantWhatIf = (quant !== "fp16" && !vllmState.fetched)
    ? `<div class="dim warn" style="margin-top:6px">${tr("dyn.rd.whatif.vllm")}</div>`
    : "";
  el("vllmParams").innerHTML = `<pre class="code small"><code>${esc(cli)}</code></pre>${quantWhatIf}`;

  renderManifest();
}

function renderManifest() {
  if (!vllmState.manifests) return;
  el("manifestCode").textContent = vllmState.manifests[vllmState.active] || "";
}

// ---- SGLang / TensorRT-LLM serving-readiness tabs -------------------------
// Shared model/hardware resolution (curated dropdown OR fetched arbitrary HF model).
function engineModelContext(r) {
  const gpu = state.gpus.find(g => g.id === el("gpu").value);
  const context = parseInt(el("context").value, 10);
  if (vllmState.fetched) {
    const cfg = vllmState.fetched.config;
    return {
      verdictInput: { config: cfg, id: vllmState.fetched.id },
      modelId: vllmState.fetched.id,
      modelMaxContext: cfg.max_position_embeddings || context,
      gpuCount: 1,
      custom: !!(cfg.auto_map || cfg.trust_remote_code),
      quantMethod: (cfg.quantization_config && (cfg.quantization_config.quant_method || cfg.quantization_config.quant_algo)) || null,
      vramNote: tr("dyn.rd.vramnote.engine"),
      gpu,
    };
  }
  const model = state.models.find(m => m.id === el("model").value);
  return {
    verdictInput: { curated: model }, modelId: model.hf, modelMaxContext: model.context,
    gpuCount: r.gpusNeeded, custom: false, quantMethod: null, vramNote: "", gpu,
  };
}

function renderEngineTab(o) {
  const support = o.support;
  if (!support) return;
  const quant = el("quant").value;
  const context = parseInt(el("context").value, 10);
  const concurrency = parseInt(el("concurrency").value, 10);
  const ctx = o.ctx;

  const verdict = o.verdictFn(ctx.verdictInput, support, ctx.gpu);
  const spec = o.specFn({
    modelId: ctx.modelId, quant, context, modelMaxContext: ctx.modelMaxContext,
    concurrency, gpuCount: ctx.gpuCount, version: support.version, image: support.image,
    custom: ctx.custom, quantMethod: ctx.quantMethod,
  });
  o.state.spec = spec;
  o.state.manifests = {
    compose: Manifest.engineCompose(spec),
    k8s: Manifest.engineK8s(spec),
    helm: Manifest.engineHelm(spec),
  };

  const icon = verdict.ok ? "✅" : (verdict.tier === "incompatible" ? "⛔" : "⚠️");
  el(o.ids.badge).innerHTML = `<span class="badge ${TIER_BADGE[verdict.tier] || "no"}">${icon} ${esc(td(verdict.label))}</span>`;

  const help = (support.tier_help && support.tier_help[verdict.tier]) || "";
  const caveats = (verdict.caveats || []).length
    ? `<ul class="caveats">${verdict.caveats.map(c => `<li>${esc(td(c))}</li>`).join("")}</ul>` : "";
  el(o.ids.verdict).innerHTML =
    `<div><b>${tr("dyn.rd.model")}</b> <a href="https://huggingface.co/${esc(ctx.modelId)}" target="_blank" rel="noopener">${esc(ctx.modelId)}</a></div>` +
    (verdict.arch ? `<div class="dim"><b>${tr("dyn.rd.arch")}</b> <code>${esc(verdict.arch)}</code></div>` : "") +
    `<div class="dim"><b>${tr("dyn.rd.hardware")}</b> ${esc(ctx.gpu ? ctx.gpu.name.split(" (")[0] : "—")}${ctx.gpuCount > 1 ? ` × ${ctx.gpuCount} (TP)` : ""}</div>` +
    `<div class="dim"><b>${tr("dyn.rd.base", { engine: esc(o.engineLabel) })}</b> v${esc(support.version)}${verdict.min_ver && verdict.min_ver !== support.version ? tr("dyn.rd.min", { v: esc(verdict.min_ver) }) : ""}</div>` +
    (help ? `<div class="verdict ${verdict.ok ? "self" : "api"}">${esc(td(help))}</div>` : "") +
    caveats +
    (ctx.vramNote ? `<div class="dim warn" style="margin-top:6px">${esc(ctx.vramNote)}</div>` : "");

  if (verdict.tier === "incompatible") {
    el(o.ids.params).innerHTML = `<div class="dim warn">${tr("dyn.rd.incompatible", { engine: esc(o.engineLabel) })}</div>`;
  } else {
    const cli = spec.command.join(" ").replace(/ --/g, " \\\n  --");
    const quantWhatIf = (quant !== "fp16" && !vllmState.fetched)
      ? `<div class="dim warn" style="margin-top:6px">${tr("dyn.rd.whatif.engine")}</div>`
      : "";
    el(o.ids.params).innerHTML = `<pre class="code small"><code>${esc(cli)}</code></pre>${quantWhatIf}`;
  }
  el(o.ids.manifestCode).textContent = o.state.manifests[o.state.active] || "";
}

function renderSglang(r) {
  renderEngineTab({
    engineLabel: "SGLang", support: state.sglang, ctx: engineModelContext(r),
    verdictFn: LLMCalc.sglangVerdict, specFn: LLMCalc.buildSglangSpec, state: sglangState,
    ids: { badge: "sglangBadge", verdict: "sglangVerdictBox", params: "sglangParams", manifestCode: "sglangManifestCode" },
  });
}
function renderTrt(r) {
  renderEngineTab({
    engineLabel: "TensorRT-LLM", support: state.trtllm, ctx: engineModelContext(r),
    verdictFn: LLMCalc.trtllmVerdict, specFn: LLMCalc.buildTrtllmSpec, state: trtState,
    ids: { badge: "trtBadge", verdict: "trtVerdictBox", params: "trtParams", manifestCode: "trtManifestCode" },
  });
}

// ---- Spark 배치 tab (howtospark.com-style per-node memory layout) ----------

const sparkState = { nodes: 2, reap: 0, spec: "off", quant: "e2_nvfp4" };

function sparkChipsHTML(model) {
  const parts = LLMCalc.sparkParts(model);
  const items = [
    model.moe ? `${fmt(model.total_params_b, 0)}B total` : `${fmt(model.total_params_b, 0)}B dense`,
    `A${fmt(model.active_params_b, 1)}B active`,
    model.moe ? (model.n_experts ? `MoE ${model.n_experts} experts` : "MoE") : "dense",
    `kv_dim ${model.kv_dim}`,
    `ctx ${ctxShort(model.context)}`,
    model.license,
  ].filter(Boolean);
  return items.map(x => `<span class="chip">${esc(x)}</span>`).join("") +
    (parts.estimated ? `<span class="chip warn">${tr("dyn.spark.denseapprox")}</span>` : "");
}

function nodeCardHTML(n, i) {
  const seg = (val, cls, label) => {
    const h = Math.max(0, val / n.usableGB * 100);
    if (h < 0.4) return "";
    const lab = (label && h > 8) ? `<span class="seg-label">${esc(label)}<br>${fmt(val, 1)} GB</span>` : "";
    return `<span class="ncard-seg ${cls}" style="height:${h}%">${lab}</span>`;
  };
  const overhead = n.overheadGB + n.draftGB;
  const over = n.freeGB < 0;
  return `<div class="ncard${over ? " over" : ""}">
    <div class="ncard-head">${tr("dyn.spark.node", { i: i + 1 })} <span class="ncard-role">${n.role}</span></div>
    <div class="ncard-stack">
      ${seg(Math.max(0, n.freeGB), "free", n.freeGB > 3 ? `${fmt(n.freeGB, 0)} GB free` : "")}
      ${seg(overhead, "overhead", "")}
      ${seg(n.kvGB, "kv", "KV cache")}
      ${seg(n.denseGB, "dense", "Dense")}
      ${seg(n.expertGB, "expert", "Expert planes")}
    </div>
    <div class="ncard-foot"><b class="${over ? "over" : ""}">${fmt(n.usedGB, 0)}</b> / ${fmt(n.usableGB, 0)} GB<br>
      <span class="dim">${fmt(n.pct, 0)}% of usable</span></div>
  </div>`;
}

function renderSpark(model, gpu, context) {
  el("sparkModelName").innerHTML = `<a href="https://huggingface.co/${esc(model.hf)}" target="_blank" rel="noopener">${esc(model.name)}</a>`;
  el("sparkChips").innerHTML = sparkChipsHTML(model);
  el("sparkGpuName").textContent = "· " + gpu.name.split(" (")[0];

  const kept = model.n_experts ? Math.round(model.n_experts * (1 - sparkState.reap / 100)) : 0;
  el("sparkReapLabel").textContent = !model.moe ? "—"
    : sparkState.reap === 0 ? tr("dyn.spark.noprune", { n: model.n_experts })
    : `${sparkState.reap}% · ${model.n_experts}→${kept}`;
  el("sparkReapNote").innerHTML = !model.moe ? `<span class="warn">${tr("dyn.spark.reap.dense")}</span>`
    : sparkState.reap > 30 ? `<span class="warn">${tr("dyn.spark.reap.warn")}</span>` : "";

  // quant ladder
  const rows = LLMCalc.sparkLadder(model, gpu, sparkState.nodes, sparkState.reap, context, sparkState.spec);
  const usable = rows.length ? rows[0].usableTotal : 1;
  const maxBar = Math.max(usable, ...rows.map(r => r.totalGB)) || 1;
  el("sparkLadder").innerHTML = rows.map(r => {
    const sel = r.id === sparkState.quant;
    const totalPct = Math.min(100, r.totalGB / maxBar * 100);
    const overPct = r.totalGB > usable ? Math.min(100, (r.totalGB - usable) / maxBar * 100) : 0;
    const fitPct = Math.max(0, totalPct - overPct);
    const usablePct = usable / maxBar * 100;
    return `<button type="button" class="ladder-row${sel ? " sel" : ""}" data-q="${r.id}" aria-pressed="${sel}">
      <span class="lr-label">${esc(r.label)}</span>
      <span class="lr-bar"><span class="lr-fit" style="width:${fitPct}%"></span><span class="lr-over" style="width:${overPct}%"></span><span class="lr-usable" style="left:${usablePct}%"></span></span>
      <span class="lr-gb ${r.fits ? "" : "over"}">${fmt(r.totalGB, 0)} GB</span>
      <span class="lr-tok">${fmt(r.tokS, 1)} tok/s</span>
    </button>`;
  }).join("");

  // selected quant -> node cards + badge + ctx-fits
  const f = LLMCalc.sparkFit(model, gpu, sparkState.nodes, sparkState.quant, sparkState.reap, context, sparkState.spec);
  const gpuShort = gpu.name.split(" (")[0];
  el("sparkBadge").innerHTML = f.fits
    ? `<span class="badge ok">${tr("dyn.spark.fit", { n: sparkState.nodes, gpu: esc(gpuShort) })}</span>`
    : `<span class="badge no">${tr("dyn.spark.nofit", { n: sparkState.nodes })}</span>`;
  el("sparkNodesTitle").textContent = tr("dyn.spark.memtitle", { n: sparkState.nodes, mode: f.mode.label, ctx: ctxShort(context) });
  el("sparkCtxFits").innerHTML = f.maxCtxFits > 0
    ? tr("dyn.spark.ctxfits", { k: (f.maxCtxFits / 1000).toFixed(0), cur: ctxShort(context) })
    : `<span class="warn">${tr("dyn.spark.ctxover")}</span>`;
  el("sparkNodeCards").innerHTML = f.perNode.map((n, i) => nodeCardHTML(n, i)).join("");
}

function switchResultTab(which) {
  document.querySelectorAll("#resultTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.panel === which));
  el("panelCalc").hidden = which !== "calc";
  el("panelVllm").hidden = which !== "vllm";
  el("panelSglang").hidden = which !== "sglang";
  el("panelTrt").hidden = which !== "trt";
  el("panelSpark").hidden = which !== "spark";
}

// Wire a manifest sub-tab group (SGLang / TensorRT-LLM) — sub-tab switch + copy + download.
function wireEngineManifest(o) {
  document.querySelectorAll(o.tabsSel + " .tab").forEach(t =>
    t.addEventListener("click", () => {
      o.state.active = t.dataset.mf;
      document.querySelectorAll(o.tabsSel + " .tab").forEach(x => x.classList.toggle("active", x === t));
      el(o.codeId).textContent = (o.state.manifests || {})[o.state.active] || "";
    }));
  el(o.copyId).addEventListener("click", async () => {
    const text = (o.state.manifests || {})[o.state.active] || "";
    try { await navigator.clipboard.writeText(text); el(o.statusId).textContent = tr("dyn.copied"); }
    catch (e) { el(o.statusId).textContent = tr("dyn.copyfail"); }
    setTimeout(() => { el(o.statusId).textContent = ""; }, 2000);
  });
  el(o.downloadId).addEventListener("click", () =>
    downloadText(o.filenames[o.state.active] || "manifest.txt", (o.state.manifests || {})[o.state.active] || ""));
}

function normalizeAndRoute() {
  const raw = el("hfRef").value;
  const status = el("hfRefStatus");
  const fetchBtn = el("hfFetchBtn");
  if (!raw.trim()) { status.textContent = ""; fetchBtn.hidden = true; return; }
  const ref = LLMCalc.normalizeHfRef(raw);
  if (!ref) { status.innerHTML = `<span class="warn">${tr("dyn.hf.badurl")}</span>`; fetchBtn.hidden = true; return; }
  const curated = state.models.find(m => m.hf.toLowerCase() === ref.toLowerCase());
  if (curated) {
    status.innerHTML = tr("dyn.hf.curated", { name: esc(curated.name) });
    fetchBtn.hidden = true;
    vllmState.fetched = null;
    if (el("model").value !== curated.id) el("model").value = curated.id;
    render();
    switchResultTab("vllm");
  } else {
    status.innerHTML = tr("dyn.hf.notcurated", { ref: esc(ref) });
    fetchBtn.hidden = false;
    fetchBtn.dataset.ref = ref;
  }
}

async function fetchHfConfig() {
  const ref = el("hfFetchBtn").dataset.ref;
  if (!ref) return;
  const status = el("hfRefStatus");
  status.innerHTML = `<span class="dim">${tr("dyn.hf.loading")}</span>`;
  try {
    const r = await fetch(`https://huggingface.co/${ref}/resolve/main/config.json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cfg = await r.json();
    vllmState.fetched = { id: ref, config: cfg };
    status.innerHTML = tr("dyn.hf.loaded", { ref: esc(ref) });
    render();
    switchResultTab("vllm");
  } catch (e) {
    vllmState.fetched = null;
    status.innerHTML = `<span class="warn">${tr("dyn.hf.loadfail", { msg: esc(e.message) })}</span>`;
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function el(id) { return document.getElementById(id); }

function opt(v, t) { const o = document.createElement("option"); o.value = v; o.textContent = t; return o; }

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Read-only reference tables (image gen + STT/TTS) — not fed into the token calculator, different pricing units.
function renderReference() {
  const s = state.speech;
  if (!s) return;
  const row = (nameHtml, meta, price, unit) =>
    `<div class="ref-row"><div class="ref-name">${nameHtml}` +
    (meta ? `<span class="ref-meta">${esc(meta)}</span>` : "") + `</div>` +
    `<div class="ref-price">${esc(price)}${unit ? ` <span class="ref-unit">${esc(unit)}</span>` : ""}</div></div>`;

  el("refImage").innerHTML = (s.image || []).map(x =>
    row(`${esc(x.name)}<span class="ref-tag">${esc(x.provider || "")}</span>`, td(x.note), x.price, td(x.unit))).join("");

  el("refSpeechSelf").innerHTML = (s.selfhost || []).map(x => {
    const name = x.hf
      ? `<a href="https://huggingface.co/${esc(x.hf)}" target="_blank" rel="noopener">${esc(x.name)}</a>`
      : esc(x.name);
    return row(`${name}<span class="ref-tag">${esc(x.kind)}</span>`,
      [x.params, x.license, td(x.note)].filter(Boolean).join(" · "), x.vram, "");
  }).join("");

  el("refSpeechApi").innerHTML = (s.api || []).map(x =>
    row(`${esc(x.name)}<span class="ref-tag">${esc(x.kind)}</span>`,
      [x.provider, td(x.note)].filter(Boolean).join(" · "), x.price, td(x.unit))).join("");
}

async function init() {
  I18N.applyStatic();
  try {
    await loadData();
  } catch (e) {
    el("app").innerHTML = `<div class="err">${tr("dyn.err.load")}</div>`;
    return;
  }
  // models kept in curated newest-first order; label carries size + MoE + release
  state.models.forEach(m => {
    const tag = m.moe ? `${fmt(m.total_params_b, 0)}B·A${fmt(m.active_params_b, 0)}B MoE` : `${fmt(m.total_params_b, 0)}B`;
    el("model").appendChild(opt(m.id, `${m.name} · ${tag} · ${m.released}`));
    const d = document.createElement("option"); d.value = m.hf; d.label = m.name; el("hfList").appendChild(d);
  });
  state.gpus.forEach(g => el("gpu").appendChild(opt(g.id, g.name)));
  state.apiPresets.forEach((p, i) => {
    const io = (p.input != null && p.output != null) ? ` (in $${p.input} / out $${p.output})` : "";
    const prov = p.provider ? `${p.provider} ` : "";
    el("apiPreset").appendChild(opt(i, `${prov}${p.label} — blended $${p.usd_per_1m}/1M${io}`));
  });
  renderReference();

  el("model").value = "qwen3.6-27b";
  el("gpu").value = "h100-80";
  el("quant").value = "int4";
  el("apiPreset").value = "1";
  el("api").value = state.apiPresets[1].usd_per_1m;

  el("apiPreset").addEventListener("change", () => {
    const p = state.apiPresets[parseInt(el("apiPreset").value, 10)];
    if (p) el("api").value = p.usd_per_1m;
    render();
  });
  ["gpu", "quant", "context", "concurrency", "rent", "api", "kwh", "monthlyTokens", "capex"].forEach(id =>
    el(id).addEventListener("input", render));
  document.querySelectorAll('input[name="costmode"]').forEach(radio => radio.addEventListener("change", render));

  // Selecting a curated model from the dropdown overrides any fetched HF model.
  el("model").addEventListener("change", () => {
    vllmState.fetched = null;
    el("hfRef").value = ""; el("hfRefStatus").textContent = ""; el("hfFetchBtn").hidden = true;
    render();
  });

  // Result tabs (Cost·Fit / per-node / vLLM / SGLang / TensorRT-LLM readiness)
  document.querySelectorAll("#resultTabs .tab").forEach(t =>
    t.addEventListener("click", () => switchResultTab(t.dataset.panel)));

  // Spark 배치 controls
  document.querySelectorAll('input[name="sparknodes"]').forEach(radio =>
    radio.addEventListener("change", () => { sparkState.nodes = parseInt(radio.value, 10); render(); }));
  document.querySelectorAll('input[name="sparkspec"]').forEach(radio =>
    radio.addEventListener("change", () => { sparkState.spec = radio.value; render(); }));
  el("sparkReap").addEventListener("input", () => { sparkState.reap = parseInt(el("sparkReap").value, 10); render(); });
  el("sparkLadder").addEventListener("click", (e) => {
    const row = e.target.closest(".ladder-row");
    if (row && row.dataset.q) { sparkState.quant = row.dataset.q; render(); }
  });

  // HF URL/ID input funnel + opt-in config fetch
  el("hfRef").addEventListener("input", normalizeAndRoute);
  el("hfFetchBtn").addEventListener("click", fetchHfConfig);

  // Manifest sub-tabs + copy/download
  document.querySelectorAll("#manifestTabs .tab").forEach(t =>
    t.addEventListener("click", () => {
      vllmState.active = t.dataset.mf;
      document.querySelectorAll("#manifestTabs .tab").forEach(x => x.classList.toggle("active", x === t));
      renderManifest();
    }));
  el("mfCopy").addEventListener("click", async () => {
    const text = (vllmState.manifests || {})[vllmState.active] || "";
    try { await navigator.clipboard.writeText(text); el("mfStatus").textContent = tr("dyn.copied"); }
    catch (e) { el("mfStatus").textContent = tr("dyn.copyfail"); }
    setTimeout(() => { el("mfStatus").textContent = ""; }, 2000);
  });
  el("mfDownload").addEventListener("click", () => {
    const names = { compose: "docker-compose.yml", k8s: "vllm-deployment.yaml", helm: "values.yaml" };
    downloadText(names[vllmState.active] || "manifest.txt", (vllmState.manifests || {})[vllmState.active] || "");
  });

  // SGLang / TensorRT-LLM manifest sub-tabs
  wireEngineManifest({
    tabsSel: "#sglangManifestTabs", state: sglangState, codeId: "sglangManifestCode",
    copyId: "sglangMfCopy", downloadId: "sglangMfDownload", statusId: "sglangMfStatus",
    filenames: { compose: "docker-compose.yml", k8s: "sglang-deployment.yaml", helm: "values.yaml" },
  });
  wireEngineManifest({
    tabsSel: "#trtManifestTabs", state: trtState, codeId: "trtManifestCode",
    copyId: "trtMfCopy", downloadId: "trtMfDownload", statusId: "trtMfStatus",
    filenames: { compose: "docker-compose.yml", k8s: "trtllm-deployment.yaml", helm: "values.yaml" },
  });

  // Language + theme toggles (re-render dynamic content on language switch)
  document.querySelectorAll("#langToggle [data-lang]").forEach(b =>
    b.addEventListener("click", () => I18N.setLang(b.dataset.lang, true)));
  document.querySelectorAll("#themeToggle [data-theme-set]").forEach(b =>
    b.addEventListener("click", () => I18N.setTheme(b.dataset.themeSet)));
  I18N.updateToggles();

  render();
}

document.addEventListener("DOMContentLoaded", init);
