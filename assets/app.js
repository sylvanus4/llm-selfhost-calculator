/* llm-selfhost-calculator — client-side UI glue. No backend, no keys, no data leaves the browser.
   Pure estimation core lives in compute.js (LLMCalc.compute), shared with the Node unit tests.
   UI text is translated via i18n.js: tr(key, vars) for UI strings, td(koString) for data strings. */

const compute = LLMCalc.compute;
const tr = (k, v) => I18N.t(k, v);       // UI string
const td = (s) => I18N.td(s);            // data-file string (ko source -> current lang)
I18N.initTheme();                        // set <html data-theme> early to avoid a flash
I18N.initLang();

const state = { models: [], gpus: [], apiPresets: [], speech: null, vllm: null, sglang: null, trtllm: null,
  media: [], mediaPresets: [], speechModels: [], speechPresets: [], serving: null,
  cat: "llm", mplaceNodes: 1 };

// Everything the diffusion path needs that the LLM path does not.
// refGpuId is the device our own benchmarks ran on — media latency is scaled FROM it.
const MEDIA_REF_GPU = "b200";
const isMedia = () => state.cat !== "llm";
const isSpeech = () => state.cat === "speech";
// The speech dataset splits stt/tts inside one category; image/video are one kind each.
const mediaList = () => isSpeech() ? state.speechModels : state.media.filter(m => m.kind === state.cat);
const currentMediaModel = () => mediaList().find(m => m.id === el("model").value) || mediaList()[0];
// Resolution presets are offered per model because the useful ladder differs: a 480p video model
// and a 1328px image model do not share a sensible list.
const IMAGE_RES = [[512, 512], [768, 768], [1024, 1024], [1328, 1328], [1664, 928], [2048, 2048]];
const VIDEO_RES = [[832, 480], [1280, 720], [1536, 1024], [1920, 1080]];

// vLLM tab state: fetched = {id, config} for an arbitrary HF model (null = use curated dropdown);
// manifests/spec cached from last render; active = which manifest tab is shown.
// The single vllmState.fetched is shared by all three engine tabs.
const vllmState = { fetched: null, spec: null, manifests: null, active: "compose" };
const sglangState = { spec: null, manifests: null, active: "compose" };
const trtState = { spec: null, manifests: null, active: "compose" };

async function loadData() {
  const [m, g, a, s, v, sg, trt, md, spm, srv] = await Promise.all([
    fetch("data/models.json").then(r => r.json()),
    fetch("data/gpus.json").then(r => r.json()),
    fetch("data/api-prices.json").then(r => r.json()),
    fetch("data/speech.json").then(r => r.json()),
    fetch("data/vllm-support.json").then(r => r.json()),
    fetch("data/sglang-support.json").then(r => r.json()),
    fetch("data/trtllm-support.json").then(r => r.json()),
    fetch("data/media-models.json").then(r => r.json()),
    fetch("data/speech-models.json").then(r => r.json()),
    fetch("data/serving-support.json").then(r => r.json()),
  ]);
  state.models = m.models;
  state.gpus = g.gpus;
  state.apiPresets = a.presets;
  state.mediaPresets = a.media_presets || [];
  state.speechPresets = a.speech_presets || [];
  state.media = md.models;
  state.speechModels = spm.models;
  state.serving = srv;
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
  if (isMedia()) return renderMedia();
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
  el("modelNote").innerHTML =
    `<div class="reflinks"><a class="reflink" href="https://huggingface.co/${esc(model.hf)}" target="_blank" rel="noopener">🤗 ${esc(model.hf)}</a></div>` +
    `<div>${`${moeNote}${kvNote}`.replace(/^\s*·\s*/, "")}</div>`;
  if (context > model.context) el("modelNote").innerHTML += ` <span class="warn">${tr("dyn.ctxover", { m: model.context.toLocaleString() })}</span>`;

  renderVllm(r);
  renderSglang(r);
  renderTrt(r);
  renderSpark(model, gpu, context);
  renderReference();   // re-render on every pass so language toggle re-translates the speech/image tables (fixes EN-mode Korean leak)
}

// ---- Image / video generation tab -----------------------------------------

// How much to trust the latency number, and why. This is deliberately visible in the UI:
// a diffusion latency scaled from our own benchmark and one extrapolated from a roofline are
// not the same claim, and collapsing them into one bold number would be dishonest.
const SPEED_BADGE = { measured: "ok", "measured-sibling": "ok", "measured-approx": "multi",
  estimated: "warn", unmodelled: "no", unknown: "no" };

// Weights + licence, both one click away. People evaluating a model want to open the repo and
// read the actual terms, not take a calculator's word for either.
function mediaLinks(model) {
  const hf = `<a class="reflink" href="https://huggingface.co/${esc(model.hf)}" target="_blank" rel="noopener">🤗 ${esc(model.hf)}</a>`;
  const lic = model.license_url
    ? `<a class="reflink" href="${esc(model.license_url)}" target="_blank" rel="noopener">📄 ${esc(model.license)}</a>`
    : `<span class="reflink dim">📄 ${esc(model.license)}</span>`;
  return `<div class="reflinks">${hf}${lic}</div>`;
}

function speechPresetList() {
  const k = (currentMediaModel() || {}).kind;
  return state.speechPresets.filter(p => p.kind === "any" || p.kind === k);
}

function mediaOwnInput() {
  const raw = el("capex").value.trim();
  return {
    pricePerKwh: parseFloat(el("kwh").value),
    monthlyItems: parseInt(el("monthlyItems").value, 10),
    capexOverride: raw === "" ? null : parseFloat(raw),
  };
}

// ---- Speech (STT / TTS) ----------------------------------------------------

