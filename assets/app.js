/* llm-selfhost-calculator — client-side UI glue. No backend, no keys, no data leaves the browser.
   Pure estimation core lives in compute.js (LLMCalc.compute), shared with the Node unit tests. */

const compute = LLMCalc.compute;
const state = { models: [], gpus: [], apiPresets: [], speech: null, vllm: null };

// vLLM tab state: fetched = {id, config} for an arbitrary HF model (null = use curated dropdown);
// manifests/spec cached from last render; active = which manifest tab is shown.
const vllmState = { fetched: null, spec: null, manifests: null, active: "compose" };

async function loadData() {
  const [m, g, a, s, v] = await Promise.all([
    fetch("data/models.json").then(r => r.json()),
    fetch("data/gpus.json").then(r => r.json()),
    fetch("data/api-prices.json").then(r => r.json()),
    fetch("data/speech.json").then(r => r.json()),
    fetch("data/vllm-support.json").then(r => r.json()),
  ]);
  state.models = m.models;
  state.gpus = g.gpus;
  state.apiPresets = a.presets;
  state.speech = s;
  state.vllm = v;
}

function fmt(x, d = 1) { return x == null || isNaN(x) ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d }); }

// Owned/on-prem purchase payback rendering (capex + electricity → months to break even vs API).
function renderOwnCost(cost, r, N) {
  if (!r.ownAvailable) {
    const msg = isNaN(parseFloat(el("kwh").value))
      ? "전기 단가($/kWh)를 입력하면 회수 개월수를 계산합니다."
      : `이 기기는 공개 구매가 또는 전력값이 없습니다 — 왼쪽에서 <b>구매가 override</b>를 입력하면 회수 개월수를 계산합니다.${N > 1 ? ` (이 모델은 ${N}대 필요)` : ""}`;
    cost.innerHTML = `<div class="dim">${msg}</div>`;
    return;
  }
  const fleet = N > 1 ? ` (${N}×)` : "";
  const pb = r.paybackMonths, recovers = pb != null;
  cost.innerHTML =
    `<div class="cost-row"><span>장비 capex${fleet}</span><b>$${fmt(r.capexFleet, 0)}</b></div>` +
    `<div class="cost-row"><span>월 전기료 <span class="dim">(active ${fmt(r.activeHours, 0)} GPU-h · ${fmt(r.fleetKw, 2)}kW)</span></span><b>$${fmt(r.elecMonthly, 2)}</b></div>` +
    `<div class="cost-row"><span>월 API 비용 (대체분)</span><b>$${fmt(r.apiMonthly, 2)}</b></div>` +
    `<div class="cost-row dim"><span>월 순절감 (API − 전기)</span><b>$${fmt(r.monthlyNetSaving, 2)}</b></div>` +
    (r.overSubscribed ? `<div class="cost-row" style="border:0"><span style="color:var(--k)">⚠️ 이 처리량으론 월 ${fmt(r.activeHours, 0)} GPU-h(&gt;730h/월)가 필요 — 실제론 이 볼륨을 다 못 뽑습니다. GPU를 늘리거나 월 토큰량을 낮추세요.</span></div>` : "") +
    `<div class="verdict ${recovers ? "self" : "api"}">${recovers
      ? `이 토큰량이면 약 <b>${fmt(pb, 1)}개월</b>에 구매비를 회수합니다${pb > 60 ? ` — 다만 <b>5년+</b>라 감가·고장 전에 못 뽑을 수 있습니다` : ""}. GPU를 이만큼 꾸준히 돌린다는 가정입니다.`
      : `이 토큰량에서는 <b>전기료 ≥ 대체 API 비용</b>이라 자체호스팅이 되레 비싸 <b>회수되지 않습니다</b>. 월 토큰량을 늘리거나 더 싼 전기/장비가 필요합니다.`}</div>` +
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
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="margin-top:12px" role="img" aria-label="누적 비용 곡선">` +
    crossMark + line("api", "var(--k)") + line("selfhost", "var(--ok)") + `</svg>` +
    `<div class="dim" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:2px">` +
    `<span><span class="dot" style="background:var(--ok)"></span>구매 누적 (capex+전기)</span>` +
    `<span><span class="dot" style="background:var(--k)"></span>API 누적</span>` +
    `<span>${inWindow ? `┊ ${fmt(pb, 1)}개월 교차` : `${fmt(pb, 1)}개월 (36개월 창 밖)`}</span></div>`;
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
  el("mtokLabel").textContent = fmt(monthlyTokensB) + "B tok/월";

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

  el("fitBadge").innerHTML = r.fits
    ? `<span class="badge ok">✅ ${gpu.name.split(" (")[0]} 1개에 들어감</span>`
    : `<span class="badge multi">🔀 ${gpu.name.split(" (")[0]} <b>${N}개</b> 필요 (텐서 병렬)</span>`;

  el("vramNums").innerHTML =
    `가중치 <b>${fmt(r.weightsGB)}GB</b> + KV <b>${fmt(r.kvSingleGB)}GB</b> (@${context.toLocaleString()} tok) ` +
    `+ 오버헤드 <b>${fmt(r.overheadGB)}GB</b> = <b>${fmt(r.vramSingle)}GB</b>` +
    (N > 1 ? ` → <b>${N}×</b> ${gpu.vram_gb}GB (총 ${fmt(r.totalVram)}GB)` : ` / ${gpu.vram_gb}GB`) +
    (r.maxCtxTokens > 0
      ? `<div class="dim" style="margin-top:4px">이 구성 배치=1 최대 컨텍스트 <b>${r.maxCtxTokens.toLocaleString()} tok</b>` +
        `${r.maxCtxTokens >= model.context ? " (모델 최대치까지 여유)" : " (더 길면 VRAM 초과)"}</div>`
      : `<div class="dim warn" style="margin-top:4px">가중치가 이미 VRAM을 초과 — 컨텍스트 0</div>`);

  const nNote = N > 1 ? ` · ${N} GPU 합산 대역폭` : "";
  el("tokS").innerHTML = `<b>${fmt(r.singleTokS)}</b> tok/s <span class="dim">단일 스트림${nNote}</span>`;
  el("throughput").innerHTML = `<b>${fmt(r.servingTokS)}</b> tok/s <span class="dim">서빙 총량 (배치 ${r.effBatch}, VRAM 헤드룸 최대 ${r.maxBatch})</span>`;

  const cost = el("costBox");
  if (mode === "own") {
    renderOwnCost(cost, r, N);
  } else if (r.rent == null) {
    const ownedKind = gpu.kind === "apple" ? "소유 기기(Apple)" : gpu.kind === "npu" ? "온프렘 NPU" : "소유/온프렘 기기";
    cost.innerHTML = `<div class="dim">${ownedKind}입니다 — 시간당 렌트가 없으므로 API 손익분기 대신 전기요금과 비교하세요. 위 tok/s와 적합성만 참고하세요.${N > 1 ? ` 이 모델은 이 기기 ${N}대가 필요합니다.` : ""}</div>`;
  } else {
    const cheaper = r.verdict === "self";
    const fleet = N > 1 ? ` (${N}× $${fmt(r.rent, 2)} = $${fmt(r.fleetRentHr, 2)}/hr)` : ` ($${fmt(r.rent, 2)}/hr)`;
    cost.innerHTML =
      `<div class="cost-row"><span>자체호스팅 추정 단가${fleet}</span><b>$${fmt(r.selfHostPer1m, 2)} / 1M tok</b></div>` +
      `<div class="cost-row"><span>선택한 API 단가</span><b>$${fmt(apiPer1m, 2)} / 1M tok</b></div>` +
      `<div class="cost-row dim"><span>API를 이기려면 필요한 처리량</span><b>${fmt(r.requiredTokS)} tok/s</b> (현재 추정 ${fmt(r.servingTokS)})</div>` +
      `<div class="verdict ${cheaper ? "self" : "api"}">${cheaper
        ? `이 이용률에서는 <b>자체호스팅이 더 쌉니다</b>. 다만 GPU ${N > 1 ? `${N}대를 ` : ""}계속 바쁘게 돌려야 유효합니다.`
        : `이 이용률에서는 <b>API가 더 쌉니다</b>. 자체호스팅은 처리량을 ${fmt(r.requiredTokS)} tok/s 이상 꾸준히 채울 때만 유리합니다.`}</div>`;
  }

  const moeNote = model.moe ? ` · MoE: 메모리는 전체 ${fmt(model.total_params_b, 0)}B를 싣지만 디코딩은 활성 ${fmt(model.active_params_b, 1)}B만 → tok/s가 빠릅니다.` : "";
  const kvNote = model.note ? ` · <span class="warn">${model.note}</span>` : "";
  el("modelNote").innerHTML = `<a href="https://huggingface.co/${model.hf}" target="_blank" rel="noopener">${model.hf}</a>${moeNote}${kvNote}`;
  if (context > model.context) el("modelNote").innerHTML += ` <span class="warn">⚠️ 선택 컨텍스트가 모델 최대(${model.context.toLocaleString()})를 초과</span>`;

  renderVllm(r);
}

