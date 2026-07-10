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

function render() {
  const model = state.models.find(m => m.id === el("model").value);
  const gpu = state.gpus.find(g => g.id === el("gpu").value);
  const quant = el("quant").value;
  const context = parseInt(el("context").value, 10);
  const concurrency = parseInt(el("concurrency").value, 10);
  const rentRaw = el("rent").value.trim();
  const rentOverride = rentRaw === "" ? null : parseFloat(rentRaw);
  const apiPer1m = parseFloat(el("api").value);

  el("contextLabel").textContent = context.toLocaleString() + " tok";
  el("concurrencyLabel").textContent = concurrency + " concurrent";

  const r = compute(model, gpu, quant, context, concurrency, rentOverride, apiPer1m);
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
    (N > 1 ? ` → <b>${N}×</b> ${gpu.vram_gb}GB (총 ${fmt(r.totalVram)}GB)` : ` / ${gpu.vram_gb}GB`);

  const nNote = N > 1 ? ` · ${N} GPU 합산 대역폭` : "";
  el("tokS").innerHTML = `<b>${fmt(r.singleTokS)}</b> tok/s <span class="dim">단일 스트림${nNote}</span>`;
  el("throughput").innerHTML = `<b>${fmt(r.servingTokS)}</b> tok/s <span class="dim">서빙 총량 (배치 ${r.effBatch}, VRAM 헤드룸 최대 ${r.maxBatch})</span>`;

  const cost = el("costBox");
  if (r.rent == null) {
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
  ["model", "gpu", "quant", "context", "concurrency", "rent", "api"].forEach(id =>
    el(id).addEventListener("input", render));
  render();
}

document.addEventListener("DOMContentLoaded", init);