function renderSpeech() {
  const model = currentMediaModel();
  if (!model) return;
  const gpu = state.gpus.find(g => g.id === el("gpu").value);
  const refGpu = state.gpus.find(g => g.id === MEDIA_REF_GPU);
  const mode = document.querySelector('input[name="costmode"]:checked').value;
  const isTTS = model.kind === "tts";
  const concurrency = parseInt(el("concurrency").value, 10);
  const apiRaw = el("api").value.trim();

  el("rentGroup").hidden = mode === "own";
  el("ownInputs").hidden = mode !== "own";
  el("concurrencyLabel").textContent = concurrency + " concurrent";
  el("maudioLabel").textContent = tr("media.maudiolab", { n: Number(el("monthlyAudioHours").value).toLocaleString() });

  const r = LLMCalc.computeSpeech(model, gpu, el("quant").value, {
    concurrency,
    rentOverride: el("rent").value.trim() === "" ? null : parseFloat(el("rent").value),
    apiPerMin: apiRaw === "" ? null : parseFloat(apiRaw),
    refGpu, siblings: state.speechModels,
    own: mode === "own" ? {
      pricePerKwh: parseFloat(el("kwh").value),
      monthlyAudioHours: parseInt(el("monthlyAudioHours").value, 10),
      capexOverride: el("capex").value.trim() === "" ? null : parseFloat(el("capex").value),
    } : null,
  });
  const N = r.gpusNeeded;
  state.lastSpeech = r;

  const chip = t => `<span class="chip">${t}</span>`;
  el("modelChips").innerHTML =
    chip(tr(isTTS ? "speech.chip.tts" : "speech.chip.stt")) +
    chip(`${fmt(model.params_b, 2)}B`) +
    (model.disk_gb ? chip(`disk ${fmt(model.disk_gb, 1)}GB`) : "") +
    chip(model.license) +
    (model.released ? chip(`released ${model.released}`) : "") +
    (model.catalog ? chip(tr("media.chip.catalog")) : "");
  el("modelNote").innerHTML = mediaLinks(model) +
    (model.note ? `<div class="warn" style="margin-top:4px">${esc(td(model.note))}</div>` : "");

  // "No runtime exists" is the single most useful fact about a speech model and is never on the
  // model card, so it gets a first-class notice — but the sizing is still shown.
  if (model.blocked) {
    el("mediaBlocked").hidden = false;
    el("mediaBlocked").className = "warn-box";
    el("mediaBlocked").innerHTML = `<b>${tr("speech.noruntime")}</b><div style="margin-top:4px">${esc(td(model.blocked.reason))}</div>`;
  } else el("mediaBlocked").hidden = true;
  el("mediaBody").hidden = false;

  const gpuShort = esc(gpu.name.split(" (")[0]);
  el("mediaFitBadge").innerHTML = r.fits
    ? `<span class="badge ok">${tr("dyn.fit.single", { gpu: gpuShort })}</span>`
    : `<span class="badge multi">${tr("dyn.fit.multi", { gpu: gpuShort, n: N })}</span>`;

  const t = r.vramTotal;
  const seg = (v, cls) => `<span class="seg ${cls}" style="width:${(v / t) * 100}%"></span>`;
  el("mediaVramBar").innerHTML = seg(r.weightsGB, "w") + seg(Math.max(0, t - r.weightsGB), "o");
  el("mediaVramNums").innerHTML =
    tr("speech.vram.line", { w: fmt(r.weightsGB), o: fmt(Math.max(0, t - r.weightsGB)), tot: fmt(t) }) +
    tr("dyn.vram.single", { vram: gpu.vram_gb }) +
    (model.measured && model.measured.vram_gb
      ? `<div class="dim" style="margin-top:4px">${tr("speech.vram.measured")}</div>` : "");

  const badge = `<span class="badge ${SPEED_BADGE[r.speedBasis] || "no"}">${tr("media.basis." + r.speedBasis)}</span>`;
  if (r.realtime == null) {
    el("mediaLatency").innerHTML = `<b>—</b> ${badge}<div class="dim">${tr("speech.nospeed")}</div>`;
    el("mediaThroughput").innerHTML = "<b>—</b>";
  } else {
    const slower = r.realtime < 1;
    el("mediaLatency").innerHTML =
      `<b class="${slower ? "warn" : ""}">${fmt(r.realtime, r.realtime < 10 ? 2 : 0)}×</b> <span class="dim">${tr("speech.realtime")}</span> ${badge}` +
      `<div class="dim">${tr("speech.perminute", { s: fmt(r.secondsPerAudioMinute, 1) })}${slower ? " · " + tr("speech.belowrealtime") : ""}</div>`;
    el("mediaThroughput").innerHTML =
      `<b>${fmt(r.audioHoursPerHour, 1)}</b> <span class="dim">${tr("speech.audiohours")}</span>` +
      (r.concurrencyCapped ? `<div class="dim warn">${tr("speech.capped", { c: r.measuredCeiling })}</div>`
        : `<div class="dim">${tr("speech.batchnote")}</div>`);
  }

  renderSpeechCost(r, gpu, N, mode);
  renderSpeechMethod(r, model, gpu, refGpu);
  renderMediaPlacement();
  renderMediaEngines();
}

function renderSpeechCost(r, gpu, N, mode) {
  const box = el("mediaCostBox");
  if (r.realtime == null) { box.innerHTML = `<div class="dim">${tr("media.cost.nospeed")}</div>`; return; }
  if (mode === "own") {
    if (!r.ownAvailable) {
      box.innerHTML = `<div class="dim">${isNaN(parseFloat(el("kwh").value)) ? tr("dyn.own.needkwh") : tr("media.own.needapi")}</div>`;
      return;
    }
    const pb = r.paybackMonths, recovers = pb != null;
    box.innerHTML =
      `<div class="cost-row"><span>${tr("dyn.own.capex")}${N > 1 ? ` (${N}×)` : ""}</span><b>$${fmt(r.capexFleet, 0)}</b></div>` +
      `<div class="cost-row"><span>${tr("dyn.own.elec")} <span class="dim">(active ${fmt(r.activeHours, 1)} GPU-h · ${fmt(r.fleetKw, 2)}kW)</span></span><b>$${fmt(r.elecMonthly, 2)}</b></div>` +
      (r.apiMonthly != null ? `<div class="cost-row"><span>${tr("dyn.own.apicost")}</span><b>$${fmt(r.apiMonthly, 2)}</b></div>` : "") +
      (r.overSubscribed ? `<div class="cost-row" style="border:0"><span style="color:var(--k)">${tr("speech.own.oversub", { max: fmt(r.maxMonthlyAudioHours, 0) })}</span></div>` : "") +
      (r.apiMonthly == null ? `<div class="dim">${tr("media.own.needapi")}</div>`
        : `<div class="verdict ${recovers ? "self" : "api"}">${recovers
            ? tr("dyn.own.recovers", { pb: fmt(pb, 1), warn: pb > 60 ? tr("dyn.own.recovers.warn") : "" })
            : tr("dyn.own.norecover")}</div>` + (recovers ? ownChartSVG(r.tcoSeries, pb) : ""));
    return;
  }
  if (r.rent == null) {
    const kind = gpu.kind === "apple" ? tr("dyn.cost.owned.apple") : gpu.kind === "npu" ? tr("dyn.cost.owned.npu") : tr("dyn.cost.owned.gen");
    box.innerHTML = `<div class="dim">${tr("dyn.cost.owned", { kind, n: N > 1 ? tr("dyn.cost.ownedN", { N }) : "" })}</div>`;
    return;
  }
  let html =
    `<div class="cost-row"><span>${tr("speech.cost.self")} ($${fmt(r.rent, 2)}/hr)</span><b>$${fmt(r.costPerAudioHour, 4)} / ${tr("speech.audiohour")}</b></div>` +
    `<div class="cost-row dim"><span>${tr("speech.cost.permin")}</span><b>$${fmt(r.costPerAudioMin, 5)}</b></div>`;
  if (r.apiPerAudioHour == null) html += `<div class="dim">${tr("speech.cost.noapi")}</div>`;
  else {
    const cheaper = r.verdict === "self";
    html += `<div class="cost-row"><span>${tr("media.cost.apirate")}</span><b>$${fmt(r.apiPerAudioHour, 4)} / ${tr("speech.audiohour")}</b></div>` +
      `<div class="verdict ${cheaper ? "self" : "api"}">${cheaper
        ? tr("speech.cost.cheaper", { v: fmt(r.savingPerAudioHour, 3) })
        : tr("speech.cost.apicheaper", { v: fmt(-r.savingPerAudioHour, 3) })}</div>`;
  }
  box.innerHTML = html;
}