// ---- vLLM serving-readiness tab -------------------------------------------

const TIER_BADGE = { native: "ok", transformers: "multi", custom: "warn", unknown: "no", unsupported: "no" };

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
    vramNote = "임의 HF 모델 — 파라미터 수 미상이라 VRAM 자동산정/TP 계산은 생략합니다(TP=1 기본, 매니페스트에서 직접 조정).";
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

  el("vllmBadge").innerHTML = `<span class="badge ${TIER_BADGE[verdict.tier] || "no"}">${verdict.ok ? "✅" : "⚠️"} ${esc(verdict.label)}</span>`;

  const help = (support.tier_help && support.tier_help[verdict.tier]) || "";
  const caveats = (verdict.caveats || []).length
    ? `<ul class="caveats">${verdict.caveats.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : "";
  el("vllmVerdictBox").innerHTML =
    `<div><b>모델</b> <a href="https://huggingface.co/${esc(modelId)}" target="_blank" rel="noopener">${esc(modelId)}</a></div>` +
    (verdict.arch ? `<div class="dim"><b>아키텍처</b> <code>${esc(verdict.arch)}</code></div>` : "") +
    `<div class="dim"><b>기준 vLLM</b> v${esc(support.vllm_version)}${verdict.min_vllm && verdict.min_vllm !== support.vllm_version ? ` · 최소 v${esc(verdict.min_vllm)}` : ""}</div>` +
    (help ? `<div class="verdict ${verdict.ok ? "self" : "api"}">${esc(help)}</div>` : "") +
    caveats +
    (vramNote ? `<div class="dim warn" style="margin-top:6px">${esc(vramNote)}</div>` : "");

  const cli = "vllm serve " + spec.args.join(" ").replace(/ --/g, " \\\n  --");
  const quantWhatIf = (quant !== "fp16" && !vllmState.fetched)
    ? `<div class="dim warn" style="margin-top:6px">⚠️ <code>--quantization</code>은 해당 양자화 체크포인트가 실제 존재할 때만 유효합니다. 계산기의 양자화 선택은 VRAM "what-if"이며, vLLM은 디스크 위 실제 가중치 포맷과 맞아야 합니다.</div>`
    : "";
  el("vllmParams").innerHTML = `<pre class="code small"><code>${esc(cli)}</code></pre>${quantWhatIf}`;

  renderManifest();
}

function renderManifest() {
  if (!vllmState.manifests) return;
  el("manifestCode").textContent = vllmState.manifests[vllmState.active] || "";
}

function switchResultTab(which) {
  document.querySelectorAll("#resultTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.panel === which));
  el("panelCalc").hidden = which !== "calc";
  el("panelVllm").hidden = which !== "vllm";
}

function normalizeAndRoute() {
  const raw = el("hfRef").value;
  const status = el("hfRefStatus");
  const fetchBtn = el("hfFetchBtn");
  if (!raw.trim()) { status.textContent = ""; fetchBtn.hidden = true; return; }
  const ref = LLMCalc.normalizeHfRef(raw);
  if (!ref) { status.innerHTML = `<span class="warn">URL/ID를 해석하지 못했습니다. 예: <code>Qwen/Qwen3-8B</code></span>`; fetchBtn.hidden = true; return; }
  const curated = state.models.find(m => m.hf.toLowerCase() === ref.toLowerCase());
  if (curated) {
    status.innerHTML = `✅ 큐레이션 모델 <b>${esc(curated.name)}</b> — 오프라인 판정 사용(외부 요청 없음)`;
    fetchBtn.hidden = true;
    vllmState.fetched = null;
    if (el("model").value !== curated.id) el("model").value = curated.id;
    render();
    switchResultTab("vllm");
  } else {
    status.innerHTML = `<b>${esc(ref)}</b> — 큐레이션 목록에 없음. 아래 버튼으로 HF에 <code>config.json</code>을 요청하면 vLLM 판정을 냅니다. <span class="warn">(외부 네트워크 요청)</span>`;
    fetchBtn.hidden = false;
    fetchBtn.dataset.ref = ref;
  }
}

async function fetchHfConfig() {
  const ref = el("hfFetchBtn").dataset.ref;
  if (!ref) return;
  const status = el("hfRefStatus");
  status.innerHTML = `<span class="dim">config.json 불러오는 중…</span>`;
  try {
    const r = await fetch(`https://huggingface.co/${ref}/resolve/main/config.json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cfg = await r.json();
    vllmState.fetched = { id: ref, config: cfg };
    status.innerHTML = `✅ <b>${esc(ref)}</b> config 불러옴 — 오른쪽 <b>vLLM 서빙 준비도</b> 탭 참고.`;
    render();
    switchResultTab("vllm");
  } catch (e) {
    vllmState.fetched = null;
    status.innerHTML = `<span class="warn">불러오기 실패 (${esc(e.message)}). 게이트/비공개 모델·CORS·오프라인일 수 있습니다. 큐레이션 드롭다운을 사용하세요.</span>`;
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
    row(`${esc(x.name)}<span class="ref-tag">${esc(x.provider || "")}</span>`, x.note, x.price, x.unit)).join("");

  el("refSpeechSelf").innerHTML = (s.selfhost || []).map(x => {
    const name = x.hf
      ? `<a href="https://huggingface.co/${esc(x.hf)}" target="_blank" rel="noopener">${esc(x.name)}</a>`
      : esc(x.name);
    return row(`${name}<span class="ref-tag">${esc(x.kind)}</span>`,
      [x.params, x.license, x.note].filter(Boolean).join(" · "), x.vram, "");
  }).join("");

  el("refSpeechApi").innerHTML = (s.api || []).map(x =>
    row(`${esc(x.name)}<span class="ref-tag">${esc(x.kind)}</span>`,
      [x.provider, x.note].filter(Boolean).join(" · "), x.price, x.unit)).join("");
}

async function init() {
  try {
    await loadData();
  } catch (e) {
    el("app").innerHTML = `<div class="err">데이터를 불러오지 못했습니다. 로컬에서는 <code>python3 -m http.server</code>로 실행하세요 (file://는 fetch가 막힙니다). GitHub Pages에서는 정상 동작합니다.</div>`;
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

  // Result tabs (비용 · 적합성 / vLLM 서빙 준비도)
  document.querySelectorAll("#resultTabs .tab").forEach(t =>
    t.addEventListener("click", () => switchResultTab(t.dataset.panel)));

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
    try { await navigator.clipboard.writeText(text); el("mfStatus").textContent = "복사됨"; }
    catch (e) { el("mfStatus").textContent = "복사 실패 — 코드를 직접 선택하세요"; }
    setTimeout(() => { el("mfStatus").textContent = ""; }, 2000);
  });
  el("mfDownload").addEventListener("click", () => {
    const names = { compose: "docker-compose.yml", k8s: "vllm-deployment.yaml", helm: "values.yaml" };
    downloadText(names[vllmState.active] || "manifest.txt", (vllmState.manifests || {})[vllmState.active] || "");
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
