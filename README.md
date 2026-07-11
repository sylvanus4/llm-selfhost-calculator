# llm-selfhost-calculator

**이 LLM, 내 GPU/맥에서 돌아갈까? API보다 쌀까?** — VRAM 적합성, 토큰 속도, 자체호스팅 vs API 손익분기를 브라우저에서 즉시 계산하는 무료 도구.
*Will this open LLM fit on my GPU/Mac, and is self-hosting cheaper than an API? A tiny, transparent, client-side calculator.*

> 🔒 **키 없음 · 서버 없음 · 데이터 전송 없음.** 100% 브라우저에서 동작합니다. 수치는 공개 정보 기반 **추정치**이며 특정 벤더와 무관합니다.

**▶ 바로 쓰기 (Live): https://sylvanus4.github.io/llm-selfhost-calculator/**

---

## 누구를 위한 도구인가 · Who it's for

자체호스팅과 API 사이에서 **build-vs-buy를 저울질하는 ML/플랫폼 엔지니어와 스타트업**. "이 모델이 우리 GPU에 올라가나", "몇 tok/s 나오나", "API를 계속 쓰는 것보다 GPU를 빌리는 게 싼 시점은 언제인가"를 근사로 빠르게 답합니다.

## 무엇을 계산하나

- **VRAM 적합성 + 필요 GPU 수** — 가중치 + KV 캐시(컨텍스트 반영) + 오버헤드를 장비 VRAM과 비교. 한 장에 들어가면 ✅, 넘치면 **몇 장이 필요한지(텐서 병렬)** 를 계산. Kimi K2.7(1T)·DeepSeek-V4(1.6T) 같은 초거대 MoE도 다룹니다.
- **추론 속도** — 단일 스트림 디코딩 tok/s(메모리 대역폭 기반, 멀티 GPU면 합산 대역폭)와 배치 서빙 총 처리량.
- **자체호스팅 vs API 손익분기 (임대 모드)** — GPU 렌트비(필요 대수 반영)와 처리량으로 자체호스팅 $/1M 토큰을 구해 API 단가와 비교, "API를 이기려면 필요한 처리량"까지.
- **구매 회수 개월수 (구매/온프렘 모드)** — 장비를 **사는** 경우를 위한 손익분기. 구매가(capex) + 전력 단가 + 월 예상 토큰량을 넣으면 `회수개월 = capex ÷ (월 API비용 − 월 전기료)`로 **몇 달이면 본전을 뽑는지**와 누적비용 교차 곡선을 보여줍니다. 전기료는 토큰 생성에 실제 쓴 GPU-시간만 계산(active-energy, idle 제외)하며, 월 토큰량이 처리량 상한을 넘으면 경고합니다. 각 장비의 구매가·전력은 공개 근사이고 UI에서 덮어쓸 수 있습니다.

**최신 인기 모델 18종을 최신순으로 내장** — GLM-5.2, Kimi K2.7, **NVIDIA Nemotron 3(Ultra·Super·Nano)**, DeepSeek-V4(Pro/Flash), Qwen3.6(27B·35B-A3B), MiniMax-M2.7, Gemma 4(31B·26B-A4B·12B·E4B), **Mistral Devstral Small 2 24B**, **IBM Granite 4.0 H Small**, **OpenAI gpt-oss-120b**, Qwen3-8B. 스펙(layers/hidden/kv_dim/context)은 각 모델 HF `config.json`에서 확인했습니다. 가속기 25종 내장 — NVIDIA Blackwell(GB300·GB200·B300·B200·RTX PRO 6000·DGX Spark), Hopper/Ampere(H200·H100·A100·L40S·A6000·4090·3090·L4), **AMD Instinct(MI355X·MI325X·MI300X)**, Apple M-시리즈, 그리고 **추론 NPU(FuriosaAI RNGD·Rebellions Rebel100·Intel Gaudi 3·AWS Trainium2, 최신 HBM 탑재)**. 소유/온프렘 기기(Apple·DGX Spark·NPU)는 렌트가 없으므로 **구매 모드**로 전환하면 구매가·전력으로 회수 개월수를 계산합니다(구매가 미공개 장비는 override 입력). 값은 UI에서 덮어쓸 수 있습니다.