function renderSpeechMethod(r, model, gpu, refGpu) {
  const src = model.measured || (model.measured_from
    ? (state.speechModels.find(x => x.id === model.measured_from) || {}).measured : null);
  const rows = [];
  if (src) {
    rows.push(tr("speech.method.anchor", {
      src: model.measured_from ? esc(model.measured_from) : esc(model.name),
      gpu: esc((refGpu && refGpu.name.split(" (")[0]) || src.gpu),
      engine: esc(src.engine || "-"),
      x: src.realtime_x, c: src.concurrency || 1,
    }));
    if (src.realtime_x_batched) rows.push(tr("speech.method.batched", { x: src.realtime_x_batched, c: src.batched_concurrency }));
    if (src.wer_pct != null) rows.push(tr("speech.method.wer", { w: src.wer_pct, wb: src.wer_pct_batched != null ? src.wer_pct_batched : src.wer_pct }));
    if (model.measured_from) rows.push(tr("speech.method.sibling"));
    if (gpu.id !== MEDIA_REF_GPU) rows.push(tr("speech.method.scaled", { gpu: esc(gpu.name.split(" (")[0]) }));
  } else rows.push(tr("speech.method.none"));
  el("mediaMethod").innerHTML = rows.map(x => `<div>${x}</div>`).join("");
}

function renderMedia() {
  if (isSpeech()) return renderSpeech();
  const model = currentMediaModel();
  if (!model) return;
  const gpu = state.gpus.find(g => g.id === el("gpu").value);
  const refGpu = state.gpus.find(g => g.id === MEDIA_REF_GPU);
  const quant = el("quant").value;
  const mode = document.querySelector('input[name="costmode"]:checked').value;
  const isVideo = model.kind === "video";
  const unit = isVideo ? tr("media.unit.clip") : tr("media.unit.image");

  el("rentGroup").hidden = mode === "own";
  el("ownInputs").hidden = mode !== "own";

  // Chips + note are shared with the LLM path, so they get rebuilt here for media shape.
  const chip = (t) => `<span class="chip">${t}</span>`;
  const total = model.backbone_params_b + (model.text_encoder_params_b || 0);
  el("modelChips").innerHTML =
    chip(model.moe
      ? `${fmt(model.backbone_params_b, 1)}B ${tr("media.chip.total")} · A${fmt(model.backbone_active_params_b, 1)}B ${tr("media.chip.active")}`
      : `${fmt(model.backbone_params_b, 1)}B ${tr("media.chip.backbone")}`) +
    (model.text_encoder_params_b ? chip(`+${fmt(model.text_encoder_params_b, 1)}B ${tr("media.chip.textenc")}`) : "") +
    chip(tr(isVideo ? "media.chip.video" : "media.chip.image") + (model.task ? ` · ${model.task}` : "")) +
    chip(model.license) +
    (model.released ? chip(`released ${model.released}`) : "") +
    (model.catalog ? chip(tr("media.chip.catalog")) : "");
  el("modelNote").innerHTML = mediaLinks(model) +
    (model.note ? `<div class="warn" style="margin-top:4px">${esc(td(model.note))}</div>` : "");

  // A territory restriction is shown, not enforced by refusing to compute: the numbers are what
  // someone needs in order to decide whether to pursue a licence, or to plan where it could run.
  // The licence text itself is one click away so the user can read the clause, not just our summary.
  if (model.restriction) {
    el("mediaBlocked").hidden = false;
    el("mediaBlocked").className = "warn-box";
    el("mediaBlocked").innerHTML =
      `<b>${tr("media.restrict.title", { t: model.restriction.territories.join(" · ") })}</b>` +
      `<div style="margin-top:4px">${esc(td(model.restriction.summary))}</div>` +
      (model.license_url
        ? `<div style="margin-top:6px"><a href="${esc(model.license_url)}" target="_blank" rel="noopener">${tr("media.restrict.readlicense", { name: esc(model.license) })}</a></div>`
        : "");
  } else {
    el("mediaBlocked").hidden = true;
  }
  el("mediaBody").hidden = false;

  const steps = parseInt(el("steps").value, 10);
  const [w, h] = el("resolution").value.split("x").map(Number);
  const frames = isVideo ? parseInt(el("frames").value, 10) : 1;
  const rentRaw = el("rent").value.trim();
  const apiRaw = el("api").value.trim();

  const r = LLMCalc.computeMedia(model, gpu, quant, {
    steps, width: w, height: h, frames, batch: 1, cfg: el("cfg").checked,
    rentOverride: rentRaw === "" ? null : parseFloat(rentRaw),
    apiPerItem: apiRaw === "" ? null : parseFloat(apiRaw),
    refGpu, siblings: state.media,
    own: mode === "own" ? mediaOwnInput() : null,
  });
  const N = r.gpusNeeded;

  el("stepsLabel").textContent = `${steps} steps`;
  el("mitemLabel").textContent = tr("media.mitemlab", { n: Number(el("monthlyItems").value).toLocaleString(), unit });
  el("mitemLabelText").textContent = tr(isVideo ? "lbl.mitem.clip" : "lbl.mitem.image");
  if (isVideo) el("framesLabel").textContent = tr("media.frameslab",
    { n: frames, s: fmt(frames / (model.fps || 24), 1), fps: model.fps || 24 });

  const gpuShortName = esc(gpu.name.split(" (")[0]);
  el("mediaFitBadge").innerHTML = r.fits
    ? `<span class="badge ok">${tr("dyn.fit.single", { gpu: gpuShortName })}</span>`
    : `<span class="badge multi">${tr("dyn.fit.multi", { gpu: gpuShortName, n: N })}</span>`;

  // VRAM bar: backbone / text encoder / VAE+activations. The text encoder is broken out on
  // purpose — it is routinely a third of resident memory and routinely forgotten.
  const t = r.vramTotal;
  const seg = (v, cls) => `<span class="seg ${cls}" style="width:${(v / t) * 100}%"></span>`;
  let ticks = "";
  for (let i = 1; i <= N && i * gpu.vram_gb < t; i++)
    ticks += `<span class="cap" style="left:${(i * gpu.vram_gb / t) * 100}%"></span>`;
  el("mediaVramBar").innerHTML =
    seg(r.backboneGB, "w") + seg(r.encoderGB, "k") + seg(r.vaeGB + r.activationGB, "o") + ticks;
  el("mediaVramNums").innerHTML =
    tr("media.vram.line", { b: fmt(r.backboneGB), e: fmt(r.encoderGB), o: fmt(r.vaeGB + r.activationGB), tot: fmt(r.vramTotal) }) +
    (N > 1 ? tr("dyn.vram.multi", { n: N, vram: gpu.vram_gb, total: fmt(r.totalVram) }) : tr("dyn.vram.single", { vram: gpu.vram_gb })) +
    `<div class="dim" style="margin-top:4px">${tr("media.vram.tokens", { tok: r.tokens.toLocaleString() })}</div>`;

  // Latency + the honesty badge that says where the number came from.
  const basis = r.speedBasis;
  const badge = `<span class="badge ${SPEED_BADGE[basis] || "no"}">${tr("media.basis." + basis)}</span>`;
  if (r.secondsPerItem == null) {
    el("mediaLatency").innerHTML = `<b>—</b> ${badge}` +
      `<div class="dim">${tr(basis === "unmodelled" ? "media.nospeed.unet" : "media.nospeed.tflops", { gpu: gpuShortName })}</div>`;
    el("mediaThroughput").innerHTML = `<b>—</b>`;
  } else {
    const s = r.secondsPerItem;
    const pretty = s >= 60 ? tr("media.mmss", { m: Math.floor(s / 60), s: fmt(s % 60, 0) }) : `${fmt(s, s < 10 ? 2 : 1)}s`;
    el("mediaLatency").innerHTML = `<b>${pretty}</b> <span class="dim">/ ${unit}</span> ${badge}` +
      (N > 1 ? `<div class="dim">${tr("media.latency.nnote", { n: N })}</div>` : "");
    el("mediaThroughput").innerHTML = `<b>${fmt(r.itemsPerHour, r.itemsPerHour < 10 ? 1 : 0)}</b> <span class="dim">${unit}/h</span>` +
      `<div class="dim">${tr("media.batchnote")}</div>`;
  }

  state.lastMedia = r;
  renderMediaCost(r, model, gpu, N, unit, mode);
  renderMediaMethod(r, model, gpu, refGpu, unit);
  renderMediaPlacement();
  renderMediaEngines();
}

