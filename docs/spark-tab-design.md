---
goal: "llm-selfhost-calculator에 howtospark.com 스타일 노드(GPU)별 메모리 시각화 + quant 사다리 + REAP/spec-decode 추가"
generated: 2026-07-20
complexity: L
risk: Medium
status: proposed
execution_tier: confirm
outcome: unreviewed
decisions:
  - "스코프: 6개 기능 전부 — howtospark 화면을 1:1 충실 카피한 전용 신규 탭으로 추가 (사용자 2026-07-20)"
  - "캘리브레이션: 추가 캡처 교차검증 + howtospark JS 소스 상수 추출 우선 (사용자 2026-07-20)"
target_repo: llm-selfhost-calculator (submodule, own main)
sources:
  - https://howtospark.com/  (DGX Spark 서빙/메모리 계산기 — 재현 대상 UI)
  - https://x.com/BosonJoe/status/2078923846766256316  (36s 데모 영상 — 화면이 스펙)
  - https://arxiv.org/abs/2510.13999  (REAP: Router-weighted Expert Activation Pruning, Cerebras)
---

# LLM 계산기 업그레이드 — howtospark 노드별 메모리 시각화

## 0. 왜 이 문서가 존재하나 (싱크 사고 복구)

회사 PC에서 `llm-selfhost-calculator`에 **vLLM 서빙 준비도 탭**(`3e67307`, 7/18)은 커밋·싱크됐다. 그러나 사용자가 실제로 원한 것 — **howtospark.com 영상 화면을 계산기에 GPU별로 재현** — 은 계획 문서로도 코드로도 남지 않았다. 이 문서가 그 유실된 분석·계획을 재작성한 정본이다. 부모 repo `outputs/`에 저장 → `git push origin main` 시 다음 머신(집/회사)에서 자동 수신([[git-workflow-main-only]]).

---

## 1. 재현 대상 (영상 프레임 역설계 — 스크린샷이 곧 스펙)

BosonJoe 트윗(36초, DGX Spark 소유자 대상)은 howtospark.com 도구 데모다. 프레임 3장에서 확정한 화면 구조:

### 1.1 모델 헤더
`MiniMaxAI/MiniMax-M3 ↗` + 능력 칩: `427B params` · `~26B active` · `bfloat16` · `MoE 128×4` · `GQA 64:4` · `MTP ×1` · `1.0M ctx` · `multimodal` · `other`.

### 1.2 클러스터 컨트롤 (상단 바)
- **SPARKS 선택기**: `1× / 2× / 3× / 4×` — 클러스터에 묶는 노드(=DGX Spark) 개수를 **강제 선택**. 우리 계산기의 auto `gpusNeeded`와 다르다: 사용자가 수를 고정하고 fit 여부를 본다.
- **REAP DIAL** (슬라이더): `no pruning · 128 experts` → `prune 25% of experts · 128 → 96` → `prune 20% · 128 → 102`. MoE 전문가 프루닝 비율(0~50%).

### 1.3 Quant 사다리 (핵심 — 라디오 선택 행들)
각 행 = 가로 VRAM 막대(초록=usable 안, 빨강=초과) + 점선 usable 상한 + 우측 `~GB` + `~tok/s`. 아래 "N usable"(= 노드수 × 110). 관측값(3× = 330 usable, MiniMax-M3):

| Quant 행 | VRAM | tok/s | fit |
|---|---|---|---|
| native bfloat16 | ~939 GB | ~15.5 | 빨강 |
| lossless entropy … (엔트로피 코딩 무손실) | ~726 GB | ~20.7 | 빨강 |
| 8-bit | ~512 GB | ~31 | 빨강 |
| 4-bit | ~299 GB | ~62 | 초록 |
| 1-bit GGUF (dynamic) | ~208 GB | ~107.9 | 초록 |
| 2-bit experts + FP8 dense | ~202 GB | ~50.5 | 초록 |
| 2-bit experts + NVFP4 dense | ~195 GB | ~83.5 | 초록 ← 선택 |

핵심: **하위 3개는 mixed-precision** — MoE **expert planes는 저비트(2-bit/1-bit)**, **dense backbone(attention·router·embed)은 별도 정밀도(FP8/NVFP4)**. 이게 왜 노드 카드가 "Expert planes"와 "KV cache"를 분리해 보여주는지의 이유다.