**양자화 6종 + 기법 가이드** — FP16/BF16 · FP8 · INT8 · **NVFP4**(Blackwell FP4, 4.5bit) · **MXFP4**(OCP microscaling, gpt-oss 기본) · INT4를 선택해 VRAM·tok/s를 즉시 비교. 4-bit 포맷의 **블록 스케일 오버헤드**(NVFP4는 FP8 per-16 스케일 → 정확히 0.5가 아닌 0.5625 byte)까지 반영합니다. 하단 "양자화 기법 가이드"에서 GPTQ·AWQ·SmoothQuant·GGUF k-quants·QuaRot 등 PTQ 방법과 하드웨어 요구(FP4 텐서코어 등)를 설명합니다.

**비교 API 단가도 최신 실제 가격으로 갱신** — Claude(Opus 4.8·Sonnet 5·Haiku 4.5·Fable 5), GPT-5.5·5.6, Grok 4.5·4.3의 입력/출력 단가와 blended $/1M을 내장(공개 리스트가, 2026-07 기준). blended = `(3×입력 + 출력) / 4`(입력 3:1 가중, RAG/에이전틱 사용 기준). 하단에 **이미지 생성(gpt-image-2 등)·음성 STT/TTS 참고 패널**을 추가 — 자체호스팅 음성 모델(Whisper·Qwen3-ASR·Parakeet·Canary / VoxCPM2·Qwen3-TTS·Kokoro·Chatterbox·Orpheus·F5-TTS)과 음성 API 가격(OpenAI·ElevenLabs·Deepgram·AssemblyAI·xAI 등)을 정리했습니다. 이들은 토큰 단위가 아니라 토큰 계산기와 1:1 비교되지 않으므로 별도 참고용입니다.

> MLA(Kimi·DeepSeek)는 압축 KV 캐시를, GLM-5.2는 희소 어텐션(DSA)을, Nemotron 3·Granite 4·gpt-oss는 하이브리드 Mamba/슬라이딩윈도우를 씁니다. 하이브리드 Mamba 모델은 어텐션 층에만 KV가 붙으므로 `n_layers`를 어텐션 층 수로 잡아 반영했고, 나머지는 보수적 상한 근사입니다.

## 계산 방식 (투명하게) · How the math works

| 항목 | 근사식 |
|---|---|
| 가중치 VRAM | `total_params × bytes/param` (fp16/bf16=2, fp8/int8=1, **nvfp4≈0.5625**, mxfp4≈0.53125, int4=0.5) |
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
node test/compute.test.cjs      # 가중치 수식·적합성·MoE 속도·임대 손익분기·구매 회수 등 속성 검증
```

CI(`.github/workflows/validate.yml`)가 매 푸시마다 이 테스트 + JSON/HTML 파싱을 검증합니다.

## 데이터 추가

`data/models.json`·`data/gpus.json`·`data/api-prices.json`에 항목을 추가하면 UI에 즉시 반영됩니다. 값은 공개 스펙 기반 근사이며, PR 환영합니다.

## Security & Privacy / 보안과 개인정보

**100% 클라이언트 사이드 정적 사이트** — 백엔드·빌드·의존성·API 키·트래킹이 없습니다. 모든 계산은 브라우저에서 실행되며 **입력값은 어디로도 전송되지 않습니다.** 정적 JSON(모델·GPU·가격 표)만 읽습니다.
*100% client-side: no backend, no build, no dependencies, no API keys, no tracking. Every calculation runs in your browser and nothing you enter is ever sent anywhere.*

위협 표면·데이터 처리·취약점 신고 방법은 [`SECURITY.md`](./SECURITY.md)를 참고하세요. 모든 수치는 계획용 추정치이니 실제 결정 전 공급사 가격으로 검증하세요.

## 라이선스 · 면책

MIT. 특정 벤더·제품과 제휴/보증 관계가 없습니다. 모델·하드웨어 수치와 가격은 공개 정보 기반 **추정치**로 부정확할 수 있고 시장에 따라 변합니다. 실제 비용·성능 판단의 유일한 근거로 쓰지 마세요.