function renderMediaCost(r, model, gpu, N, unit, mode) {
  const box = el("mediaCostBox");
  if (r.secondsPerItem == null) { box.innerHTML = `<div class="dim">${tr("media.cost.nospeed")}</div>`; return; }

  if (mode === "own") {
    if (!r.ownAvailable) {
      box.innerHTML = `<div class="dim">${isNaN(parseFloat(el("kwh").value)) ? tr("dyn.own.needkwh") : tr("media.own.needapi")}</div>`;
      return;
    }
    const fleet = N > 1 ? ` (${N}×)` : "";
    const pb = r.paybackMonths, recovers = pb != null;
    box.innerHTML =
      `<div class="cost-row"><span>${tr("dyn.own.capex")}${fleet}</span><b>$${fmt(r.capexFleet, 0)}</b></div>` +
      `<div class="cost-row"><span>${tr("dyn.own.elec")} <span class="dim">(active ${fmt(r.activeHours, 0)} GPU-h · ${fmt(r.fleetKw, 2)}kW)</span></span><b>$${fmt(r.elecMonthly, 2)}</b></div>` +
      (r.apiMonthly != null ? `<div class="cost-row"><span>${tr("dyn.own.apicost")}</span><b>$${fmt(r.apiMonthly, 2)}</b></div>` : "") +
      (r.overSubscribed ? `<div class="cost-row" style="border:0"><span style="color:var(--k)">${tr("media.own.oversub", { max: fmt(r.maxMonthlyItems, 0), unit })}</span></div>` : "") +
      (r.apiMonthly == null
        ? `<div class="dim">${tr("media.own.needapi")}</div>`
        : `<div class="verdict ${recovers ? "self" : "api"}">${recovers
            ? tr("dyn.own.recovers", { pb: fmt(pb, 1), warn: pb > 60 ? tr("dyn.own.recovers.warn") : "" })
            : tr("dyn.own.norecover")}</div>` + (recovers ? ownChartSVG(r.tcoSeries, pb) : ""));
    return;
  }

  if (r.rent == null) {
    const kind = gpu.kind === "apple" ? tr("dyn.cost.owned.apple") : gpu.kind === "npu" ? tr("dyn.cost.owned.npu") : tr("dyn.cost.owned.gen");
    box.innerHTML = `<div class="dim">${tr("dyn.cost.owned", { kind, n: N > 1 ? tr("dyn.cost.ownedN", { N }) : "" })}</div>`;
    return;
  }
  const fleet = N > 1 ? ` (${N}× $${fmt(r.rent, 2)} = $${fmt(r.fleetRentHr, 2)}/hr)` : ` ($${fmt(r.rent, 2)}/hr)`;
  let html =
    `<div class="cost-row"><span>${tr("media.cost.selfrate")}${fleet}</span><b>$${fmt(r.costPerItem, 4)} / ${unit}</b></div>` +
    `<div class="cost-row dim"><span>${tr("media.cost.per1000", { unit })}</span><b>$${fmt(r.costPer1000, 2)}</b></div>`;
  if (r.apiPerItem == null) {
    // No verified list price for this modality — say so instead of comparing against a guess.
    html += `<div class="dim">${tr("media.cost.noapi")}</div>`;
  } else {
    const cheaper = r.verdict === "self";
    html += `<div class="cost-row"><span>${tr("media.cost.apirate")}</span><b>$${fmt(r.apiPerItem, 4)} / ${unit}</b></div>` +
      `<div class="verdict ${cheaper ? "self" : "api"}">${cheaper
        ? tr("media.cost.cheaper", { v: fmt(r.savingPerItem, 4), unit })
        : tr("media.cost.apicheaper", { v: fmt(-r.savingPerItem, 4), unit })}</div>`;
  }
  box.innerHTML = html;
}

