/* Gate for the image/video (diffusion) path. Run: node test/media.test.cjs
   The point of this file is that the media numbers are FALSIFIABLE:
   (1) the dataset is structurally sound and every model is reachable from the UI,
   (2) the compute model REPRODUCES our own benchmark runs when fed the benchmark's own settings,
   (3) predicted VRAM lands within a stated tolerance of the VRAM we actually measured,
   (4) the honesty rails hold — licence-blocked models compute nothing, unmeasured models are
       never labelled "measured", and quantisation never silently becomes a speedup. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const C = require(path.join(root, "assets/compute.js"));

const media = JSON.parse(fs.readFileSync(path.join(root, "data/media-models.json"))).models;
const gpus = JSON.parse(fs.readFileSync(path.join(root, "data/gpus.json"))).gpus;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
const g = id => gpus.find(x => x.id === id);
const REF = g("b200");

let pass = 0, fail = 0;
const ok = (name, cond, extra) => cond
  ? (pass++, console.log("  PASS " + name))
  : (fail++, console.log("  FAIL " + name + (extra ? " — " + extra : "")));

console.log("media (image/video) gate:");

// ---- 1. dataset shape ------------------------------------------------------
ok("dataset is non-empty", media.length > 0);
ok("ids are unique", new Set(media.map(m => m.id)).size === media.length);
ok("every model is image or video", media.every(m => m.kind === "image" || m.kind === "video"));
ok("both modalities are populated",
  media.some(m => m.kind === "image") && media.some(m => m.kind === "video"));
ok("every model has an hf id and a licence", media.every(m => m.hf && m.license));

const live = media;
ok("every model has a backbone size", live.every(m => m.backbone_params_b > 0));
ok("every runnable model has sane defaults",
  live.every(m => m.default_steps > 0 && m.width > 0 && m.height > 0));
ok("video models declare frames and fps",
  live.filter(m => m.kind === "video").every(m => m.frames > 0 && m.fps > 0));
ok("MoE entries declare an active size",
  live.filter(m => m.moe).every(m => m.backbone_active_params_b > 0 && m.backbone_active_params_b < m.backbone_params_b));
ok("measured_from targets exist and are themselves measured",
  media.filter(m => m.measured_from).every(m => {
    const s = media.find(x => x.id === m.measured_from);
    return s && s.measured;
  }));
ok("a model never has both its own measurement and a borrowed one",
  media.every(m => !(m.measured && m.measured_from)));

// ---- 2. reproduces our own benchmark --------------------------------------
// Feed each anchor its own recorded settings; the model must return the recorded seconds.
for (const m of media.filter(x => x.measured)) {
  const b = m.measured;
  const r = C.computeMedia(m, REF, "fp16", {
    steps: b.steps, width: b.width, height: b.height, frames: b.frames,
    batch: b.batch || 1, cfg: (b.cfg_passes || 1) > 1, refGpu: REF, siblings: media,
  });
  const drift = Math.abs(r.secondsPerItem - b.seconds) / b.seconds;
  ok(`${m.id}: reproduces its ${b.seconds}s benchmark`, drift < 1e-9,
    `got ${r.secondsPerItem}`);
}

// ---- 3. predicted VRAM vs measured VRAM ------------------------------------
// The tolerance is deliberately tight: weights are arithmetic, only the activation term is modelled.
for (const m of media.filter(x => x.measured && x.measured.vram_gb)) {
  const b = m.measured;
  const r = C.computeMedia(m, REF, "fp16", {
    steps: b.steps, width: b.width, height: b.height, frames: b.frames,
    batch: b.batch || 1, cfg: (b.cfg_passes || 1) > 1, refGpu: REF, siblings: media,
  });
  const err = Math.abs(r.vramTotal - b.vram_gb) / b.vram_gb;
  ok(`${m.id}: VRAM within 8% of measured (${b.vram_gb}GB)`, err < 0.08,
    `predicted ${r.vramTotal.toFixed(1)}GB, off by ${(err * 100).toFixed(1)}%`);
}

// ---- 4. honesty rails ------------------------------------------------------
// Territory restrictions are DISCLOSED, not enforced by hiding the numbers: someone deciding
// whether to pursue a licence, or where a model could legally run, needs the sizing either way.
const restricted = media.filter(m => m.restriction);
ok("restricted models carry territories, a summary and a licence link",
  restricted.length > 0 && restricted.every(m =>
    Array.isArray(m.restriction.territories) && m.restriction.territories.length > 0 &&
    m.restriction.summary && m.license_url));
ok("the UI surfaces the restriction as a notice and still computes",
  /model\.restriction/.test(app) && /media\.restrict\.readlicense/.test(app) &&
  !/mediaBody"\)\.hidden = true/.test(app));
for (const m of restricted) {
  const r = C.computeMedia(m, g("h200"), "fp16", { refGpu: REF, siblings: media });
  ok(`${m.id}: restricted but still fully calculated`,
    r.vramTotal > 0 && r.secondsPerItem > 0 && r.gpusNeeded >= 1);
}

// Every model must expose its weights and its licence text.
ok("every model has an hf link and a licence url",
  media.every(m => m.hf && m.license_url));
ok("the UI renders both links", /mediaLinks/.test(app) && /huggingface\.co\/\$\{esc\(model\.hf\)\}/.test(app));

for (const m of live) {
  const r = C.computeMedia(m, g("h200"), "fp16", { refGpu: REF, siblings: media });
  const anchored = !!(m.measured || m.measured_from);
  const claimsMeasured = /^measured/.test(r.speedBasis);
  ok(`${m.id}: speed basis is honest (${r.speedBasis})`, anchored === claimsMeasured);
  ok(`${m.id}: VRAM is always produced`, r.vramTotal > 0 && r.gpusNeeded >= 1);
}

// Quantisation must move VRAM and leave latency alone — our measurement says fp8 alone is slower,
// so a quant-driven speedup would be a claim we cannot support.
{
  const m = media.find(x => x.id === "flux2-klein-4b");
  const hi = C.computeMedia(m, g("h200"), "fp16", { refGpu: REF, siblings: media });
  const lo = C.computeMedia(m, g("h200"), "fp8", { refGpu: REF, siblings: media });
  ok("quantisation reduces VRAM", lo.vramTotal < hi.vramTotal);
  ok("quantisation does NOT change latency", Math.abs(lo.secondsPerItem - hi.secondsPerItem) < 1e-9);
}

// A device with no vendor-published dense BF16 figure must yield no speed, not a fabricated one.
{
  const apple = gpus.find(x => x.tflops_bf16 == null);
  const m = media.find(x => x.id === "z-image-turbo");
  const r = C.computeMedia(m, apple, "fp16", { refGpu: REF, siblings: media });
  ok(`no speed invented for ${apple.id} (no published TFLOPS)`,
    r.secondsPerItem === null && r.speedBasis === "unknown");
  ok(`VRAM still computed for ${apple.id}`, r.vramTotal > 0);
}

// The UNet family is explicitly opted out of the DiT latency model.
{
  const m = media.find(x => x.speed_model === "none");
  ok("a UNet model is opted out of the DiT speed model", !!m);
  if (m) {
    const r = C.computeMedia(m, g("h200"), "fp16", { refGpu: REF, siblings: media });
    ok("UNet returns no latency but still returns VRAM",
      r.secondsPerItem === null && r.speedBasis === "unmodelled" && r.vramTotal > 0);
  }
}

// ---- 5. physics sanity -----------------------------------------------------
{
  const m = media.find(x => x.id === "qwen-image-2512");
  const at = o => C.computeMedia(m, g("h200"), "fp16",
    Object.assign({ steps: 20, cfg: false, width: 1024, height: 1024, refGpu: REF, siblings: media }, o));
  const base = at({});
  ok("doubling steps doubles latency", Math.abs(at({ steps: 40 }).secondsPerItem / base.secondsPerItem - 2) < 1e-9);
  ok("enabling CFG doubles the work", Math.abs(at({ cfg: true }).secondsPerItem / base.secondsPerItem - 2) < 1e-9);

  // Attention is O(N^2) in latent tokens, so cost must grow FASTER than the token count alone.
  const big = at({ width: 2048, height: 2048 });
  const tokenRatio = big.tokens / base.tokens;
  const costRatio = big.secondsPerItem / base.secondsPerItem;
  ok("higher resolution costs superlinearly (attention is quadratic)",
    costRatio > tokenRatio * 1.02, `cost x${costRatio.toFixed(2)} vs tokens x${tokenRatio.toFixed(2)}`);
}
{
  // Video latent tokens must scale with the temporal axis, not just area.
  const m = media.find(x => x.kind === "video" && !x.blocked);
  const few = C.computeMedia(m, g("h200"), "fp16", { frames: 9, refGpu: REF, siblings: media });
  const many = C.computeMedia(m, g("h200"), "fp16", { frames: 81, refGpu: REF, siblings: media });
  ok("more frames means more latent tokens", many.tokens > few.tokens);
}

// ---- 6. UI reachability ----------------------------------------------------
ok("index.html has the category selector", /id="catToggle"/.test(html) &&
  /value="image"/.test(html) && /value="video"/.test(html));
ok("index.html has the media panel and its inputs",
  /id="panelMedia"/.test(html) && /id="mediaInputs"/.test(html) &&
  /id="steps"/.test(html) && /id="resolution"/.test(html) && /id="frames"/.test(html));
ok("media latency is always rendered with a provenance badge",
  /SPEED_BADGE/.test(app) && /media\.basis\./.test(app));
ok("app loads the media dataset", /data\/media-models\.json/.test(app));

// Every element the code reaches for must exist, or the panel silently dies on a null deref.
{
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const missing = [...new Set([...app.matchAll(/\bel\("([^"]+)"\)/g)].map(m => m[1]))].filter(x => !ids.has(x));
  ok("every el() id exists in index.html", missing.length === 0, missing.join(", "));
}

// media.basis.<x> is assembled at runtime, so a basis value with no translation would render a
// raw key to the user. Check every value the compute core can actually emit.
{
  const i18n = fs.readFileSync(path.join(root, "assets/i18n.js"), "utf8");
  const ko = i18n.slice(i18n.indexOf("ko: {"), i18n.indexOf("en: {"));
  const en = i18n.slice(i18n.indexOf("en: {"), i18n.indexOf("const DATA = {"));
  const emitted = new Set(media.flatMap(m => ["h200", "b200", "rtx4090"].map(id =>
    C.computeMedia(m, g(id), "fp16", { refGpu: REF, siblings: media }).speedBasis)));
  emitted.add("unknown");
  const gaps = [...emitted].filter(b => !ko.includes(`"media.basis.${b}"`) || !en.includes(`"media.basis.${b}"`));
  ok(`every emitted speed basis has ko+en text (${[...emitted].join(", ")})`, gaps.length === 0, gaps.join(", "));
}


// ---- 7. speech (STT / TTS) -------------------------------------------------
const speech = JSON.parse(fs.readFileSync(path.join(root, "data/speech-models.json"))).models;
console.log("\nspeech gate:");
ok("speech dataset is non-empty", speech.length > 0);
ok("speech ids are unique", new Set(speech.map(m => m.id)).size === speech.length);
ok("every speech model is stt or tts", speech.every(m => m.kind === "stt" || m.kind === "tts"));
ok("both stt and tts are populated",
  speech.some(m => m.kind === "stt") && speech.some(m => m.kind === "tts"));
ok("every speech model has params, hf and a licence url",
  speech.every(m => m.params_b > 0 && m.hf && m.license_url));
ok("params_source is declared (registry-derived vs card-quoted)",
  speech.every(m => ["registry", "card"].includes(m.params_source)));
ok("speech measured_from targets are themselves measured",
  speech.filter(m => m.measured_from).every(m => {
    const sib = speech.find(x => x.id === m.measured_from);
    return sib && sib.measured;
  }));
ok("runtime-blocked speech models carry a reason",
  speech.filter(m => m.blocked).every(m => m.blocked.kind && m.blocked.reason));

// Reproduce each anchor at its own concurrency on the device it was measured on.
for (const m of speech.filter(x => x.measured)) {
  const b = m.measured;
  const r = C.computeSpeech(m, REF, "fp16", { concurrency: b.concurrency || 1, refGpu: REF, siblings: speech });
  ok(`${m.id}: reproduces its ${b.realtime_x}x realtime benchmark`,
    Math.abs(r.realtime - b.realtime_x) < 1e-9, `got ${r.realtime}`);
  if (b.realtime_x_batched) {
    const rb = C.computeSpeech(m, REF, "fp16", { concurrency: b.batched_concurrency, refGpu: REF, siblings: speech });
    ok(`${m.id}: reproduces its batched ${b.realtime_x_batched}x`,
      Math.abs(rb.realtime - b.realtime_x_batched) < 1e-9, `got ${rb.realtime}`);
  }
}
// Past the measured ceiling we must HOLD, not extrapolate.
{
  const m = speech.find(x => x.measured && x.measured.batched_concurrency);
  const at = c => C.computeSpeech(m, REF, "fp16", { concurrency: c, refGpu: REF, siblings: speech });
  const ceil = m.measured.batched_concurrency;
  ok("concurrency past the measured ceiling is held, not extrapolated",
    at(ceil * 8).realtime === at(ceil).realtime && at(ceil * 8).concurrencyCapped === true);
  ok("concurrency between measured points interpolates upward",
    at(ceil).realtime > at(Math.ceil((1 + ceil) / 2)).realtime && at(Math.ceil((1 + ceil) / 2)).realtime > at(1).realtime);
}
for (const m of speech) {
  const r = C.computeSpeech(m, g("h200"), "fp16", { concurrency: 1, refGpu: REF, siblings: speech });
  const anchored = !!(m.measured || m.measured_from);
  ok(`${m.id}: speech speed basis is honest (${r.speedBasis})`, anchored === /^measured/.test(r.speedBasis));
  ok(`${m.id}: VRAM is always produced`, r.vramTotal > 0);
}
// Where we measured resident memory, the model must report that rather than the arithmetic.
{
  const m = speech.find(x => x.measured && x.measured.vram_gb);
  const r = C.computeSpeech(m, REF, "fp16", { concurrency: 1, refGpu: REF, siblings: speech });
  ok(`${m.id}: uses measured resident VRAM`, r.vramTotal === m.measured.vram_gb);
}
// A model slower than realtime must surface as such — that is the whole point for TTS.
{
  const slow = speech.find(x => x.measured && x.measured.realtime_x < 1);
  ok("a below-realtime TTS exists and is reported below 1x", !!slow &&
    C.computeSpeech(slow, REF, "fp16", { concurrency: 1, refGpu: REF, siblings: speech }).realtime < 1);
}

// ---- 8. serving-support matrix --------------------------------------------
const serving = JSON.parse(fs.readFileSync(path.join(root, "data/serving-support.json")));
const ENGINES = ["pytorch", "vllm", "tensorrt"];
const TIERS = ["native", "partial", "custom", "transformers", "unsupported", "unknown", "incompatible"];
console.log("\nserving-matrix gate:");
const allModelIds = [...media.map(m => m.id), ...speech.map(m => m.id)];
ok("every image/video/speech model has a serving entry",
  allModelIds.every(id => serving.models[id]),
  allModelIds.filter(id => !serving.models[id]).join(", "));
ok("no serving entry for a model that does not exist",
  Object.keys(serving.models).every(id => allModelIds.includes(id)),
  Object.keys(serving.models).filter(id => !allModelIds.includes(id)).join(", "));
ok("every model is judged on all three engines",
  Object.values(serving.models).every(e => ENGINES.every(k => e[k] && e[k].tier)));
ok("every tier is from the known set",
  Object.values(serving.models).every(e => ENGINES.every(k => TIERS.includes(e[k].tier))));
// The core-vs-Omni and the three-TensorRT-repo distinctions are the whole point of `via`.
ok("every non-pytorch supported entry names which engine variant it came from",
  Object.values(serving.models).every(e => ["vllm", "tensorrt"].every(k =>
    ["unsupported", "unknown"].includes(e[k].tier) || e[k].via)));
ok("every `via` is declared in via_label",
  Object.values(serving.models).every(e => ENGINES.every(k => !e[k].via || serving.via_label[e[k].via])));
// A claim of support must carry evidence or a pointer, never a bare assertion.
ok("supported entries carry either caveats or a docs link",
  Object.values(serving.models).every(e => ENGINES.every(k =>
    !["native", "partial", "custom"].includes(e[k].tier) || (e[k].caveats && e[k].caveats.length) || e[k].docs || e[k].pipeline || e[k].lib)));
ok("vLLM diffusion support is attributed to vLLM-Omni, never to vLLM core",
  media.every(m => {
    const v = serving.models[m.id].vllm;
    return ["unsupported", "unknown"].includes(v.tier) || v.via === "vllm-omni";
  }));
ok("vLLM ASR support is attributed to vLLM core",
  speech.filter(m => m.kind === "stt").every(m => {
    const v = serving.models[m.id].vllm;
    return ["unsupported", "unknown"].includes(v.tier) || v.via === "vllm";
  }));
ok("the UI renders all three engine panels", /ENGINE_PANELS/.test(app) &&
  /panelMPytorch/.test(html) && /panelMVllm/.test(html) && /panelMTrt/.test(html));
ok("the UI has a placement panel with a replica ladder",
  /panelMPlace/.test(html) && /mplaceLadder/.test(html) && /LLMCalc\.placement/.test(app));
// The placement tab must draw the same per-GPU memory cards the LLM tab does — a bare list of
// numbers is what this replaced, and it was unreadable.
ok("placement draws per-GPU memory cards, not just text rows",
  /id="mplaceNodeCards"/.test(html) && /ncard-stack/.test(app) && /mediaNodeSegments/.test(app));
ok("placement cards carry a legend and a role per GPU",
  /id="mplaceLegend"/.test(html) && /mplace\.role\.(replica|shard|idle)/.test(app));
ok("placement cards are capped so a 32-GPU fleet does not render 32 identical cards",
  /const CAP = \d+/.test(app) && /mplace\.cards\.more/.test(app));
ok("the ladder shows throughput as bar length and hatches idle GPUs",
  /lr-idle/.test(app) && /tpPct/.test(app));
ok("no serving command is offered for an unsupported/unknown engine",
  /const dead = \["unsupported", "unknown"\]\.includes\(sup\.tier\)/.test(app));

// ---- 9. placement ----------------------------------------------------------
console.log("\nplacement gate:");
{
  const p1 = C.placement(8, 1, 100);
  ok("8 GPUs, 1 per instance -> 8 replicas at 8x throughput",
    p1.replicas === 8 && p1.throughput === 800 && p1.idleGpus === 0);
  const p2 = C.placement(7, 2, 100);
  ok("7 GPUs, 2 per instance -> 3 replicas and 1 idle",
    p2.replicas === 3 && p2.idleGpus === 1 && p2.throughput === 300);
  const p3 = C.placement(1, 2, 100);
  ok("a fleet too small for one instance is flagged, not silently zeroed",
    p3.shortOfOne === true && p3.replicas === 0 && p3.throughput === null);
  ok("throughput is null when per-instance throughput is unknown",
    C.placement(8, 1, null).throughput === null);
}

// ---- 10. visual hierarchy + status signal --------------------------------
// Both of these shipped broken once: the headline number rendered at body size because the 22px
// rule only covered the LLM panel, and the comparison bars painted nothing because a <span>
// defaults to display:inline and silently ignores width/height.
const css = fs.readFileSync(path.join(root, "assets/style.css"), "utf8");
console.log("\nhierarchy gate:");
{
  const hero = css.match(/\.hero-num\s*\{[^}]*\}/);
  ok("a hero-number style exists", !!hero);
  const px = hero && hero[0].match(/font-size:\s*(\d+)px/);
  ok("the hero number is far larger than body text (>=32px)", !!px && Number(px[1]) >= 32,
    px ? px[1] + "px" : "no font-size");
  ok("the hero number uses tabular figures so it does not jitter as values change",
    !!hero && /tabular-nums/.test(hero[0]));
  ok("both media and speech render the headline through the hero style",
    (app.match(/hero-num/g) || []).length >= 3);
  ok("the provenance badge sits with the hero, not buried in prose",
    /mediaBasisBadge/.test(app) && /id="mediaBasisBadge"/.test(html));
}
{
  const fill = css.match(/\.vs-fill\s*\{[^}]*\}/);
  ok("comparison-bar fill style exists", !!fill);
  // The bug: a span is inline by default, so width/height do nothing and the bar paints empty.
  ok("the bar fill is blockified (an inline span would ignore width/transform)",
    !!fill && /display:\s*(block|flex|inline-block)/.test(fill[0]));
  // [[ui-templates]]: animate transform/opacity only — width/height animation forces layout.
  ok("the bar animates transform, not width/height",
    !!fill && /transition:\s*transform/.test(fill[0]) && !/transition:[^;]*\b(width|height)\b/.test(fill[0]));
  ok("no `transition: all` and no ease/linear timing in the new styles",
    !/transition:\s*all\b/.test(css) &&
    !/transition:[^;]*\b(ease|linear)\s*[;}]/.test(css.slice(css.indexOf(".hero-num"))));
  ok("self-host vs API renders as bars in both media and speech",
    (app.match(/vsBars\(/g) || []).length >= 3);
}
{
  ok("serving tabs carry a status dot driven by the tier", /setTabDot/.test(app) && /TAB_DOT/.test(app));
  ok("the dot is not the only carrier — it has a title and an aria-label",
    /dot\.title = label/.test(app) && /setAttribute\("aria-label"/.test(app));
  ok("every tier maps to a dot colour",
    ["native", "partial", "custom", "transformers", "unsupported", "unknown", "incompatible"]
      .every(t => new RegExp(`${t}:\\s*"(ok|warn|no)"`).test(app)));
}
{
  // The comparison is the reason the panel exists; it must not be blank on arrival.
  const prices = JSON.parse(fs.readFileSync(path.join(root, "data/api-prices.json")));
  ok("at least one media preset and one speech preset carry a real price",
    (prices.media_presets || []).some(p => p.usd_per_item != null) &&
    (prices.speech_presets || []).some(p => p.usd_per_min != null));
  ok("the UI defaults to a priced preset rather than the Custom placeholder", /pickPriced/.test(app));
}

console.log(`\nmedia+speech+serving: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