### 1.4 하단 컨트롤
- **SPEC DECODE**: `off / n-gram / draft / EAGLE / MTP` — 추측 디코딩 → tok/s 배수.
- **CONTEXT 슬라이더**: `500K / 1.0M` + 우측 리드아웃 `~1.6M ctx fits usable`(남는 메모리로 담을 수 있는 최대 컨텍스트).

### 1.5 노드별 스택 카드 (**사용자가 가장 원하는 부분 — "gpu별로"**)
헤더: `ON THE SPARKS — 3× · 2-BIT EXPERTS + NVFP4 DENSE · 500K CTX`, 우측 `~1.6M ctx fits usable`.
그 아래 **노드 1개당 세로 스택 막대 1개**(`spark1 [HEAD]`, `spark2 [WORKER]`, `spark3 [WORKER]`). 각 카드(110 GB usable) 위→아래 세그먼트:
1. 빗금(hatched) + `45 GB free`
2. 회색 얇은 띠(activation/overhead)
3. 파랑 `KV cache 20.5* GB [FP16]`
4. 주황 얇은 띠
5. 초록 `Expert planes 34.5* GB [2-BIT]`
6. 하단: `65* / 110 GB` · `59% OF USABLE`

관측 3세트로 수식 검증됨:
- **3×, 2-bit+NVFP4, 500K**: 노드당 free 45 / KV 20.5 / Expert 34.5 → 65/110 (59%). 합계 195 GB = 65×3 ✓.
- **2×, 25% prune, 2-bit+NVFP4, 303K**: free 41 / KV 18.6 / Expert 38.8 → 69/110 (62%). tok/s 55.7.
- **2×, 20% prune, 4-bit, 197K**: free 4 / KV 12.1 / Expert 82.8 → 106/110 (96%). tok/s 41.4.

→ 확인된 모델 규칙: **weights·KV 모두 노드 수로 텐서-병렬 샤딩**. 노드 많을수록 (a) 노드당 부담↓ (b) 총 대역폭↑ → **tok/s↑**(3× 83.5 vs 2× 55.7). REAP 프루닝은 expert planes를 줄여 fit·tok/s 개선.

---

## 2. 현재 계산기 vs 목표 (갭 분석)

현재(`assets/compute.js` `compute()`)가 **이미 가진 것**:
- weightsGB / activeGB / kvPerTokenGB / overheadGB 분해.
- 멀티-GPU auto: `gpusNeeded = ceil(vramSingle / gpu.vram_gb)`, `aggBandwidth = bandwidth × gpusNeeded × tpEff(0.8)`.
- tok/s = MBU × aggBandwidth / **activeGB** (MoE-aware, active weights 기준) — howtospark와 동일 원리.
- `data/gpus.json`에 `dgx-spark`(128GB unified, 273 GB/s, $4000) 존재. `data/models.json`에 `moe`·`total_params_b`·`active_params_b`·`n_layers`·`kv_dim`·`context`.

**없는 것 (구현 대상 6개)**:
| # | 갭 | 현재 | 목표 |
|---|---|---|---|
| G1 | 노드 수 강제선택 | auto ceil만 | 1×~4× 수동 override + auto |
| G2 | quant 사다리 | 1개 quant만 계산 | 전 quant 행 동시 계산(막대+tok/s+fit) |
| G3 | 노드별 스택 카드 | 단일 aggregate 막대 | 노드당 {expert/weights, KV, overhead, free} 세그먼트 |
| G4 | expert vs dense 분리 | 단일 weightsGB | mixed-precision(2-bit experts + NVFP4/FP8 dense) |
| G5 | REAP 프루닝 | 없음 | 0~50% expert prune 다이얼 + 품질 주석 |
| G6 | spec-decode | 없음 | off/n-gram/draft/EAGLE/MTP tok/s 배수 |

---

## 3. 데이터 모델 변경 (`data/models.json`)

mixed-precision(G4)·REAP(G5)를 위해 **expert vs dense 파라미터 분리**가 필요. MoE 모델에 필드 추가(비-MoE는 dense=total):