// The provenance block. Anyone reading a cost-per-image deserves to see which run it descends
// from, at what settings, and on which device — otherwise the number is unfalsifiable.
function renderMediaMethod(r, model, gpu, refGpu, unit) {
  const m = model.measured || (model.measured_from
    ? (state.media.find(x => x.id === model.measured_from) || {}).measured : null);
  const rows = [];
  if (m) {
    const at = model.kind === "video"
      ? tr("media.method.atvideo", { w: m.width, h: m.height, f: m.frames, s: m.steps })
      : tr("media.method.atimage", { w: m.width, h: m.height, s: m.steps });
    rows.push(tr("media.method.anchor", {
      src: model.measured_from ? esc(model.measured_from) : esc(model.name),
      gpu: esc((refGpu && refGpu.name.split(" (")[0]) || m.gpu), sec: m.seconds, at,
    }));
    rows.push(tr("media.method.scaled", { gpu: esc(gpu.name.split(" (")[0]), tf: fmt(gpu.tflops_bf16, 0) }));
  } else if (r.speedBasis === "estimated") {
    rows.push(tr("media.method.roofline", { mfu: Math.round(LLMCalc.MEDIA_MFU * 100) }));
  }
  rows.push(tr("media.method.flops", { g: fmt(LLMCalc.mediaFlops(model, r.tokens, r.steps, r.passes, 1) / 1e12, 0) }));
  rows.push(tr("media.method.quant"));
  el("mediaMethod").innerHTML = rows.map(x => `<div>${x}</div>`).join("");
}

// ---- Placement + serving-readiness tabs for image / video / speech ---------

// Throughput of ONE instance, in the unit that modality is measured in.
function mediaInstanceThroughput(model) {
  if (isSpeech()) {
    const r = state.lastSpeech;
    return r && r.realtime != null ? { value: r.realtime, unit: tr("speech.audiohours"), gpus: r.gpusNeeded } : { value: null, unit: "", gpus: 1 };
  }
  const r = state.lastMedia;
  const unit = model.kind === "video" ? tr("media.unit.clip") : tr("media.unit.image");
  return r && r.itemsPerHour != null ? { value: r.itemsPerHour, unit: unit + "/h", gpus: r.gpusNeeded } : { value: null, unit: "", gpus: r ? r.gpusNeeded : 1 };
}

function renderMediaPlacement() {
  const model = currentMediaModel();
  if (!model) return;
  const gpu = state.gpus.find(g => g.id === el("gpu").value);
  const per = mediaInstanceThroughput(model);
  const nodes = state.mplaceNodes;
  const p = LLMCalc.placement(nodes, per.gpus, per.value);

  el("mplaceModelName").innerHTML = `<a href="https://huggingface.co/${esc(model.hf)}" target="_blank" rel="noopener">${esc(model.name)}</a>`;
  el("mplaceChips").innerHTML = `<span class="chip">${esc(model.kind)}</span><span class="chip">${per.gpus} GPU / ${tr("mplace.instance")}</span>`;
  el("mplaceGpuName").textContent = "· " + gpu.name.split(" (")[0];
  el("mplaceBadge").innerHTML = p.shortOfOne
    ? `<span class="badge no">${tr("mplace.short", { n: per.gpus })}</span>`
    : `<span class="badge ok">${tr("mplace.replicas", { r: p.replicas })}</span>`;

  el("mplaceSummary").innerHTML =
    tr("mplace.summary", { n: nodes, per: per.gpus, r: p.replicas }) +
    // "0 replicas and N idle" is technically true but reads as a rounding quirk; when the fleet
    // cannot host even one instance, say that instead.
    (p.shortOfOne
      ? `<div class="dim warn" style="margin-top:4px">${tr("mplace.shortnote", { n: per.gpus })}</div>`
      : p.idleGpus > 0 ? `<div class="dim warn" style="margin-top:4px">${tr("mplace.idle", { i: p.idleGpus })}</div>` : "") +
    (p.throughput != null
      ? `<div style="margin-top:6px">${tr("mplace.throughput", { v: fmt(p.throughput, p.throughput < 10 ? 1 : 0), unit: per.unit })}</div>`
      : `<div class="dim" style="margin-top:6px">${tr("mplace.nothroughput")}</div>`);

  const ladder = [1, 2, 4, 8, 16, 32].map(n => {
    const q = LLMCalc.placement(n, per.gpus, per.value);
    const max = per.value != null ? per.value * Math.floor(32 / per.gpus) : 1;
    const pct = q.throughput != null && max ? (q.throughput / max) * 100 : 0;
    return `<button type="button" class="ladder-row${n === nodes ? " sel" : ""}" data-n="${n}" aria-pressed="${n === nodes}">
      <span class="lr-label">${n}× GPU</span>
      <span class="lr-bar"><span class="lr-fit" style="width:${pct}%"></span></span>
      <span class="lr-gb">${q.replicas} ${tr("mplace.rep")}</span>
      <span class="lr-tok">${q.throughput != null ? fmt(q.throughput, q.throughput < 10 ? 1 : 0) : "—"}</span>
    </button>`;
  }).join("");
  el("mplaceLadder").innerHTML = ladder;

  el("mplaceWhy").innerHTML = (isSpeech()
    ? [tr("mplace.why.speech1"), tr("mplace.why.speech2")]
    : [tr("mplace.why.media1"), tr("mplace.why.media2")]).map(x => `<div>${x}</div>`).join("");
}

// One renderer for the three engine tabs — they answer the same question with different data.
const ENGINE_PANELS = [
  { key: "pytorch", badge: "mpytorchBadge", verdict: "mpytorchVerdict", cmd: "mpytorchCmd" },
  { key: "vllm", badge: "mvllmBadge", verdict: "mvllmVerdict", cmd: "mvllmCmd" },
  { key: "tensorrt", badge: "mtrtBadge", verdict: "mtrtVerdict", cmd: "mtrtCmd" },
];

