/* llm-selfhost-calculator — client-side UI glue. No backend, no keys, no data leaves the browser.
   Pure estimation core lives in compute.js (LLMCalc.compute), shared with the Node unit tests. */

const compute = LLMCalc.compute;
const state = { models: [], gpus: [], apiPresets: [] };

async function loadData() {
  const [m, g, a] = await Promise.all([
    fetch("data/models.json").then(r => r.json()),
    fetch("data/gpus.json").then(r => r.json()),
    fetch("data/api-prices.json").then(r => r.json()),
  ]);
  state.models = m.models;
  state.gpus = g.gpus;
  state.apiPresets = a.presets;
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

  // VRAM breakdown bar
  const total = Math.max(r.vramSingle, gpu.vram_gb);
  const seg = (v, cls) => `<span class="seg ${cls}" style="width:${(v / total) * 100}%"></span>`;
  el("vramBar").innerHTML =
    seg(r.weightsGB, "w") + seg(r.kvSingleGB, "k") + seg(r.overheadGB, "o") +
    `<span class="cap" style="left:${(gpu.vram_gb / total) * 100}%"></span>`;

  el("fitBadge").innerHTML = r.fits
    ? `<span class="badge ok">✅ 들어갑니다 · Fits</span>`
    : `<span class="badge no">⛔ VRAM 초과 · Does not fit</span>`;

  el("vramNums").innerHTML = `
    가중치 <b>${fmt(r.weightsGB)}GB</b> + KV캐시 <b>${fmt(r.kvSingleGB)}GB</b> (@${context.toLocaleString()} tok)
    + 오버헤드 <b>${fmt(r.overheadGB)}GB</b> = <b>${fmt(r.vramSingle)}GB</b> / ${gpu.vram_gb}GB`;

  el("tokS").innerHTML = `<b>${fmt(r.singleTokS)}</b> tok/s <span class="dim">단일 스트림 (batch 1)</span>`;
  el("throughput").innerHTML = `<b>${fmt(r.servingTokS)}</b> tok/s <span class="dim">서빙 총량 (배치 ${r.effBatch}, VRAM 헤드룸 기준 최대 ${r.maxBatch})</span>`;

  const cost = el("costBox");
  if (r.rent == null) {
    cost.innerHTML = `<div class="dim">이 장비는 소유 기기(Apple)입니다 — 시간당 렌트 비용이 없으므로 API 손익분기 대신 전기요금과 비교하세요. 위 tok/s와 VRAM 적합성만 참고하세요.</div>`;
  } else {
    const cheaper = r.verdict === "self";
    cost.innerHTML = `
      <div class="cost-row"><span>자체호스팅 추정 단가</span><b>$${fmt(r.selfHostPer1m, 2)} / 1M tok</b></div>
      <div class="cost-row"><span>선택한 API 단가</span><b>$${fmt(apiPer1m, 2)} / 1M tok</b></div>
      <div class="cost-row dim"><span>API를 이기려면 필요한 처리량</span><b>${fmt(r.requiredTokS)} tok/s</b> (현재 추정 ${fmt(r.servingTokS)})</div>
      <div class="verdict ${cheaper ? "self" : "api"}">${cheaper
        ? `이 이용률에서는 <b>자체호스팅이 더 쌉니다</b> (GPU $${fmt(r.rent, 2)}/hr 기준). 다만 GPU를 계속 바쁘게 돌려야 유효합니다.`
        : `이 이용률에서는 <b>API가 더 쌉니다</b>. 자체호스팅은 GPU를 ${fmt(r.requiredTokS)} tok/s 이상 꾸준히 채울 때만 유리합니다.`}</div>`;
  }

  const moeNote = model.moe ? ` · MoE: 메모리는 전체 ${fmt(model.total_params_b, 0)}B를 싣지만 디코딩은 활성 ${fmt(model.active_params_b, 1)}B만 → tok/s가 빠릅니다.` : "";
  el("modelNote").innerHTML = `<a href="https://huggingface.co/${model.hf}" target="_blank" rel="noopener">${model.hf}</a> · ctx 최대 ${model.context.toLocaleString()}${moeNote}`;
  if (context > model.context) el("modelNote").innerHTML += ` <span class="warn">⚠️ 선택 컨텍스트가 모델 최대(${model.context.toLocaleString()})를 초과</span>`;
}

function el(id) { return document.getElementById(id); }

function opt(v, t) { const o = document.createElement("option"); o.value = v; o.textContent = t; return o; }

async function init() {
  try {
    await loadData();
  } catch (e) {
    el("app").innerHTML = `<div class="err">데이터를 불러오지 못했습니다. 로컬에서는 <code>python3 -m http.server</code>로 실행하세요 (file://는 fetch가 막힙니다). GitHub Pages에서는 정상 동작합니다.</div>`;
    return;
  }
  state.models.forEach(m => el("model").appendChild(opt(m.id, m.name)));
  state.gpus.forEach(g => el("gpu").appendChild(opt(g.id, g.name)));
  state.apiPresets.forEach((p, i) => el("apiPreset").appendChild(opt(i, `${p.label} — $${p.usd_per_1m}/1M`)));

  el("model").value = "llama-3.3-70b";
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