```jsonc
{ "id":"minimax-m3", ...,
  "moe": true,
  "n_experts": 128,          // 총 전문가 수 (칩 "128×4"의 128)
  "n_active_experts": 4,     // top-k
  "shared_params_b": 11.5,   // dense backbone: attention+router+embed+shared-expert (비-라우팅)
  "expert_params_b": 415.5   // = total_params_b - shared_params_b (라우팅 전문가 총합)
}
```

도출 규칙(코드 소유, 손계산 금지 — [[sonnet-format-determinism]]):
- `expert_params_b = total - shared`. 값 미제공 시 근사: MoE면 `shared ≈ total × (active/total)`의 attention 몫 → 보수적으로 `shared = active_params_b × 0.4` 폴백(주석에 `[근사]` 표기, 정확값은 config.json에서 채움).
- 비-MoE: `shared = total`, `expert = 0`, `n_experts = 0` → REAP 다이얼 비활성.

**검증 게이트**(`test/`에서): 큐레이트 MoE 모델 전부 `shared + expert ≈ total`(±1%) 아니면 CI fail. 새 모델 추가 시 HF config.json 대조(`num_experts`, `num_experts_per_tok`, `intermediate_size`, `moe_intermediate_size`).

`data/gpus.json` 변경 없음(dgx-spark 이미 존재). `data/quant-modes.json` 신규(아래 4.1).

---

## 4. compute.js 변경 (순수 함수만 — DOM 없음, Node 테스트 가능)

기존 `compute()`는 유지(1번째 탭 호환). 신규 순수 함수 추가:

### 4.1 Quant 모드 테이블 (`data/quant-modes.json` 신규)
영상의 7행을 데이터로. 각 모드는 expert/dense 비트를 분리 정의:

```jsonc
{ "modes": [
  {"id":"bf16",      "label":"native bfloat16",           "expert_bpp":2.0, "dense_bpp":2.0, "quality":"exact"},
  {"id":"entropy",   "label":"lossless entropy coding",   "expert_bpp":1.55,"dense_bpp":1.55,"quality":"lossless", "note":"엔트로피 코딩 — 무손실, 디코드 오버헤드 있음"},
  {"id":"int8",      "label":"8-bit",                     "expert_bpp":1.0, "dense_bpp":1.0, "quality":"near-lossless"},
  {"id":"int4",      "label":"4-bit",                     "expert_bpp":0.5, "dense_bpp":0.5, "quality":"good"},
  {"id":"gguf1",     "label":"1-bit GGUF (dynamic)",      "expert_bpp":0.35,"dense_bpp":0.5, "quality":"experimental", "note":"동적 비트 — 층별 상이, 실측 권장"},
  {"id":"e2_fp8",    "label":"2-bit experts + FP8 dense", "expert_bpp":0.28,"dense_bpp":1.0, "quality":"balanced"},
  {"id":"e2_nvfp4",  "label":"2-bit experts + NVFP4 dense","expert_bpp":0.28,"dense_bpp":0.5,"quality":"balanced", "note":"Blackwell/NVFP4 권장"}
]}
```
> `*_bpp` = bytes-per-param(2-bit=0.25+메타≈0.28). **주의(정직)**: 위 bpp는 영상 GB 관측치에 맞춘 캘리브레이션 시작값이다. 구현 시 MiniMax-M3(427B/26B active) 3세트 관측(195/202/299 GB 등)으로 bpp를 역산·고정하고 `test/`로 회귀 고정. 임의 확정 금지 — 관측 앵커.

### 4.2 신규 함수 (시그니처)