function renderMediaEngines() {
  const model = currentMediaModel();
  if (!model || !state.serving) return;
  const entry = (state.serving.models || {})[model.id] || {};
  const engines = state.serving.engines || {};
  const viaLabel = state.serving.via_label || {};

  for (const p of ENGINE_PANELS) {
    const sup = entry[p.key];
    const meta = engines[p.key] || {};
    if (!sup) {
      el(p.badge).innerHTML = `<span class="badge no">${tr("rd.tier.unknown")}</span>`;
      el(p.verdict).innerHTML = `<div class="dim">${tr("serve.nodata")}</div>`;
      el(p.cmd).innerHTML = "";
      continue;
    }
    const via = sup.via ? (viaLabel[sup.via] || sup.via) : null;
    el(p.badge).innerHTML = `<span class="badge ${TIER_BADGE[sup.tier] || "no"}">${tr("rd.tier." + sup.tier)}</span>`;

    const lines = [];
    if (via) lines.push(`<div class="cost-row"><span>${tr("serve.via")}</span><b>${esc(via)}</b></div>`);
    if (sup.lib) lines.push(`<div class="cost-row"><span>${tr("serve.lib")}</span><b>${esc(sup.lib)}${sup.min_version ? ` ≥ ${esc(sup.min_version)}` : ""}</b></div>`);
    if (sup.pipeline) lines.push(`<div class="cost-row"><span>${tr("serve.pipeline")}</span><b><code>${esc(sup.pipeline)}</code></b></div>`);
    if (sup.arch) lines.push(`<div class="cost-row"><span>${tr("serve.arch")}</span><b><code>${esc(sup.arch)}</code></b></div>`);
    if (sup.served_id) lines.push(`<div class="cost-row"><span>${tr("serve.servedid")}</span><b><code>${esc(sup.served_id)}</code></b></div>`);
    const caveats = (sup.caveats || []).map(c => `<div class="warn" style="margin-top:6px">${esc(td(c))}</div>`).join("");
    const docs = sup.docs || meta.docs;
    el(p.verdict).innerHTML = lines.join("") + caveats +
      (meta.sub ? `<div class="dim" style="margin-top:8px">${esc(meta.sub)}</div>` : "") +
      (docs ? `<div style="margin-top:6px"><a href="${esc(docs)}" target="_blank" rel="noopener">${tr("serve.docs")}</a></div>` : "");

    el(p.cmd).innerHTML = servingSnippet(p.key, model, sup, meta);
  }
}

// A copy-pasteable snippet, or an honest explanation of why there isn't one.
function servingSnippet(key, model, sup, meta) {
  const dead = ["unsupported", "unknown"].includes(sup.tier);
  if (dead) return `<div class="dim">${tr("serve.nocmd")}</div>`;
  const code = t => `<pre class="code"><code>${esc(t)}</code></pre>`;

  if (key === "vllm") {
    const id = sup.served_id || model.hf;
    if (sup.via === "vllm-omni")
      return code(`${meta.install || ""}\n\n# serve (OpenAI-compatible)\n${(meta.serve_omni || "vllm serve {model} --omni --port 8091").replace("{model}", id)}`) +
        `<div class="dim">${tr("serve.omninote")}</div>`;
    return code(`${(meta.serve_core || "vllm serve {model} --port 8000").replace("{model}", id)}\n\n# transcribe\ncurl http://localhost:8000/v1/audio/transcriptions \\\n  -F model=${id} -F file=@sample.wav`);
  }
  if (key === "tensorrt") {
    if (sup.via === "trtllm-visualgen")
      return code(`trtllm-serve ${model.hf} \\\n  --backend visual_gen --port 8000\n\n# then POST /v1/images/generations`) +
        `<div class="dim">${tr("serve.trtbeta")}</div>`;
    if (sup.via === "trtllm-whisper")
      return code(`# TensorRT-LLM examples/models/core/whisper\npython3 convert_checkpoint.py --model_dir ${model.hf}\ntrtllm-build --checkpoint_dir ./ckpt --output_dir ./engine\npython3 run.py --engine_dir ./engine --input_file sample.wav`);
    if (sup.via === "trt-demo-diffusion")
      return code(`# NVIDIA/TensorRT demo/Diffusion (engine build, fixed resolution)\npython3 demo_txt2img_xl.py "a photo" --build-static-batch --denoising-steps 30`) +
        `<div class="dim">${tr("serve.trtstatic")}</div>`;
    return `<div class="dim">${tr("serve.nocmd")}</div>`;
  }
  // pytorch
  if (sup.lib === "diffusers") {
    const isVideo = model.kind === "video";
    return code(`pip install "diffusers>=${sup.min_version || "0.35"}" transformers accelerate\n\n` +
      `from diffusers import ${sup.pipeline}\nimport torch\n` +
      `pipe = ${sup.pipeline}.from_pretrained("${model.hf}", torch_dtype=torch.bfloat16).to("cuda")\n` +
      (isVideo
        ? `out = pipe(prompt="...", num_frames=${model.frames || 81}, num_inference_steps=${model.default_steps || 40})`
        : `img = pipe(prompt="...", num_inference_steps=${model.default_steps || 20}).images[0]`)) +
      `<div class="dim">${tr("serve.noserver")}</div>`;
  }
  if (sup.lib === "transformers")
    return code(`pip install "transformers${sup.min_version ? ">=" + sup.min_version : ""}" accelerate\n\n` +
      `from transformers import AutoProcessor, ${sup.pipeline || "AutoModel"}\n` +
      `model = ${sup.pipeline || "AutoModel"}.from_pretrained("${model.hf}", torch_dtype="bfloat16", device_map="cuda")`) +
      `<div class="dim">${tr("serve.noserver")}</div>`;
  if (sup.lib)
    return code(`pip install ${sup.lib}\n# ${model.hf}`) + `<div class="dim">${tr("serve.pkgnote")}</div>`;
  return `<div class="dim">${tr("serve.nocmd")}</div>`;
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

  renderVersions("vllmVersions", support, support.vllm_version);
  const curatedModel = vllmState.fetched ? null : state.models.find(m => m.id === el("model").value);
  renderToolCalling("vllmToolCalling", "vllm", verdict.arch, curatedModel, support, verdict, "vLLM");

  renderManifest();
}

function renderManifest() {
  if (!vllmState.manifests) return;
  el("manifestCode").textContent = vllmState.manifests[vllmState.active] || "";
}

