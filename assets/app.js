/* llm-selfhost-calculator — client-side UI glue. No backend, no keys, no data leaves the browser.
   Pure estimation core lives in compute.js (LLMCalc.compute), shared with the Node unit tests. */

const compute = LLMCalc.compute;
const state = { models: [], gpus: [], apiPresets: [], speech: null };

async function loadData() {
  const [m, g, a, s] = await Promise.all([
    fetch("data/models.json").then(r => r.json()),
    fetch("data/gpus.json").then(r => r.json()),
    fetch("data/api-prices.json").then(r => r.json()),
    fetch("data/speech.json").then(r => r.json()),
  ]);
  state.models = m.models;
  state.gpus = g.gpus;
  state.apiPresets = a.presets;
  state.speech = s;
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
  ["model", "gpu", "quant", "context", "concurrency", "rent", "api", "kwh", "monthlyTokens", "capex"].forEach(id =>
    el(id).addEventListener("input", render));
  document.querySelectorAll('input[name="costmode"]').forEach(radio => radio.addEventListener("change", render));
  render();
}

document.addEventListener("DOMContentLoaded", init);