```
reapAdjust(model, prunePct)
  → { expert_params_b': expert×(1-p), total': shared+expert', active': active×(1-p_active) }
  // 라우팅 전문가만 감소. active도 감소(더 적은 전문가 활성) → tok/s에 반영.
  // 품질 주석: p≤0.5 지원, p>0.3 "품질 저하 가능" 경고(Cerebras: 50%에서 ~97% 유지).

modelFootprint(model, quantMode, prunePct)
  → { expertGB, denseGB, weightsGB: expertGB+denseGB }
  // weightsGB = expert_params_b'×expert_bpp + shared_params_b×dense_bpp

clusterFit(model, gpu, nodeCount, quantMode, prunePct, context)
  → { usableGB: nodeCount×gpu.vram_gb×USABLE_FRAC,
      weightsGB, kvGB, overheadGB, freeGB, usedGB, pctUsed,
      fits, maxCtxFits,                       // 남는 메모리로 담을 최대 ctx (영상 "~1.6M fits usable")
      perNode: [ {weightsGB, kvGB, overheadGB, freeGB, usedGB, pct, role:"HEAD"|"WORKER"} × nodeCount ] }
  // KV·weights 모두 nodeCount로 균등 샤딩. USABLE_FRAC: DGX Spark은 128→110 관측(≈0.86) → gpu별 usable_gb 필드 or 계수.

quantLadder(model, gpu, nodeCount, prunePct, context, specMode)
  → modes.map(m => ({ mode:m, weightsGB, totalGB, tokS, fits }))   // 사다리 전체 행

specDecodeMultiplier(specMode, model)
  → off:1.0 · n-gram:~1.4 · draft:~1.8 · EAGLE:~2.5 · MTP:model.mtp?~2.0:1.0
  // 배수는 수용률 근사. tokS_display = baseTokS × mult. "이론상 상한" 주석 필수(실측 다름).

clusterTokS(model, gpu, nodeCount, quantMode, prunePct, specMode)
  → MBU × (gpu.bandwidth_gbs × nodeCount × tpEff(nodeCount)) / activeGB' × specMult
  // 기존 compute()의 tok/s 원리 재사용 + nodeCount 강제 + spec 배수.
```

**USABLE_FRAC 처리**: DGX Spark 128GB→110 usable(OS/드라이버 예약). `gpus.json`에 `usable_gb` 옵션 필드 추가(없으면 `vram_gb × 0.9` 기본). unified-memory(Spark/Apple)만 예약이 크므로 `kind`별 계수.

모든 배수·bpp·usable 계수는 **코드/데이터 소유**, 모델 자기보고·즉흥 금지([[sonnet-format-determinism]]). 근사값엔 `~`·`*`·`[근사]` 라벨(영상도 `*` 사용).

---

## 5. UI 변경

### 5.1 `index.html` — 신규 전용 탭 "Spark 배치 / 노드별 서빙" (howtospark 화면 1:1 충실 카피)

**사용자 결정(2026-07-20): 화면을 그대로 카피해 자족적(self-contained) 신규 탭으로 추가.** 기존 2탭(비용·적합성 / vLLM)은 건드리지 않고, howtospark 레이아웃을 그대로 옮긴 3번째 탭을 만든다. 이 탭 안에 영상의 모든 요소가 들어간다(부분 재사용 아님 — 완결 화면):

```
resultTabs: [비용·적합성] [vLLM 서빙 준비도] [Spark 배치 ← 신규, howtospark 카피]
panelSpark (howtospark 화면 순서 그대로):
  1. 모델 헤더: 이름 + HF ↗ + 능력 칩(params/active/dtype/MoE NxK/GQA/MTP/ctx/multimodal)
  2. 클러스터 바: SPARKS 세그먼트(1×~4×) + REAP DIAL 슬라이더(#reapDial, "prune X% · N→M")
  3. quant 사다리: #quantLadder (7행: 막대+GB+tok/s+fit, 라디오 선택)
  4. "N usable" 라벨(노드수×usable)
  5. SPEC DECODE 세그먼트(off/n-gram/draft/EAGLE/MTP) + CONTEXT 슬라이더 + "~N ctx fits usable"
  6. 헤더줄 "ON THE SPARKS — 3× · <quant> · <ctx>"
  7. #nodeCards: 노드당 세로 스택 카드(free/overhead/KV/split/expert + N/110 · % of usable)
```
- **탭 전용 컨트롤**: 이 탭은 자족적이라 SPARKS/REAP/spec/quant/context를 **탭 내부에** 둔다(기존 입력 패널의 model/gpu만 상위 공유). howtospark처럼 한 화면에서 다 조작.
- GPU는 기본 dgx-spark, 드롭다운으로 임의 GPU 선택 가능(범용화, R2). 노드 라벨 HEAD/WORKER 유지.
- semantic HTML·`data-*`([[ui-templates]]), 레이아웃·간격·색은 howtospark 근접하되 우리 디자인 토큰으로([[design-tokens]]).