// ---- Shared: engine version history + per-model tool-calling ---------------
// pickLang: render a {ko,en} object OR a ko-source string (via DATA map) in the current language.
function pickLang(v) {
  if (v == null) return "";
  if (typeof v === "string") return I18N.td(v);
  const l = I18N.lang;
  return v[l] != null ? v[l] : (v.ko != null ? v.ko : (v.en != null ? v.en : ""));
}
function versionIsCurrent(v, currentVer) {
  return String(currentVer || "").indexOf(String(v.version)) === 0;
}
function renderVersions(containerId, support, currentVer) {
  const box = el(containerId); if (!box) return;
  const vers = LLMCalc.engineVersionHistory(support);
  box.innerHTML = vers.map(v => {
    const cur = versionIsCurrent(v, currentVer);
    const curBadge = cur ? ` <span class="badge ok">${tr("dyn.rd.ver.current")}</span>` : "";
    const patch = v.latest_patch && v.latest_patch !== v.version ? ` <span class="dim">(${esc(v.latest_patch)})</span>` : "";
    const rel = v.released ? ` <span class="dim">· ${tr("dyn.rd.ver.released", { d: esc(v.released) })}</span>` : "";
    const docs = v.docs ? ` · <a href="${esc(v.docs)}" target="_blank" rel="noopener">${tr("dyn.rd.ver.docs")}</a>` : "";
    const hi = (v.highlights || []).map(h => `<li>${pickLang(h)}</li>`).join("");
    const flags = (v.notable_flags || []).length
      ? `<div class="dim ver-flags"><b>${tr("dyn.rd.ver.flags")}:</b> ${v.notable_flags.map(f => `<code>${esc(f)}</code>`).join(" ")}</div>` : "";
    return `<div class="ver-card${cur ? " cur" : ""}"><div class="ver-head"><b>v${esc(v.version)}</b>${patch}${curBadge}${rel}${docs}</div>${hi ? `<ul class="ver-hi">${hi}</ul>` : ""}${flags}</div>`;
  }).join("");
}
function renderToolCalling(containerId, engine, arch, model, support, verdict, engineLabel) {
  const box = el(containerId); if (!box) return;
  if (verdict && verdict.tier === "incompatible") {
    box.innerHTML = `<div class="dim warn">${tr("dyn.rd.tool.na", { engine: esc(engineLabel) })}</div>`;
    return;
  }
  const tcfg = LLMCalc.toolCallingConfig(arch, model, support, engine);
  const srcKey = tcfg.source === "model" ? "dyn.rd.tool.src.model"
    : tcfg.source === "arch" ? "dyn.rd.tool.src.arch" : "dyn.rd.tool.src.default";
  const src = `<div class="dim" style="margin-top:6px">${tr(srcKey, { arch: esc(arch || "—") })}</div>`;
  const note = tcfg.note ? `<div class="dim" style="margin-top:4px">${pickLang(tcfg.note)}</div>` : "";
  if (!tcfg.tool_parser) { box.innerHTML = `<div>${tr("dyn.rd.tool.none")}</div>${note}${src}`; return; }
  const rows = `<div><b>${tr("dyn.rd.tool.parser")}:</b> <code>${esc(tcfg.tool_parser)}</code></div>` +
    (tcfg.reasoning_parser ? `<div><b>${tr("dyn.rd.tool.reasoning")}:</b> <code>${esc(tcfg.reasoning_parser)}</code></div>` : "");
  const flags = `<div class="dim" style="margin-top:6px">${tr("dyn.rd.tool.add")}</div>` +
    `<pre class="code small"><code>${esc(tcfg.flags.join(" \\\n  "))}</code></pre>`;
  box.innerHTML = rows + note + flags + src;
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

  renderVersions(o.ids.versions, support, support.version);
  const engineModel = ctx.verdictInput.curated || null;
  renderToolCalling(o.ids.toolCalling, o.engine, verdict.arch, engineModel, support, verdict, o.engineLabel);
}

