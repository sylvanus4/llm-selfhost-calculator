# llm-selfhost-calculator

**이 LLM, 내 GPU/맥에서 돌아갈까? API보다 쌀까?** — VRAM 적합성, 토큰 속도, 자체호스팅 vs API 손익분기를 브라우저에서 즉시 계산하는 무료 도구.
*Will this open LLM fit on my GPU/Mac, and is self-hosting cheaper than an API? A tiny, transparent, client-side calculator.*

> 🔒 **키 없음 · 서버 없음 · 데이터 전송 없음.** 100% 브라우저에서 동작합니다. 수치는 공개 정보 기반 **추정치**이며 특정 벤더와 무관합니다.

**▶ 바로 쓰기 (Live): https://sylvanus4.github.io/llm-selfhost-calculator/**

---

## 누구를 위한 도구인가 · Who it's for

자체호스팅과 API 사이에서 **build-vs-buy를 저울질하는 ML/플랫폼 엔지니어와 스타트업**. "이 모델이 우리 GPU에 올라가나", "몇 tok/s 나오나", "API를 계속 쓰는 것보다 GPU를 빌리는 게 싼 시점은 언제인가"를 근사로 빠르게 답합니다.

## 무엇을 계산하나

- **VRAM 적합성** — 가중치 + KV 캐시(컨텍스트 길이 반영) + 오버헤드를 장비 VRAM과 비교. 들어가는지/넘치는지 즉시 표시.
- **추론 속도** — 단일 스트림 디코딩 tok/s(메모리 대역폭 기반)와 배치 서빙 총 처리량.
- **자체호스팅 vs API 손익분기** — GPU 시간당 렌트비와 처리량으로 자체호스팅 $/1M 토큰을 구해 API 단가와 비교, "API를 이기려면 필요한 처리량"까지.

16개 인기 오픈 모델(Llama, Qwen, Mistral/Mixtral, GLM, Gemma, Phi, gpt-oss, DeepSeek, MoE 포함)과 12종 가속기(H200/H100/A100/L40S/4090/3090/L4 + Apple M-시리즈)를 내장. 값은 UI에서 덮어쓸 수 있습니다.

## 계산 방식 (투명하게) · How the math works

| 항목 | 근사식 |
|---|---|
| 가중치 VRAM | `total_params × bytes/param` (fp16=2, int8=1, int4=0.5) |
| KV 캐시 | `2 × layers × kv_dim × 2B × context` (GQA의 kv_dim 반영) |
| 오버헤드 | `1.2GB + 5% × 가중치` |
| 단일 tok/s | `MBU(0.5) × 메모리대역폭 ÷ (활성 파라미터 × bytes)` — MoE는 활성 파라미터만 |
| 서빙 처리량 | `단일 tok/s × 유효배치 × 0.7`, 유효배치는 남은 VRAM으로 상한 |
| 자체호스팅 단가 | `(렌트/시간 ÷ 3600) ÷ 처리량 × 1e6` $/1M tok |

디코딩이 **메모리 대역폭에 묶인다**는 잘 알려진 근사에 기반합니다. 실제 수치는 커널·프레임워크·페이징·양자화 방식에 따라 달라지므로, 의사결정 전 실측 벤치를 권장합니다.

## 로컬 실행

```bash
git clone https://github.com/sylvanus4/llm-selfhost-calculator
cd llm-selfhost-calculator
python3 -m http.server 8000    # file:// 는 fetch가 막히므로 반드시 서버로
# http://localhost:8000 열기
```

## 검증 (테스트)

추정 코어는 브라우저와 동일한 `assets/compute.js`를 그대로 Node에서 단위 테스트합니다.

```bash
node test/compute.test.cjs      # 가중치 수식·적합성·MoE 속도·손익분기 등 12개 속성 검증
```

CI(`.github/workflows/validate.yml`)가 매 푸시마다 이 테스트 + JSON/HTML 파싱을 검증합니다.

## 데이터 추가

`data/models.json`·`data/gpus.json`·`data/api-prices.json`에 항목을 추가하면 UI에 즉시 반영됩니다. 값은 공개 스펙 기반 근사이며, PR 환영합니다.

## 라이선스 · 면책

MIT. 특정 벤더·제품과 제휴/보증 관계가 없습니다. 모델·하드웨어 수치와 가격은 공개 정보 기반 **추정치**로 부정확할 수 있고 시장에 따라 변합니다. 실제 비용·성능 판단의 유일한 근거로 쓰지 마세요.