### 5.2 `assets/app.js` — 신규 렌더 함수
- `renderNodes(r)`: `clusterFit` + `quantLadder` 호출 → 사다리 행 + 노드 카드 렌더 + ctxFits 리드아웃.
- `renderNodeCard(perNode, usableGB)`: **세로 스택 = flex column, 세그먼트 높이 = %**. 순서 free(빗금)/overhead(회색)/KV(파랑)/split(주황)/expert(초록). 라벨·GB·비트뱃지.
- `renderQuantLadder(rows, usableGB, selected)`: 각 행 가로 막대(초록≤usable, 초과분 빨강) + 점선 상한 + GB + tok/s. 라디오 선택 → quantMode 갱신 → 전체 재렌더.
- 이벤트: nodeCount·reapDial·specMode·quant 라디오 → `render()` 재호출(디바운스 불필요, 순수계산 즉시).

### 5.3 `assets/style.css` — 신규 클래스(토큰만, hex 금지 — [[design-tokens]])
- `.node-card`(세로 스택, `--radius-lg`, `--elevation-1`), `.seg-free`(빗금 `repeating-linear-gradient`), `.seg-kv`(`--blue`), `.seg-expert`(`--green`), `.seg-overhead`(`--text-dim`), `.seg-split`(`--orange`).
- `.ladder-row`(가로 막대), `.bar-fit`(`--green`)/`.bar-over`(`--red`), `.usable-line`(점선 `border-left`).
- 애니메이션: 세그먼트 높이 변화는 `transform: scaleY`/`height` 트랜지션 — **compositor-friendly만**([[coding-style.md]] web). `transition: all`·`ease` 금지, named easing.
- 8-state·반응형(320/768/1024/1440): 노드 4개 카드는 좁은 화면서 2열 wrap.

---

## 6. 정확도·정직성 (날조 금지)

- **bpp·spec 배수·usable 계수는 관측 앵커 + 라벨**. MiniMax-M3 3세트로 캘리브레이션 후 `test/`로 고정. howtospark의 정확한 내부식은 비공개 → 우리 수치는 "planning approximation"으로 명시(기존 `_note` 톤 유지).
- **KV 샤딩 주의**: MLA·슬라이딩윈도우·하이브리드 Mamba 모델은 KV가 표시보다 작음(models.json `_note`에 이미 명시). 노드 카드 KV도 "보수적 상한" 계승.
- **REAP 품질**: p>0.3에서 경고, ≤0.5만 허용. 출처 명시(Cerebras arXiv 2510.13999). "프루닝하면 무조건 동일 품질" 단정 금지.
- **spec-decode**: 배수는 이론 상한, 실측은 모델·워크로드 의존 — 툴팁 명시.
- `~`/`*`/`[근사]` 라벨 없는 확정수치 금지.

---

## 7. 단계별 실행 (파일별 태스크)

**Phase 0 — 캘리브레이션 소스 확보 (howtospark 상수 추출 우선, 사용자 결정)**
0a. **howtospark.com 클라이언트 JS 소스 조사** — 정적 계산기라 bpp·usable·spec 배수·REAP 공식이 JS에 상수로 있을 가능성 큼. `ctx_fetch_and_index`(또는 claude-in-chrome로 소스뷰)로 페이지+번들 JS 확보 → 실제 상수를 우리 `quant-modes.json`/`compute.js`에 **이식**(픽셀 역산보다 정확). 저작권: 수치/공식은 사실이라 참고 가능하되, 코드 통째 복붙 금지 — 상수·수식만 재구현.
0b. **교차검증 캡처(사용자 결정)** — howtospark에서 **DeepSeek-V4-Pro(1.6T/49B)·Kimi K2.7(1058B/32B)** 각 1~2세트(노드수×quant 조합) 캡처 → MiniMax-M3 3세트와 함께 골든셋 확장. claude-in-chrome로 모델 선택·SPARKS 변경 후 노드 카드 수치 판독.
0c. Phase 0 산출 = `test/golden/howtospark-*.json`(모델×노드×quant → 기대 per-node GB·tok/s). 이게 전 구현의 검증 앵커.