function renderSglang(r) {
  renderEngineTab({
    engine: "sglang", engineLabel: "SGLang", support: state.sglang, ctx: engineModelContext(r),
    verdictFn: LLMCalc.sglangVerdict, specFn: LLMCalc.buildSglangSpec, state: sglangState,
    ids: { badge: "sglangBadge", verdict: "sglangVerdictBox", params: "sglangParams", manifestCode: "sglangManifestCode",
      versions: "sglangVersions", toolCalling: "sglangToolCalling" },
  });
}
function renderTrt(r) {
  renderEngineTab({
    engine: "trtllm", engineLabel: "TensorRT-LLM", support: state.trtllm, ctx: engineModelContext(r),
    verdictFn: LLMCalc.trtllmVerdict, specFn: LLMCalc.buildTrtllmSpec, state: trtState,
    ids: { badge: "trtBadge", verdict: "trtVerdictBox", params: "trtParams", manifestCode: "trtManifestCode",
      versions: "trtVersions", toolCalling: "trtToolCalling" },
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

// Switch between text-LLM and the two diffusion modalities. The LLM path must come back
// byte-identical when the user switches back, so nothing here mutates LLM state.
function applyCategory(cat) {
  state.cat = cat;
  const media = isMedia();

  const speech = cat === "speech";
  const diffusion = media && !speech;
  el("llmOnlyInputs").hidden = media;
  el("ctxRow").hidden = media;
  el("concRow").hidden = diffusion;          // diffusion is batch-1; concurrency is meaningless there
  el("mediaInputs").hidden = !diffusion;
  el("videoInputs").hidden = cat !== "video";
  el("mtokRow").hidden = media;
  el("mitemRow").hidden = !diffusion;
  el("maudioRow").hidden = !speech;
  el("apiLabelText").textContent = speech ? tr("lbl.api.min")
    : media ? tr(cat === "video" ? "lbl.api.clip" : "lbl.api.image") : tr("lbl.api");

  // Model dropdown swaps source; keep the selection if the id still exists.
  const prev = el("model").value;
  el("model").innerHTML = "";
  if (speech) {
    mediaList().forEach(m => {
      const tag = m.kind.toUpperCase();
      el("model").appendChild(opt(m.id, `${m.name} · ${tag} · ${fmt(m.params_b, 2)}B${m.blocked ? " ⛔" : ""}`));
    });
  } else if (media) {
    mediaList().forEach(m => {
      const size = m.moe ? `${fmt(m.backbone_params_b, 0)}B·A${fmt(m.backbone_active_params_b, 0)}B` : `${fmt(m.backbone_params_b, 1)}B`;
      const flag = m.restriction ? " ⚠️" : "";
      el("model").appendChild(opt(m.id, `${m.name} · ${size}${flag}`));
    });
  } else {
    state.models.forEach(m => {
      const tag = m.moe ? `${fmt(m.total_params_b, 0)}B·A${fmt(m.active_params_b, 0)}B MoE` : `${fmt(m.total_params_b, 0)}B`;
      el("model").appendChild(opt(m.id, `${m.name} · ${tag} · ${m.released}`));
    });
  }
  if ([...el("model").options].some(o => o.value === prev)) el("model").value = prev;

  // API preset list is modality-specific.
  el("apiPreset").innerHTML = "";
  if (speech) {
    speechPresetList().forEach((p, i) => el("apiPreset").appendChild(opt(String(i),
      p.usd_per_min == null ? p.label : `${p.provider ? p.provider + " " : ""}${p.label} — $${p.usd_per_min}/min`)));
    const first = speechPresetList()[0];
    el("api").value = first && first.usd_per_min != null ? first.usd_per_min : "";
  } else if (media) {
    state.mediaPresets
      .filter(p => p.kind === "any" || p.kind === cat)
      .forEach((p, i) => el("apiPreset").appendChild(opt(String(i),
        p.usd_per_item == null ? p.label : `${p.provider ? p.provider + " " : ""}${p.label} — $${p.usd_per_item}/${cat === "video" ? "clip" : "img"}`)));
    const first = state.mediaPresets.filter(p => p.kind === "any" || p.kind === cat)[0];
    el("api").value = first && first.usd_per_item != null ? first.usd_per_item : "";
  } else {
    state.apiPresets.forEach((p, i) => {
      const io = (p.input != null && p.output != null) ? ` (in $${p.input} / out $${p.output})` : "";
      el("apiPreset").appendChild(opt(i, `${p.provider ? p.provider + " " : ""}${p.label} — blended $${p.usd_per_1m}/1M${io}`));
    });
    el("apiPreset").value = "1";
    el("api").value = state.apiPresets[1].usd_per_1m;
  }

  document.querySelectorAll("#resultTabs .tab").forEach(t => {
    t.hidden = media ? t.dataset.cat !== "media" : t.dataset.cat !== "llm";
  });
  // Diffusion pipelines are served at bf16 or fp8; nobody runs a DiT at INT4/AWQ the way they do
  // an LLM, and our own measurements are bf16. Carrying the LLM tab's int4 default across would
  // quietly show a VRAM figure for a configuration that does not exist in practice.
  if (media && ["int4", "nvfp4", "mxfp4"].includes(el("quant").value)) el("quant").value = "fp16";
  if (diffusion) applyMediaModelDefaults();
  switchResultTab(media ? "media" : "calc");
}

// Pull the model card's own defaults into the controls when the selected media model changes,
// including its resolution ladder (a 480p video model and a 1328px image model differ).
function applyMediaModelDefaults() {
  const model = mediaList().find(m => m.id === el("model").value) || mediaList()[0];
  if (!model) return;
  const isVideo = model.kind === "video";
  const list = (isVideo ? VIDEO_RES : IMAGE_RES).slice();
  const own = [model.width, model.height];
  if (own[0] && !list.some(([w, h]) => w === own[0] && h === own[1])) list.push(own);
  list.sort((a, b) => a[0] * a[1] - b[0] * b[1]);
  el("resolution").innerHTML = "";
  list.forEach(([w, h]) => el("resolution").appendChild(opt(`${w}x${h}`, `${w} × ${h}`)));
  if (model.width) el("resolution").value = `${model.width}x${model.height}`;

  el("steps").value = model.default_steps || 20;
  el("cfg").checked = (model.cfg_passes || 1) > 1;
  if (isVideo && model.frames) el("frames").value = model.frames;
  el("videoInputs").hidden = !isVideo;
}

function switchResultTab(which) {
  document.querySelectorAll("#resultTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.panel === which));
  el("panelMedia").hidden = which !== "media";
  el("panelMPlace").hidden = which !== "mplace";
  el("panelMPytorch").hidden = which !== "mpytorch";
  el("panelMVllm").hidden = which !== "mvllm";
  el("panelMTrt").hidden = which !== "mtrt";
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
    if (isSpeech()) {
      const p = speechPresetList()[parseInt(el("apiPreset").value, 10)];
      el("api").value = p && p.usd_per_min != null ? p.usd_per_min : "";
    } else if (isMedia()) {
      const list = state.mediaPresets.filter(p => p.kind === "any" || p.kind === state.cat);
      const p = list[parseInt(el("apiPreset").value, 10)];
      el("api").value = p && p.usd_per_item != null ? p.usd_per_item : "";
    } else {
      const p = state.apiPresets[parseInt(el("apiPreset").value, 10)];
      if (p) el("api").value = p.usd_per_1m;
    }
    render();
  });
  ["gpu", "quant", "context", "concurrency", "rent", "api", "kwh", "monthlyTokens", "capex",
    "steps", "frames", "monthlyItems", "monthlyAudioHours"].forEach(id => el(id).addEventListener("input", render));
  ["resolution", "cfg"].forEach(id => el(id).addEventListener("change", render));
  document.querySelectorAll('input[name="costmode"]').forEach(radio => radio.addEventListener("change", render));

  document.querySelectorAll('input[name="mplacenodes"]').forEach(radio =>
    radio.addEventListener("change", () => { state.mplaceNodes = parseInt(radio.value, 10); render(); }));
  el("mplaceLadder").addEventListener("click", (e) => {
    const row = e.target.closest(".ladder-row");
    if (row && row.dataset.n) {
      state.mplaceNodes = parseInt(row.dataset.n, 10);
      const r = document.querySelector(`input[name="mplacenodes"][value="${state.mplaceNodes}"]`);
      if (r) r.checked = true;
      render();
    }
  });

  document.querySelectorAll('#catToggle input[name="cat"]').forEach(radio =>
    radio.addEventListener("change", () => { applyCategory(radio.value); render(); }));

  // Selecting a curated model from the dropdown overrides any fetched HF model.
  el("model").addEventListener("change", () => {
    vllmState.fetched = null;
    el("hfRef").value = ""; el("hfRefStatus").textContent = ""; el("hfFetchBtn").hidden = true;
    if (isMedia() && !isSpeech()) applyMediaModelDefaults();
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