**Phase 1 — 데이터·순수코어 (테스트 우선, [[loop-engineering-pattern]])**
1. `data/quant-modes.json` 작성(4.1, 상수는 0a 우선) + `data/models.json`에 MoE expert/dense 필드(3) — 큐레이트 MoE 전부.
2. `assets/compute.js`: `reapAdjust`/`modelFootprint`/`clusterFit`/`quantLadder`/`clusterTokS`/`specDecodeMultiplier` 추가(4.2). export 확장.
3. `test/spark.test.cjs`(신규): Phase 0 골든셋 전체(MiniMax 3 + DeepSeek/Kimi 세트) ±5% 통과 게이트. bpp 고정. `shared+expert≈total` 불변식.
   → **게이트**: `node test/spark.test.cjs` exit 0 아니면 Phase 2 진입 금지([[close-the-agent-loop]]/[[evaluator-must-act]]).

**Phase 2 — UI (howtospark 화면 1:1 카피, 신규 탭)**
4. `index.html`: `panelSpark` + 3번째 탭(5.1) — 헤더칩·SPARKS·REAP·사다리·spec·context·노드카드 전부 한 화면.
5. `assets/app.js`: `renderSpark`(오케스트레이터)·`renderNodeCard`·`renderQuantLadder`·`renderModelChips` + 탭 내부 컨트롤 이벤트(5.2).
6. `assets/style.css`: 노드 카드·사다리·세그먼트·칩·다이얼 클래스(5.3). howtospark 근접 레이아웃 + 우리 토큰.

**Phase 3 — 검증·마감**
7. 시각 회귀: 320/768/1024/1440 스크린샷, howtospark 프레임과 대조(레이아웃 근접). 라이트/다크 둘 다([[web/testing.md]]).
8. `.github/workflows/validate.yml`에 `test/nodes.test.cjs` 추가(기존 formula+cost audit 옆).
9. `README.md`에 "노드별 배치" 탭 절 추가(vLLM 탭 절과 동형).
10. 커밋(submodule main): `feat: add per-node memory layout + quant ladder + REAP/spec-decode (howtospark-style)`. 부모 repo 서브모듈 범프 + `git push origin main`(→ 회사/집 머신 싱크).

---

## 8. 검증 게이트 (완료 정의)

- [ ] `node test/nodes.test.cjs` 통과(영상 3세트 골든 ±5%, `shared+expert≈total`).
- [ ] 기존 `test/vllm.test.cjs`·formula audit 회귀 없음.
- [ ] 노드 카드가 nodeCount 1~4에서 정확히 N개 렌더, 세그먼트 합=usable.
- [ ] quant 사다리 7행, fit 색·tok/s 갱신, 라디오 선택 연동.
- [ ] REAP 0~50% 슬라이더가 expert planes·tok/s·fit 갱신 + 품질 경고.
- [ ] 320px에서 가로 오버플로 0([[web/performance.md]]).
- [ ] 모든 확정수치에 근사 라벨, 출처(REAP) 명시.

---

## 9. 리스크·반대론 ([[critical-thinking]])

- **R1 과대적합**: bpp를 MiniMax-M3 한 모델에 맞추면 다른 MoE(DeepSeek-V4 1.6T, Kimi K2.7)서 어긋남 → 완화: 2개 이상 모델 관측으로 캘리브레이션, 못 구하면 `[근사]` 명시하고 절대수치 대신 **상대비교**로 프레이밍.
- **R2 howtospark 특화 vs 범용**: 사용자는 "gpu별로" 범용을 원함(Spark 전용 아님) → 노드 카드는 gpus.json 임의 GPU에 동작하게 일반화(HEAD/WORKER 라벨은 유지, unified-memory만 usable 계수 큼).
- **R3 스코프**: G1~G6 전부 한 번에 = L 규모. **반대안**: Phase 1(코어+사다리)만 먼저 배포해 가치 확인 후 노드 카드/REAP 추가. 사용자 판단 필요.
- **R4 정확도 논란**: 공개 계산기라 틀린 수치 = 신뢰 손상 → 기존 repo의 "독립 formula+cost audit CI"에 노드 테스트를 반드시 편입.

---

## 10. 다음 액션 (승인 후)

1. Phase 1부터 시작(데이터+compute+테스트, TDD). 골든셋이 게이트.
2. 이 계획 자체를 submodule `docs/`에도 복사할지, 부모 outputs만 둘지 확인.
3. bpp 캘리브레이션용 추가 관측이 필요하면 howtospark.com에서 DeepSeek-V4/Kimi 1~2세트 더 캡처.
