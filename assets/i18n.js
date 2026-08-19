/* i18n + theme for llm-selfhost-calculator. No framework, no I/O.
   UI = keyed ko/en strings (static + dynamic templates with {placeholders}).
   DATA = korean-source -> english map for data-file strings (model notes, caveats,
   tier_help, speech notes) so they translate at render time WITHOUT editing data files.
   Language + theme persist in localStorage; default from navigator.language / prefers-color-scheme. */
(function (root) {
  const UI = {
    ko: {
      // document
      "doc.title": "자체 호스팅 계산기 · LLM·이미지·영상·음성 모델의 VRAM·비용·서빙 준비도 (vLLM·TensorRT·PyTorch)",
      "doc.desc": "이 LLM, 내 GPU/맥에서 돌아갈까? API보다 쌀까? vLLM·SGLang·TensorRT-LLM에서 네이티브로 서빙되나? VRAM 적합성·토큰속도·손익분기 계산 + 노드별 배치 + 세 엔진 서빙 지원 판정(모델·양자화·하드웨어별) + 바로 쓰는 docker-compose·Kubernetes 매니페스트 생성을 브라우저에서 즉시. 키 없음, 데이터 전송 없음.",
      "h1": "LLM 자체 호스팅 계산기",
      "sub": "이 모델, 내 하드웨어에서 돌아갈까? API보다 쌀까? — <b>텍스트 LLM · 이미지 생성 · 영상 생성 · 음성 STT/TTS</b>의 VRAM 적합성 · 속도 · 손익분기를 즉시 계산합니다. <b>키 없음 · 서버 없음 · 데이터 전송 없음.</b>",
      "ctrl.lang": "언어",
      "ctrl.theme": "테마",
      "theme.dark": "다크",
      "theme.light": "라이트",
      // inputs
      "inputs.h2": "입력",
      "lbl.model": "모델",
      "hint.newest": "최신순",
      "lbl.hfref": "또는 HF 모델 URL/ID",
      "hint.paste": "붙여넣으면 파싱",
      "ph.hfref": "huggingface.co/Qwen/Qwen3-8B 또는 Qwen/Qwen3-8B",
      "btn.hffetch": "HF에서 config.json 불러오기 (외부 요청)",
      "lbl.quant": "양자화",
      "hint.quant": "4-bit는 아래 설명 참고",
      "lbl.hardware": "하드웨어",
      "lbl.context": "컨텍스트 길이",
      "lbl.concurrency": "동시 요청",
      "lbl.costmode": "원가 모드",
      "opt.rent": "임대 (클라우드 $/hr)",
      "opt.own": "구매 (온프렘 회수)",
      "lbl.rent": "GPU 렌트 단가 override ($/hr, 비우면 기본값)",
      "ph.rent": "예: 2.5",
      "lbl.kwh": "전기 단가 ($/kWh)",
      "hint.kwh": "KR 산업용 ≈ ₩150 ≈ $0.11",
      "lbl.mtok": "월 예상 토큰량",
      "lbl.capex": "구매가 override ($/장비, 비우면 데이터 기본값)",
      "ph.capex": "예: 28000",
      "lbl.apipreset": "비교 API 프리셋",
      "lbl.api": "비교 API 단가 ($/1M tok)",
      // tabs
      "tab.calc": "비용 · 적합성",
      "tab.spark": "노드별 배치",
      "tab.vllm": "vLLM 서빙 준비도",
      "tab.sglang": "SGLang 서빙 준비도",
      "tab.trt": "TensorRT-LLM 서빙 준비도",
      // calc panel
      "calc.h2": "결과",
      "legend.weights": "가중치",
      "legend.kv": "KV캐시",
      "legend.overhead": "오버헤드",
      "legend.vramcap": "장비 VRAM 한계",
      // --- speech (STT/TTS) + placement + serving tabs ---
      "cat.speech": "음성 STT·TTS",
      "lbl.maudio": "월 예상 오디오 처리량",
      "lbl.api.min": "비교 API 단가 ($/오디오 분)",
      "tab.mplace": "노드별 배치",
      "tab.mpytorch": "PyTorch 서빙",
      "tab.mvllm": "vLLM 서빙 준비도",
      "tab.mtrt": "TensorRT 서빙",
      "speech.chip.stt": "음성 인식 STT",
      "speech.chip.tts": "음성 합성 TTS",
      "speech.realtime": "실시간 대비",
      "speech.perminute": "오디오 1분을 {s}초에 처리",
      "speech.belowrealtime": "⚠️ 실시간 미달 — 스트리밍 용도로는 부적합",
      "speech.audiohours": "오디오-시간/시간",
      "speech.audiohour": "오디오-시간",
      "speech.batchnote": "동시성을 올리면 더 올라갑니다 — 디퓨전과 달리 음성은 배칭이 실제로 듣습니다.",
      "speech.capped": "동시성 {c}까지만 실측했습니다. 그 이상은 외삽하지 않고 마지막 실측값을 유지합니다.",
      "speech.nospeed": "이 모델은 자체 실측치가 없어 속도를 계산하지 않습니다. VRAM 적합성은 그대로 유효합니다.",
      "speech.noruntime": "⛔ 현재 이 모델을 돌릴 런타임이 없습니다",
      "speech.vram.line": "가중치 <b>{w}GB</b> + 런타임 오버헤드 <b>{o}GB</b> = <b>{tot}GB</b>",
      "speech.vram.measured": "이 수치는 계산값이 아니라 실제로 측정한 상주 메모리입니다.",
      "speech.maudiolab": "월 {n} 오디오-시간",
      "speech.cost.self": "자체 호스팅 원가",
      "speech.cost.permin": "오디오 1분당",
      "speech.cost.noapi": "비교할 API 단가를 입력하면 손익을 계산합니다.",
      "speech.cost.cheaper": "✅ 자체 호스팅이 오디오-시간당 ${v} 저렴합니다",
      "speech.cost.apicheaper": "⚠️ API가 오디오-시간당 ${v} 저렴합니다",
      "speech.own.oversub": "⚠️ 이 장비로는 월 최대 {max} 오디오-시간까지만 가능합니다.",
      "speech.method.anchor": "기준점: {src}를 {gpu}에서 {engine}으로 돌린 실시간 {x}배(동시성 {c}).",
      "speech.method.batched": "동시성 {c}에서는 실시간 {x}배까지 올랐습니다.",
      "speech.method.wer": "같은 실행의 WER {w}% (동시성 상향 시 {wb}%).",
      "speech.method.sibling": "이 모델 자체는 측정하지 않았고, 같은 아키텍처의 측정치를 파라미터 비율로 환산했습니다.",
      "speech.method.scaled": "{gpu}의 연산 성능비로 환산했습니다.",
      "speech.method.none": "자체 실측치가 없어 속도를 추정하지 않습니다 — 이 모델은 VRAM만 계산합니다.",
      "mplace.nodemem": "GPU별 메모리",
      "mplace.ladderhint": "— 막대 = 처리량(최대 대비) · 빗금 = 인스턴스를 못 채우고 노는 GPU",
      "mplace.cards.more": "· 나머지 {n}장은 동일",
      "mplace.card.idle": "미사용",
      "mplace.role.replica": "복제 {r}",
      "mplace.role.shard": "복제 {r} · 샤드 {s}/{n}",
      "mplace.role.idle": "유휴",
      "mplace.seg.weights": "가중치",
      "mplace.seg.overhead": "오버헤드",
      "mplace.gpus": "GPU 수",
      "mplace.instance": "인스턴스",
      "mplace.rep": "복제",
      "mplace.replicas": "복제 {r}개",
      "mplace.short": "GPU {n}장이 있어야 1개 인스턴스가 뜹니다",
      "mplace.summary": "GPU <b>{n}</b>장 · 인스턴스당 <b>{per}</b>장 → 복제 <b>{r}</b>개",
      "mplace.idle": "⚠️ {i}장이 남아 놉니다 — 인스턴스당 GPU 수로 나누어떨어지지 않습니다.",
      "mplace.shortnote": "⚠️ 이 모델은 인스턴스 하나에 GPU {n}장이 필요합니다 — 지금 선택으로는 한 개도 못 띄웁니다.",
      "mplace.throughput": "합계 처리량 <b>{v}</b> {unit}",
      "mplace.nothroughput": "속도를 산출하지 못해 합계 처리량을 낼 수 없습니다.",
      "mplace.ladder": "GPU 수별 처리량",
      "mplace.qladder": "양자화 사다리",
      "mplace.qladderhint": "— 막대 = usable 대비 · 초록 fit · 빨강 초과",
      "mplace.qckpts": "공개 양자화 체크포인트",
      "mplace.qarith": "막대는 산술 what-if입니다 — 양자화는 VRAM만 줄이고 속도는 그대로입니다(실측: fp8 단독은 오히려 느렸음). ✓ = 공개 체크포인트가 있는 티어.",
      "mplace.int4dead": "디퓨전(DiT)은 INT4 서빙 경로가 없어 참고용으로만 표시합니다",
      "media.tuning": "파라미터 튜닝 가이드",
      "tune.official": "공식",
      "mplace.whytitle": "왜 샤딩이 아니라 복제인가",
      "mplace.why.media1": "LLM 탭은 모델 하나를 여러 장에 <b>쪼개는</b> 문제를 풉니다. 디퓨전은 대개 한 장에 들어가므로 반대 질문이 됩니다 — 몇 개를 <b>복제</b>할 것인가.",
      "mplace.why.media2": "실측에서 배치를 키우면 6~10%만 빨라지는데 VRAM은 1.5배가 됩니다. 반면 GPU를 한 장 더 쓰면 처리량이 그대로 2배가 됩니다. 디퓨전에서는 배칭이 아니라 복제가 정답입니다.",
      "mplace.why.speech1": "음성 모델은 몇 GB짜리라 거의 항상 한 장에 들어갑니다. 규모를 키우는 방법은 샤딩이 아니라 복제입니다.",
      "mplace.why.speech2": "다만 디퓨전과 달리 인스턴스 <b>안에서</b> 동시성을 올리는 것도 효과가 있습니다(실측 Granite 37.9배→124배). 복제를 늘리기 전에 동시성부터 올리는 편이 쌉니다.",
      "rd.tier.native": "네이티브 지원",
      "rd.tier.partial": "부분 지원 — 확인 필요",
      "rd.tier.custom": "벤더 자체 경로",
      "rd.tier.transformers": "Transformers 백엔드",
      "rd.tier.unsupported": "미지원",
      "rd.tier.unknown": "판정 불가",
      "rd.tier.incompatible": "하드웨어 미지원",
      "serve.cmd": "서빙 코드",
      "serve.via": "경로",
      "serve.lib": "라이브러리",
      "serve.pipeline": "파이프라인 클래스",
      "serve.arch": "아키텍처",
      "serve.servedid": "서빙 대상 체크포인트",
      "serve.docs": "지원 목록 원문 보기",
      "serve.nodata": "이 모델에 대한 지원 정보가 없습니다.",
      "serve.nocmd": "이 엔진에서 지원이 확인되지 않아 실행 코드를 제공하지 않습니다.",
      "serve.noserver": "diffusers·transformers는 HTTP 서버를 내장하지 않습니다 — 직접 감싸거나 위의 vLLM·TensorRT 탭 경로를 쓰세요.",
      "serve.omninote": "vLLM 코어가 아니라 확장판 vLLM-Omni가 서빙합니다 — 설치가 별도입니다.",
      "serve.trtbeta": "VisualGen은 2026-02 도입된 베타라 API와 지원 목록이 계속 바뀝니다.",
      "serve.trtstatic": "엔진을 미리 빌드하므로 해상도와 배치 크기가 고정됩니다 — 바꾸려면 재빌드해야 합니다.",
      "serve.pkgnote": "모델 전용 패키지를 씁니다 — 의존성 충돌을 피하려면 격리 venv를 권장합니다.",

      // --- image / video generation (diffusion) ---
      "lbl.category": "모델 종류",
      "cat.llm": "텍스트 LLM",
      "cat.image": "이미지 생성",
      "cat.video": "영상 생성",
      "lbl.steps": "디노이징 스텝",
      "lbl.resolution": "해상도",
      "lbl.frames": "프레임 수",
      "lbl.cfg": "CFG 사용 (스텝당 forward 2회)",
      "lbl.mitem": "월 예상 생성량",
      "lbl.mitem.image": "월 예상 생성 장수",
      "lbl.mitem.clip": "월 예상 생성 클립 수",
      "lbl.api.image": "비교 API 단가 ($/장)",
      "lbl.api.clip": "비교 API 단가 ($/클립)",
      "lbl.api.sec": "비교 API 단가 ($/영상 초)",
      "media.cost.persec": "영상 API는 초당 과금이라 ${rate}/초 × {s}초 클립으로 환산했습니다.",
      "tab.media": "비용 · 적합성",
      "legend.backbone": "백본",
      "legend.textenc": "텍스트 인코더",
      "legend.vaeact": "VAE·활성값",
      "media.hero.sub": "시간당 {v} {unit}",
      "speech.hero.sub": "시간당 {v} 오디오-시간",
      "vs.self": "자체 호스팅",
      "vs.api": "API",
      "media.latency": "생성 시간",
      "media.throughput": "시간당 처리량",
      "media.howtitle": "이 숫자를 어떻게 계산했나",
      "media.unit.image": "장",
      "media.unit.clip": "클립",
      "media.chip.total": "전체",
      "media.chip.active": "활성",
      "media.chip.backbone": "백본",
      "media.chip.textenc": "텍스트 인코더",
      "media.chip.image": "이미지 생성",
      "media.chip.video": "영상 생성",
      "media.chip.catalog": "데모 카탈로그 등재",
      "media.frameslab": "{n} 프레임 · 약 {s}초 @{fps}fps",
      "media.mitemlab": "월 {n} {unit}",
      "media.mmss": "{m}분 {s}초",
      "media.vram.line": "백본 <b>{b}GB</b> + 텍스트 인코더 <b>{e}GB</b> + VAE·활성값 <b>{o}GB</b> = <b>{tot}GB</b>",
      "media.vram.tokens": "이 설정의 latent 토큰 {tok}개 — 디퓨전은 KV 캐시가 없고 매 스텝 전체 토큰을 다시 계산합니다.",
      "media.basis.measured": "실측 기준",
      "media.basis.measured-sibling": "동일 백본 실측 기준",
      "media.basis.measured-approx": "실측(개략) 기준",
      "media.basis.estimated": "추정치",
      "media.basis.unmodelled": "추정 안 함",
      "media.basis.unknown": "산출 불가",
      "media.nospeed.unet": "UNet 계열이라 DiT용 계산식이 실제보다 10배 이상 부풀립니다. 자체 벤치마크도 없어 속도는 추정하지 않고 VRAM만 계산합니다.",
      "media.nospeed.tflops": "{gpu}의 dense BF16 연산 성능을 제조사가 공개하지 않아 속도를 계산하지 않습니다. VRAM 적합성은 그대로 유효합니다.",
      "media.latency.nnote": "GPU {n}장에 모델을 쪼개 올린 기준",
      "media.batchnote": "배치=1 기준. 디퓨전은 배치를 키워도 실측 6~10%만 빨라지고 VRAM은 1.5배가 됩니다.",
      "media.cost.selfrate": "자체 호스팅 원가",
      "media.cost.per1000": "1,000{unit} 기준",
      "media.cost.apirate": "비교 API 단가",
      "media.cost.cheaper": "✅ 자체 호스팅이 {unit}당 ${v} 저렴합니다",
      "media.cost.apicheaper": "⚠️ API가 {unit}당 ${v} 저렴합니다",
      "media.cost.noapi": "비교할 API 단가를 입력하면 손익을 계산합니다. 이미지·영상 API는 대부분 출력 토큰이나 구독제로 매겨져 장당 단가로 환산되지 않아, 검증한 값만 프리셋으로 싣습니다.",
      "media.cost.nospeed": "속도를 산출하지 못해 원가를 계산할 수 없습니다.",
      "media.own.needapi": "API 단가를 입력하면 회수 기간을 계산합니다.",
      "media.own.oversub": "⚠️ 이 장비로는 월 최대 {max}{unit}까지만 가능합니다. GPU를 늘리거나 생성량을 낮추세요.",
      "media.restrict.title": "⚠️ 라이선스 지역 제한 — {t}",
      "media.restrict.readlicense": "라이선스 원문 보기 ({name})",
      "media.method.anchor": "기준점: {src}를 {gpu}에서 실제로 돌린 {sec}초 ({at}).",
      "media.method.atimage": "{w}×{h} · {s}스텝",
      "media.method.atvideo": "{w}×{h} · {f}프레임 · {s}스텝",
      "media.method.scaled": "여기서 연산량 비율과 {gpu}의 dense BF16 {tf} TFLOPS로 환산했습니다.",
      "media.method.roofline": "이 모델은 자체 실측치가 없어 연산량 ÷ (장비 성능 × 효율 {mfu}%)로 추정했습니다. 실측 모델들의 효율이 13~64%로 갈리므로 오차가 큽니다.",
      "media.method.flops": "이 설정의 총 연산량 약 {g} TFLOPs.",
      "media.method.quant": "양자화는 VRAM만 줄이고 속도는 그대로 둡니다 — 실측에서 fp8 단독은 오히려 0.83배로 느렸고, torch.compile과 함께 써야 1.72배가 나왔습니다.",

      "calc.tokS": "추론 속도",
      "calc.throughput": "서빙 처리량",
      "calc.selfvsapi": "자체 호스팅 vs API",
      // readiness common
      "rd.verdict": "판정",
      "rd.servecmd": "서빙 명령 (계산기 입력에서 도출)",
      "rd.manifest": "배포 매니페스트",
      "rd.versions": "엔진 버전 · 최근 3개",
      "rd.toolcalling": "툴 콜링 파라미터 (이 모델)",
      "btn.copy": "복사",
      "btn.download": "다운로드",
      // dynamic — versions + tool calling
      "dyn.rd.ver.current": "현재 핀",
      "dyn.rd.ver.released": "출시 {d}",
      "dyn.rd.ver.docs": "문서",
      "dyn.rd.ver.flags": "주요 플래그",
      "dyn.rd.tool.parser": "툴 파서",
      "dyn.rd.tool.reasoning": "reasoning 파서",
      "dyn.rd.tool.none": "이 아키텍처의 네이티브 툴 파서는 <b>미확인</b>입니다.",
      "dyn.rd.tool.add": "툴 콜링을 켜려면 서빙 명령에 아래 플래그를 추가:",
      "dyn.rd.tool.na": "이 하드웨어에서 {engine}을 실행할 수 없어 툴 콜링 파라미터를 생성하지 않습니다.",
      "dyn.rd.tool.src.arch": "아키텍처 {arch} 기준",
      "dyn.rd.tool.src.model": "이 모델 오버라이드",
      "dyn.rd.tool.src.default": "기본값(아키텍처 미매칭)",
      // spark panel
      "spark.nodes": "노드 수",
      "spark.reap": "REAP 전문가 프루닝",
      "spark.ladder": "양자화 사다리",
      "spark.ladderhint": "— 막대 = usable 대비 · 초록 fit · 빨강 초과",
      "spark.specdecode": "추측 디코딩 (spec decode)",
      "spark.context": "컨텍스트",
      "spark.nodemem": "노드별 메모리",
      "legend.overhead2": "오버헤드",
      "spark.note": "모든 수치는 <b>계획용 근사</b>입니다 — bpp·세그먼트는 <a href=\"https://howtospark.com/\" target=\"_blank\" rel=\"noopener\">howtospark.com</a> recipe와 <a href=\"https://github.com/Sapid-Labs/vLLM-Moet\" target=\"_blank\" rel=\"noopener\">vLLM-Moet</a> 커널에 앵커링. REAP 프루닝: <a href=\"https://arxiv.org/abs/2510.13999\" target=\"_blank\" rel=\"noopener\">Cerebras 2510.13999</a> (최대 50%). 실측 벤치 권장.",
      // reference
      "ref.h2": "참고 · 이미지 생성 &amp; 음성(STT/TTS) 최신 모델·API 가격",
      "ref.sub": "아래는 <b>토큰 단위가 아니라서</b> 위 토큰 계산기와 1:1로 비교되지 않는 항목입니다 — 이미지 생성 API, 그리고 음성(STT/TTS) 자체 호스팅 모델과 API 가격을 <b>최신 참고용</b>으로 정리했습니다. 모두 공개 정보 기반 근사입니다.",
      "ref.image": "이미지 생성 API",
      "ref.speechself": "음성 STT/TTS — 자체 호스팅 모델",
      "ref.speechapi": "음성 STT/TTS — API 가격",
      // how sections
      "how.calc.summary": "계산 방식 (투명하게)",
      "how.calc.li1": "<b>VRAM</b> = 가중치(<code>total_params × bytes/param</code>) + KV캐시(<code>2 × layers × kv_dim × 2B × 컨텍스트</code>, GQA 반영) + 오버헤드(<code>1.2GB + 5%</code>).",
      "how.calc.li2": "<b>추론 속도</b>(단일 스트림)는 디코딩이 메모리 대역폭에 묶인다는 근사: <code>MBU(0.5) × 대역폭 ÷ (활성 파라미터 × bytes)</code>. MoE는 활성 파라미터만 세므로 빠릅니다.",
      "how.calc.li3": "<b>서빙 처리량</b> = 단일속도 × 유효배치 × 0.7. 유효배치는 남은 VRAM으로 감당 가능한 동시 시퀀스 수로 상한.",
      "how.calc.li4": "<b>손익분기 (임대)</b>: 자체 호스팅 $/1M = <code>(렌트/시간 ÷ 3600) ÷ 처리량 × 1e6</code>. 이 값이 API 단가보다 낮으면(=GPU를 충분히 채우면) 자체 호스팅이 쌉니다.",
      "how.calc.li5": "<b>회수 개월 (구매/온프렘)</b>: 장비를 <b>사는</b> 경우 — <code>capex = 구매가 × 필요 GPU수</code>, 월 전기료 = <code>전력(kW) × 월 토큰 생성에 쓴 GPU-시간 × $/kWh</code>, <code>회수개월 = capex ÷ (월 API비용 − 월 전기료)</code>. 전기료는 <b>토큰 생성에 실제 쓴 시간</b>만 계산하며 <b>idle 전력은 제외</b>합니다(실제 24/7 전용 박스는 더 듭니다). 월 순절감이 0 이하면 이 토큰량에선 회수되지 않습니다.",
      "how.calc.note": "모두 <b>근사 추정</b>입니다. 실제 수치는 커널·프레임워크·페이징·양자화 방식에 따라 달라집니다. 의사결정 전 실측 벤치를 권장합니다.",
      "how.quant.summary": "양자화 기법 가이드 (NVFP4·MXFP4·FP8·INT4 …)",
      "how.quant.p": "양자화 = 가중치(와 활성값)를 더 적은 비트로 저장해 <b>VRAM과 메모리 대역폭</b>을 줄이는 것. 디코딩은 대역폭에 묶이므로, 절반 비트로 줄이면 VRAM만이 아니라 <b>tok/s도 대략 그만큼 빨라집니다</b>. 위 양자화 선택이 <code>bytes/param</code>을 바꿔 두 값 모두에 반영됩니다.",
      "how.quant.li1": "<b>bytes/param</b>: FP16·BF16 <code>2</code> · FP8·INT8 <code>1</code> · <b>NVFP4 <code>~0.5625</code></b>(4.5bit) · MXFP4 <code>~0.53125</code>(4.25bit) · INT4 <code>0.5</code>. 4-bit 포맷은 4비트 데이터에 <b>블록 스케일</b>이 붙어 정확히 0.5는 아닙니다 — 계산기는 이 오버헤드를 반영합니다.",
      "how.quant.li2": "<b>NVFP4</b> (NVIDIA): FP4 <code>E2M1</code> 값 + <b>16개마다 FP8(E4M3) 블록 스케일</b> + 텐서당 FP32 스케일 → 유효 4.5bit. Blackwell(B200/B300/GB200/GB300·RTX PRO 6000·RTX 50) FP4 텐서코어에서 하드웨어 가속되며, FP8에 근접한 정확도를 4-bit 크기로 냅니다. TensorRT-Model-Optimizer로 PTQ.",
      "how.quant.li3": "<b>MXFP4</b> (OCP Microscaling): FP4 + <b>32개마다 E8M0 블록 스케일</b> → 유효 4.25bit. OpenAI <code>gpt-oss</code>의 기본 포맷. Blackwell/일부 최신 하드웨어에서 가속.",
      "how.quant.li4": "<b>FP8</b> (E4M3/E5M2): 8-bit 부동소수. Hopper(H100/H200)·Blackwell 네이티브. 거의 무손실에 가까워 서빙 기본값으로 인기(가중치+KV+활성값 모두 FP8 가능).",
      "how.quant.li5": "<b>INT4 계열 PTQ</b>: <b>GPTQ</b>(2차 헤시안 기반 반올림), <b>AWQ</b>(활성값-인지 채널 스케일), <b>AutoRound</b>, <b>HQQ</b>(캘리브레이션 없이 빠름), <b>bitsandbytes NF4</b>(QLoRA 학습용). <b>SmoothQuant</b>는 활성 이상치를 가중치로 이전해 INT8을 매끄럽게. <b>QuaRot·SpinQuant</b>는 회전으로 이상치를 눌러 4-bit 정확도를 끌어올림.",
      "how.quant.li6": "<b>GGUF k-quants</b> (llama.cpp): <code>Q4_K_M</code>·<code>Q5_K_M</code>·<code>Q6_K</code> 등 블록·혼합정밀. Apple·CPU·소비자 GPU 자체 호스팅의 사실상 표준. <code>Q4_K_M</code> ≈ 4.5bit로 NVFP4와 비슷한 크기.",
      "how.quant.li7": "<b>더 낮은 비트</b>: INT2·<b>1.58-bit(BitNet)</b>·2-bit AQLM/QuIP# 도 있으나 정확도 손실이 커 대개 특수용도. 계산기는 다루지 않습니다.",
      "how.quant.li8": "<b>주의</b>: 위 tok/s 이득은 <b>메모리 절감</b> 기준입니다. NVFP4/MXFP4는 <b>FP4 텐서코어가 있어야</b> 연산까지 가속되고(없으면 메모리 이득만), INT4는 Marlin 등 최적화 커널이 필요합니다. KV 캐시는 계산기가 FP16으로 잡지만 실제로는 FP8/INT8로도 줄일 수 있습니다.",
      "footer": "100% 클라이언트 사이드 · <a href=\"https://github.com/sylvanus4/llm-selfhost-calculator\">GitHub</a> · MIT · 특정 벤더와 무관한 독립 도구. 수치는 공개 정보 기반 추정치입니다.",
      // dynamic — cost (own)
      "dyn.own.needkwh": "전기 단가($/kWh)를 입력하면 회수 개월수를 계산합니다.",
      "dyn.own.needcapex": "이 기기는 공개 구매가 또는 전력값이 없습니다 — 왼쪽에서 <b>구매가 override</b>를 입력하면 회수 개월수를 계산합니다.{n}",
      "dyn.own.needN": " (이 모델은 {N}대 필요)",
      "dyn.own.capex": "장비 capex",
      "dyn.own.elec": "월 전기료",
      "dyn.own.apicost": "월 API 비용 (대체분)",
      "dyn.own.netsave": "월 순절감 (API − 전기)",
      "dyn.own.oversub": "⚠️ 이 처리량으론 월 {h} GPU-h(&gt;730h/월)가 필요 — 실제론 이 볼륨을 다 못 뽑습니다. GPU를 늘리거나 월 토큰량을 낮추세요.",
      "dyn.own.recovers": "이 토큰량이면 약 <b>{pb}개월</b>에 구매비를 회수합니다{warn}. GPU를 이만큼 꾸준히 돌린다는 가정입니다.",
      "dyn.own.recovers.warn": " — 다만 <b>5년+</b>라 감가·고장 전에 못 뽑을 수 있습니다",
      "dyn.own.norecover": "이 토큰량에서는 <b>전기료 ≥ 대체 API 비용</b>이라 자체 호스팅이 되레 비싸 <b>회수되지 않습니다</b>. 월 토큰량을 늘리거나 더 싼 전기/장비가 필요합니다.",
      "dyn.chart.aria": "누적 비용 곡선",
      "dyn.chart.buycum": "구매 누적 (capex+전기)",
      "dyn.chart.apicum": "API 누적",
      "dyn.chart.cross": "┊ {pb}개월 교차",
      "dyn.chart.outside": "{pb}개월 (36개월 창 밖)",
      // dynamic — calc
      "dyn.mtok": "{v}B tok/월",
      "dyn.fit.single": "✅ {gpu} 1개에 들어감",
      "dyn.fit.multi": "🔀 {gpu} <b>{n}개</b> 필요 (텐서 병렬)",
      "dyn.vram.line": "가중치 <b>{w}GB</b> + KV <b>{kv}GB</b> (@{ctx} tok) + 오버헤드 <b>{o}GB</b> = <b>{tot}GB</b>",
      "dyn.vram.multi": " → <b>{n}×</b> {vram}GB (총 {total}GB)",
      "dyn.vram.single": " / {vram}GB",
      "dyn.vram.maxctx": "이 구성 배치=1 최대 컨텍스트 <b>{tok} tok</b>{suffix}",
      "dyn.vram.maxctx.head": " (모델 최대치까지 여유)",
      "dyn.vram.maxctx.over": " (더 길면 VRAM 초과)",
      "dyn.vram.weightsover": "가중치가 이미 VRAM을 초과 — 컨텍스트 0",
      "dyn.tokS.stream": "단일 스트림",
      "dyn.tokS.nnote": " · {n} GPU 합산 대역폭",
      "dyn.tokS.serving": "서빙 총량 (배치 {b}, VRAM 헤드룸 최대 {m})",
      "dyn.cost.owned.apple": "소유 기기(Apple)",
      "dyn.cost.owned.npu": "온프렘 NPU",
      "dyn.cost.owned.gen": "소유/온프렘 기기",
      "dyn.cost.owned": "{kind}입니다 — 시간당 렌트가 없으므로 API 손익분기 대신 전기요금과 비교하세요. 위 tok/s와 적합성만 참고하세요.{n}",
      "dyn.cost.ownedN": " 이 모델은 이 기기 {N}대가 필요합니다.",
      "dyn.cost.selfrate": "자체 호스팅 추정 단가",
      "dyn.cost.apirate": "선택한 API 단가",
      "dyn.cost.needtput": "API를 이기려면 필요한 처리량",
      "dyn.cost.needtput.cur": "(현재 추정 {v})",
      "dyn.cost.cheaper": "이 이용률에서는 <b>자체 호스팅이 더 쌉니다</b>. 다만 GPU {n}계속 바쁘게 돌려야 유효합니다.",
      "dyn.cost.cheaperN": "{N}대를 ",
      "dyn.cost.apicheaper": "이 이용률에서는 <b>API가 더 쌉니다</b>. 자체 호스팅은 처리량을 {v} tok/s 이상 꾸준히 채울 때만 유리합니다.",
      "dyn.moenote": " · MoE: 메모리는 전체 {t}B를 싣지만 디코딩은 활성 {a}B만 → tok/s가 빠릅니다.",
      "dyn.ctxover": " ⚠️ 선택 컨텍스트가 모델 최대({m})를 초과",
      // dynamic — readiness
      "dyn.rd.model": "모델",
      "dyn.rd.arch": "아키텍처",
      "dyn.rd.hardware": "하드웨어",
      "dyn.rd.base": "기준 {engine}",
      "dyn.rd.min": " · 최소 v{v}",
      "dyn.rd.vramnote.vllm": "임의 HF 모델 — 파라미터 수 미상이라 VRAM 자동산정/TP 계산은 생략합니다(TP=1 기본, 매니페스트에서 직접 조정).",
      "dyn.rd.vramnote.engine": "임의 HF 모델 — 파라미터 수 미상이라 TP=1 기본(매니페스트에서 직접 조정).",
      "dyn.rd.whatif.vllm": "⚠️ <code>--quantization</code>은 해당 양자화 체크포인트가 실제 존재할 때만 유효합니다. 계산기의 양자화 선택은 VRAM \"what-if\"이며, vLLM은 디스크 위 실제 가중치 포맷과 맞아야 합니다.",
      "dyn.rd.whatif.engine": "⚠️ 양자화 플래그는 해당 양자화 체크포인트가 실제 존재할 때만 유효합니다 — 계산기의 양자화 선택은 VRAM \"what-if\"입니다.",
      "dyn.rd.incompatible": "이 하드웨어에서는 {engine}을 실행할 수 없어 서빙 명령을 생성하지 않습니다.",
      // dynamic — spark
      "dyn.spark.denseapprox": "dense [근사]",
      "dyn.spark.node": "노드 {i}",
      "dyn.spark.noprune": "프루닝 없음 · {n} experts",
      "dyn.spark.reap.dense": "dense 모델 — REAP 해당 없음",
      "dyn.spark.reap.warn": "⚠️ 30%↑ 프루닝은 품질 저하 가능 (Cerebras: 50%에서 ~97% 유지)",
      "dyn.spark.fit": "✅ {n}× {gpu}에 들어감",
      "dyn.spark.nofit": "⚠️ {n}×에 안 들어감 — 노드↑ / 더 낮은 quant / REAP↑",
      "dyn.spark.memtitle": "노드별 메모리 — {n}× · {mode} · {ctx} ctx",
      "dyn.spark.ctxfits": "이 구성 최대 컨텍스트 <b>~{k}K tok</b> <span class=\"dim\">(현재 {cur})</span>",
      "dyn.spark.ctxover": "가중치가 usable 초과 — 컨텍스트 0",
      // dynamic — HF funnel + misc
      "dyn.copied": "복사됨",
      "dyn.copyfail": "복사 실패 — 코드를 직접 선택하세요",
      "dyn.hf.badurl": "URL/ID를 해석하지 못했습니다. 예: <code>Qwen/Qwen3-8B</code>",
      "dyn.hf.curated": "✅ 큐레이션 모델 <b>{name}</b> — 오프라인 판정 사용(외부 요청 없음)",
      "dyn.hf.notcurated": "<b>{ref}</b> — 큐레이션 목록에 없음. 아래 버튼으로 HF에 <code>config.json</code>을 요청하면 vLLM 판정을 냅니다. <span class=\"warn\">(외부 네트워크 요청)</span>",
      "dyn.hf.loading": "config.json 불러오는 중…",
      "dyn.hf.loaded": "✅ <b>{ref}</b> config 불러옴 — 오른쪽 <b>vLLM 서빙 준비도</b> 탭 참고.",
      "dyn.hf.loadfail": "불러오기 실패 ({msg}). 게이트/비공개 모델·CORS·오프라인일 수 있습니다. 큐레이션 드롭다운을 사용하세요.",
      "dyn.err.load": "데이터를 불러오지 못했습니다. 로컬에서는 <code>python3 -m http.server</code>로 실행하세요 (file://는 fetch가 막힙니다). GitHub Pages에서는 정상 동작합니다.",
    },
    en: {
      "doc.title": "LLM Self-Hosting Calculator · VRAM · cost · vLLM/SGLang/TensorRT-LLM serving readiness (docker-compose · K8s manifests)",
      "doc.desc": "Will this LLM run on my GPU/Mac? Cheaper than an API? Served natively on vLLM, SGLang or TensorRT-LLM? VRAM fit · token speed · break-even + per-node placement + three-engine serving-support verdicts (by model, quantization, hardware) + ready-to-run docker-compose / Kubernetes manifests, instantly in the browser. No keys, no data leaves your browser.",
      "h1": "LLM Self-Hosting Calculator",
      "sub": "Will this model run on my hardware? Cheaper than an API? — instantly compute VRAM fit · speed · break-even for <b>text LLMs, image generation, video generation and speech</b>. <b>No keys · no server · no data leaves your browser.</b>",
      "ctrl.lang": "Language",
      "ctrl.theme": "Theme",
      "theme.dark": "Dark",
      "theme.light": "Light",
      "inputs.h2": "Inputs",
      "lbl.model": "Model",
      "hint.newest": "newest first",
      "lbl.hfref": "or HF model URL/ID",
      "hint.paste": "paste to parse",
      "ph.hfref": "huggingface.co/Qwen/Qwen3-8B or Qwen/Qwen3-8B",
      "btn.hffetch": "Fetch config.json from HF (external request)",
      "lbl.quant": "Quantization",
      "hint.quant": "see 4-bit notes below",
      "lbl.hardware": "Hardware",
      "lbl.context": "Context length",
      "lbl.concurrency": "Concurrency",
      "lbl.costmode": "Cost mode",
      "opt.rent": "Rent (cloud $/hr)",
      "opt.own": "Buy (on-prem payback)",
      "lbl.rent": "GPU rent override ($/hr, blank = default)",
      "ph.rent": "e.g. 2.5",
      "lbl.kwh": "Electricity ($/kWh)",
      "hint.kwh": "KR industrial ≈ ₩150 ≈ $0.11",
      "lbl.mtok": "Monthly tokens",
      "lbl.capex": "Purchase price override ($/device, blank = data default)",
      "ph.capex": "e.g. 28000",
      "lbl.apipreset": "Comparison API preset",
      "lbl.api": "Comparison API price ($/1M tok)",
      "tab.calc": "Cost · Fit",
      "tab.spark": "Per-node placement",
      "tab.vllm": "vLLM readiness",
      "tab.sglang": "SGLang readiness",
      "tab.trt": "TensorRT-LLM readiness",
      "calc.h2": "Result",
      "legend.weights": "Weights",
      "legend.kv": "KV cache",
      "legend.overhead": "Overhead",
      "legend.vramcap": "Device VRAM limit",
      // --- speech (STT/TTS) + placement + serving tabs ---
      "cat.speech": "Speech STT/TTS",
      "lbl.maudio": "Monthly audio volume",
      "lbl.api.min": "Comparison API price ($/audio minute)",
      "tab.mplace": "Per-node placement",
      "tab.mpytorch": "PyTorch serving",
      "tab.mvllm": "vLLM readiness",
      "tab.mtrt": "TensorRT serving",
      "speech.chip.stt": "speech recognition",
      "speech.chip.tts": "speech synthesis",
      "speech.realtime": "realtime",
      "speech.perminute": "processes 1 minute of audio in {s}s",
      "speech.belowrealtime": "⚠️ slower than realtime — not viable for streaming",
      "speech.audiohours": "audio-hours/hour",
      "speech.audiohour": "audio-hour",
      "speech.batchnote": "Raising concurrency raises this — unlike diffusion, speech genuinely batches.",
      "speech.capped": "Measured only up to concurrency {c}. Beyond that we hold the last measured value rather than extrapolate.",
      "speech.nospeed": "No benchmark of our own for this model, so we do not estimate speed. The VRAM fit still holds.",
      "speech.noruntime": "⛔ No runtime currently exists for this model",
      "speech.vram.line": "Weights <b>{w}GB</b> + runtime overhead <b>{o}GB</b> = <b>{tot}GB</b>",
      "speech.vram.measured": "This is measured resident memory, not arithmetic.",
      "speech.maudiolab": "{n} audio-hours/mo",
      "speech.cost.self": "Self-hosted cost",
      "speech.cost.permin": "per audio minute",
      "speech.cost.noapi": "Enter an API price to compare.",
      "speech.cost.cheaper": "✅ Self-hosting is ${v} cheaper per audio-hour",
      "speech.cost.apicheaper": "⚠️ The API is ${v} cheaper per audio-hour",
      "speech.own.oversub": "⚠️ This fleet tops out at {max} audio-hours per month.",
      "speech.method.anchor": "Anchor: {src} run on {gpu} via {engine} at {x}x realtime (concurrency {c}).",
      "speech.method.batched": "At concurrency {c} it reached {x}x realtime.",
      "speech.method.wer": "WER from the same run: {w}% (and {wb}% at higher concurrency).",
      "speech.method.sibling": "This model was not benchmarked itself; the figure is scaled from an identical architecture by parameter ratio.",
      "speech.method.scaled": "Scaled by {gpu}'s compute ratio.",
      "speech.method.none": "No benchmark of our own, so speed is not estimated — VRAM only for this model.",
      "mplace.nodemem": "Memory per GPU",
      "mplace.ladderhint": "— bar = throughput (vs the widest fleet) · hatched = GPUs left idle",
      "mplace.cards.more": "· the other {n} are identical",
      "mplace.card.idle": "unused",
      "mplace.role.replica": "replica {r}",
      "mplace.role.shard": "replica {r} · shard {s}/{n}",
      "mplace.role.idle": "idle",
      "mplace.seg.weights": "weights",
      "mplace.seg.overhead": "overhead",
      "mplace.gpus": "GPU count",
      "mplace.instance": "instance",
      "mplace.rep": "replicas",
      "mplace.replicas": "{r} replicas",
      "mplace.short": "needs {n} GPUs for a single instance",
      "mplace.summary": "<b>{n}</b> GPUs · <b>{per}</b> per instance → <b>{r}</b> replicas",
      "mplace.idle": "⚠️ {i} GPUs sit idle — the fleet does not divide evenly by GPUs-per-instance.",
      "mplace.shortnote": "⚠️ This model needs {n} GPUs for one instance — the current selection cannot host even one.",
      "mplace.throughput": "Aggregate throughput <b>{v}</b> {unit}",
      "mplace.nothroughput": "No latency available, so no aggregate throughput.",
      "mplace.ladder": "Throughput by GPU count",
      "mplace.qladder": "Quant ladder",
      "mplace.qladderhint": "— bar = vs usable · green fits · red overflow",
      "mplace.qckpts": "Published quantized checkpoints",
      "mplace.qarith": "Bars are an arithmetic what-if — quantisation only moves VRAM, never speed (measured: fp8 alone was slower). ✓ = tier with a published checkpoint.",
      "mplace.int4dead": "Diffusion (DiT) has no INT4 serving path — shown for reference only",
      "media.tuning": "Parameter tuning guide",
      "tune.official": "official",
      "mplace.whytitle": "Why replicas, not sharding",
      "mplace.why.media1": "The LLM tab solves how to <b>split</b> one model across devices. A diffusion model usually fits on one, so the question inverts — how many <b>replicas</b> do you run.",
      "mplace.why.media2": "Measured, raising the batch buys 6-10% for 1.5x the VRAM. A second GPU buys a clean 2x. For diffusion the answer is replicas, not batching.",
      "mplace.why.speech1": "Speech models are a few GB, so they almost always fit on one device. You scale them by replication, not sharding.",
      "mplace.why.speech2": "Unlike diffusion, though, concurrency <b>inside</b> an instance also pays (measured: Granite 37.9x to 124x). Raise concurrency before you add replicas — it is cheaper.",
      "rd.tier.native": "native support",
      "rd.tier.partial": "partial — needs checking",
      "rd.tier.custom": "vendor's own path",
      "rd.tier.transformers": "Transformers backend",
      "rd.tier.unsupported": "unsupported",
      "rd.tier.unknown": "unverified",
      "rd.tier.incompatible": "hardware unsupported",
      "serve.cmd": "Serving code",
      "serve.via": "Path",
      "serve.lib": "Library",
      "serve.pipeline": "Pipeline class",
      "serve.arch": "Architecture",
      "serve.servedid": "Checkpoint served",
      "serve.docs": "Read the support list",
      "serve.nodata": "No support information for this model.",
      "serve.nocmd": "Support is not confirmed on this engine, so no command is offered.",
      "serve.noserver": "diffusers and transformers ship no HTTP server — wrap it yourself, or use the vLLM/TensorRT paths above.",
      "serve.omninote": "Served by the vLLM-Omni extension, not vLLM core — it installs separately.",
      "serve.trtbeta": "VisualGen is a beta introduced 2026-02; its API and model list are still changing.",
      "serve.trtstatic": "The engine is pre-built, so resolution and batch size are baked in — changing them means a rebuild.",
      "serve.pkgnote": "This uses a model-specific package — an isolated venv is recommended to avoid dependency conflicts.",

      // --- image / video generation (diffusion) ---
      "lbl.category": "Model type",
      "cat.llm": "Text LLM",
      "cat.image": "Image generation",
      "cat.video": "Video generation",
      "lbl.steps": "Denoising steps",
      "lbl.resolution": "Resolution",
      "lbl.frames": "Frame count",
      "lbl.cfg": "Use CFG (2 forward passes per step)",
      "lbl.mitem": "Monthly volume",
      "lbl.mitem.image": "Monthly images",
      "lbl.mitem.clip": "Monthly clips",
      "lbl.api.image": "Comparison API price ($/image)",
      "lbl.api.clip": "Comparison API price ($/clip)",
      "lbl.api.sec": "Comparison API price ($/video second)",
      "media.cost.persec": "Video APIs bill per second, so this is ${rate}/s over a {s}s clip.",
      "tab.media": "Cost · fit",
      "legend.backbone": "Backbone",
      "legend.textenc": "Text encoder",
      "legend.vaeact": "VAE + activations",
      "media.hero.sub": "{v} {unit} per hour",
      "speech.hero.sub": "{v} audio-hours per hour",
      "vs.self": "Self-hosted",
      "vs.api": "API",
      "media.latency": "Generation time",
      "media.throughput": "Throughput per hour",
      "media.howtitle": "How this number was derived",
      "media.unit.image": "image",
      "media.unit.clip": "clip",
      "media.chip.total": "total",
      "media.chip.active": "active",
      "media.chip.backbone": "backbone",
      "media.chip.textenc": "text encoder",
      "media.chip.image": "image gen",
      "media.chip.video": "video gen",
      "media.chip.catalog": "in demo catalog",
      "media.frameslab": "{n} frames · about {s}s @{fps}fps",
      "media.mitemlab": "{n} {unit}/mo",
      "media.mmss": "{m}m {s}s",
      "media.vram.line": "Backbone <b>{b}GB</b> + text encoder <b>{e}GB</b> + VAE/activations <b>{o}GB</b> = <b>{tot}GB</b>",
      "media.vram.tokens": "{tok} latent tokens at these settings — diffusion has no KV cache and recomputes every token on every step.",
      "media.basis.measured": "measured",
      "media.basis.measured-sibling": "measured (same backbone)",
      "media.basis.measured-approx": "measured (approx)",
      "media.basis.estimated": "estimated",
      "media.basis.unmodelled": "not estimated",
      "media.basis.unknown": "unavailable",
      "media.nospeed.unet": "This is a UNet, and the DiT formula overstates it by more than 10x. We have no benchmark of our own either, so we compute VRAM only rather than print a wrong latency.",
      "media.nospeed.tflops": "{gpu} has no vendor-published dense BF16 figure, so we decline to estimate speed. The VRAM fit above still holds.",
      "media.latency.nnote": "with the model split across {n} GPUs",
      "media.batchnote": "At batch 1. Raising the batch measured only 6-10% faster for 1.5x the VRAM.",
      "media.cost.selfrate": "Self-hosted cost",
      "media.cost.per1000": "per 1,000 {unit}s",
      "media.cost.apirate": "Comparison API price",
      "media.cost.cheaper": "✅ Self-hosting is ${v} cheaper per {unit}",
      "media.cost.apicheaper": "⚠️ The API is ${v} cheaper per {unit}",
      "media.cost.noapi": "Enter an API price to compare. Most image/video APIs bill by output token or subscription, which does not convert to a per-item price, so only verified figures ship as presets.",
      "media.cost.nospeed": "No latency available, so no cost can be computed.",
      "media.own.needapi": "Enter an API price to compute payback.",
      "media.own.oversub": "⚠️ This fleet tops out at {max} {unit}s per month. Add GPUs or lower the volume.",
      "media.restrict.title": "⚠️ Licence territory restriction — {t}",
      "media.restrict.readlicense": "Read the licence ({name})",
      "media.method.anchor": "Anchor: {src} actually run on {gpu} in {sec}s ({at}).",
      "media.method.atimage": "{w}x{h} · {s} steps",
      "media.method.atvideo": "{w}x{h} · {f} frames · {s} steps",
      "media.method.scaled": "Scaled from there by the FLOPs ratio and {gpu}'s {tf} dense BF16 TFLOPS.",
      "media.method.roofline": "No benchmark of our own for this model, so this is FLOPs / (device peak x {mfu}% efficiency). Measured models range 13-64% efficiency, so treat it as a wide band.",
      "media.method.flops": "About {g} TFLOPs of compute at these settings.",
      "media.method.quant": "Quantisation is modelled as VRAM savings only, not speed — measured, fp8 alone was 0.83x (slower); it only reached 1.72x fused with torch.compile.",

      "calc.tokS": "Inference speed",
      "calc.throughput": "Serving throughput",
      "calc.selfvsapi": "Self-host vs API",
      "rd.verdict": "Verdict",
      "rd.servecmd": "Serve command (derived from inputs)",
      "rd.manifest": "Deployment manifest",
      "rd.versions": "Engine versions · recent 3",
      "rd.toolcalling": "Tool-calling parameters (this model)",
      "btn.copy": "Copy",
      "btn.download": "Download",
      "dyn.rd.ver.current": "current pin",
      "dyn.rd.ver.released": "released {d}",
      "dyn.rd.ver.docs": "docs",
      "dyn.rd.ver.flags": "notable flags",
      "dyn.rd.tool.parser": "tool parser",
      "dyn.rd.tool.reasoning": "reasoning parser",
      "dyn.rd.tool.none": "No native tool parser is <b>confirmed</b> for this architecture.",
      "dyn.rd.tool.add": "To enable tool calling, add these flags to the serve command:",
      "dyn.rd.tool.na": "This hardware can't run {engine}, so no tool-calling parameters are generated.",
      "dyn.rd.tool.src.arch": "for architecture {arch}",
      "dyn.rd.tool.src.model": "this-model override",
      "dyn.rd.tool.src.default": "default (architecture not matched)",
      "spark.nodes": "Nodes",
      "spark.reap": "REAP expert pruning",
      "spark.ladder": "Quant ladder",
      "spark.ladderhint": "— bar = vs usable · green fits · red exceeds",
      "spark.specdecode": "Speculative decoding",
      "spark.context": "Context",
      "spark.nodemem": "Per-node memory",
      "legend.overhead2": "Overhead",
      "spark.note": "All figures are <b>planning approximations</b> — bpp/segments anchored to <a href=\"https://howtospark.com/\" target=\"_blank\" rel=\"noopener\">howtospark.com</a> recipes and <a href=\"https://github.com/Sapid-Labs/vLLM-Moet\" target=\"_blank\" rel=\"noopener\">vLLM-Moet</a> kernels. REAP pruning: <a href=\"https://arxiv.org/abs/2510.13999\" target=\"_blank\" rel=\"noopener\">Cerebras 2510.13999</a> (up to 50%). Measured benchmarks recommended.",
      "ref.h2": "Reference · latest image-gen &amp; speech (STT/TTS) models · API pricing",
      "ref.sub": "The items below are <b>not token-priced</b>, so they don't compare 1:1 with the token calculator above — image-generation APIs, plus self-hosted speech (STT/TTS) models and API pricing, compiled as a <b>current reference</b>. All are approximations from public information.",
      "ref.image": "Image generation API",
      "ref.speechself": "Speech STT/TTS — self-hosted models",
      "ref.speechapi": "Speech STT/TTS — API pricing",
      "how.calc.summary": "How it's calculated (transparent)",
      "how.calc.li1": "<b>VRAM</b> = weights (<code>total_params × bytes/param</code>) + KV cache (<code>2 × layers × kv_dim × 2B × context</code>, GQA-aware) + overhead (<code>1.2GB + 5%</code>).",
      "how.calc.li2": "<b>Inference speed</b> (single stream) approximates decode as memory-bandwidth-bound: <code>MBU(0.5) × bandwidth ÷ (active params × bytes)</code>. MoE counts only active params, so it's fast.",
      "how.calc.li3": "<b>Serving throughput</b> = single speed × effective batch × 0.7. Effective batch is capped by the concurrent sequences remaining VRAM can hold.",
      "how.calc.li4": "<b>Break-even (rent)</b>: self-host $/1M = <code>(rent/hr ÷ 3600) ÷ throughput × 1e6</code>. If this is below the API price (i.e. you keep the GPU busy enough), self-hosting is cheaper.",
      "how.calc.li5": "<b>Payback months (buy / on-prem)</b>: when you <b>buy</b> the hardware — <code>capex = price × GPUs needed</code>, monthly electricity = <code>power(kW) × GPU-hours actually spent generating this month's tokens × $/kWh</code>, <code>payback = capex ÷ (monthly API cost − monthly electricity)</code>. Electricity counts only <b>time actually spent generating tokens</b> and <b>excludes idle power</b> (a real 24/7 dedicated box costs more). If monthly net saving is ≤ 0, it never pays back at this token volume.",
      "how.calc.note": "All are <b>rough estimates</b>. Real numbers vary with kernels, framework, paging, and quantization method. Run measured benchmarks before deciding.",
      "how.quant.summary": "Quantization guide (NVFP4 · MXFP4 · FP8 · INT4 …)",
      "how.quant.p": "Quantization = storing weights (and activations) in fewer bits to cut <b>VRAM and memory bandwidth</b>. Since decode is bandwidth-bound, halving the bits speeds up not just VRAM but <b>tok/s by roughly the same factor</b>. The quantization choice above changes <code>bytes/param</code>, which flows into both.",
      "how.quant.li1": "<b>bytes/param</b>: FP16·BF16 <code>2</code> · FP8·INT8 <code>1</code> · <b>NVFP4 <code>~0.5625</code></b> (4.5bit) · MXFP4 <code>~0.53125</code> (4.25bit) · INT4 <code>0.5</code>. 4-bit formats add a <b>block scale</b> to the 4-bit data, so it isn't exactly 0.5 — the calculator accounts for this overhead.",
      "how.quant.li2": "<b>NVFP4</b> (NVIDIA): FP4 <code>E2M1</code> values + <b>an FP8 (E4M3) block scale every 16</b> + a per-tensor FP32 scale → effective 4.5bit. Hardware-accelerated on Blackwell (B200/B300/GB200/GB300 · RTX PRO 6000 · RTX 50) FP4 tensor cores, delivering near-FP8 accuracy at 4-bit size. PTQ via TensorRT-Model-Optimizer.",
      "how.quant.li3": "<b>MXFP4</b> (OCP Microscaling): FP4 + <b>an E8M0 block scale every 32</b> → effective 4.25bit. The default format for OpenAI <code>gpt-oss</code>. Accelerated on Blackwell / some recent hardware.",
      "how.quant.li4": "<b>FP8</b> (E4M3/E5M2): 8-bit float. Native on Hopper (H100/H200) · Blackwell. Near-lossless, so it's a popular serving default (weights + KV + activations can all be FP8).",
      "how.quant.li5": "<b>INT4-family PTQ</b>: <b>GPTQ</b> (Hessian-based rounding), <b>AWQ</b> (activation-aware channel scaling), <b>AutoRound</b>, <b>HQQ</b> (fast, calibration-free), <b>bitsandbytes NF4</b> (for QLoRA training). <b>SmoothQuant</b> shifts activation outliers into weights to smooth INT8. <b>QuaRot · SpinQuant</b> use rotations to suppress outliers and push 4-bit accuracy.",
      "how.quant.li6": "<b>GGUF k-quants</b> (llama.cpp): <code>Q4_K_M</code> · <code>Q5_K_M</code> · <code>Q6_K</code> etc., block/mixed precision. The de-facto standard for Apple · CPU · consumer-GPU self-hosting. <code>Q4_K_M</code> ≈ 4.5bit, similar in size to NVFP4.",
      "how.quant.li7": "<b>Lower bits</b>: INT2 · <b>1.58-bit (BitNet)</b> · 2-bit AQLM/QuIP# exist too, but accuracy loss is large so they're mostly special-purpose. The calculator doesn't cover them.",
      "how.quant.li8": "<b>Note</b>: the tok/s gains above are based on <b>memory savings</b>. NVFP4/MXFP4 accelerate compute only <b>with FP4 tensor cores</b> (otherwise memory gains only); INT4 needs optimized kernels like Marlin. The calculator treats KV cache as FP16, but in practice it can also be reduced to FP8/INT8.",
      "footer": "100% client-side · <a href=\"https://github.com/sylvanus4/llm-selfhost-calculator\">GitHub</a> · MIT · a vendor-independent tool. Figures are estimates from public information.",
      "dyn.own.needkwh": "Enter electricity price ($/kWh) to compute payback months.",
      "dyn.own.needcapex": "This device has no public purchase price or power figure — enter a <b>price override</b> on the left to compute payback months.{n}",
      "dyn.own.needN": " (this model needs {N} units)",
      "dyn.own.capex": "Hardware capex",
      "dyn.own.elec": "Monthly electricity",
      "dyn.own.apicost": "Monthly API cost (replaced)",
      "dyn.own.netsave": "Monthly net saving (API − electricity)",
      "dyn.own.oversub": "⚠️ This throughput needs {h} GPU-h/mo (&gt;730h/mo) — you can't actually produce this volume. Add GPUs or lower monthly tokens.",
      "dyn.own.recovers": "At this token volume it pays back the purchase in about <b>{pb} months</b>{warn}. Assumes you keep the GPU this busy.",
      "dyn.own.recovers.warn": " — but at <b>5yr+</b> it may not pay off before depreciation/failure",
      "dyn.own.norecover": "At this token volume, <b>electricity ≥ the API cost it replaces</b>, so self-hosting is actually more expensive and <b>never pays back</b>. Raise monthly tokens or get cheaper power/hardware.",
      "dyn.chart.aria": "cumulative cost curve",
      "dyn.chart.buycum": "Buy cumulative (capex + electricity)",
      "dyn.chart.apicum": "API cumulative",
      "dyn.chart.cross": "┊ crosses at {pb} mo",
      "dyn.chart.outside": "{pb} mo (outside 36-mo window)",
      "dyn.mtok": "{v}B tok/mo",
      "dyn.fit.single": "✅ Fits on 1× {gpu}",
      "dyn.fit.multi": "🔀 Needs <b>{n}×</b> {gpu} (tensor parallel)",
      "dyn.vram.line": "Weights <b>{w}GB</b> + KV <b>{kv}GB</b> (@{ctx} tok) + overhead <b>{o}GB</b> = <b>{tot}GB</b>",
      "dyn.vram.multi": " → <b>{n}×</b> {vram}GB (total {total}GB)",
      "dyn.vram.single": " / {vram}GB",
      "dyn.vram.maxctx": "Max context at batch=1 for this config: <b>{tok} tok</b>{suffix}",
      "dyn.vram.maxctx.head": " (headroom to model max)",
      "dyn.vram.maxctx.over": " (longer exceeds VRAM)",
      "dyn.vram.weightsover": "Weights already exceed VRAM — context 0",
      "dyn.tokS.stream": "single stream",
      "dyn.tokS.nnote": " · {n}-GPU aggregate bandwidth",
      "dyn.tokS.serving": "serving total (batch {b}, max VRAM headroom {m})",
      "dyn.cost.owned.apple": "an owned Apple device",
      "dyn.cost.owned.npu": "an on-prem NPU",
      "dyn.cost.owned.gen": "an owned/on-prem device",
      "dyn.cost.owned": "This is {kind} — with no hourly rent, compare electricity instead of an API break-even. Use the tok/s and fit above.{n}",
      "dyn.cost.ownedN": " This model needs {N} of these devices.",
      "dyn.cost.selfrate": "Self-host estimated rate",
      "dyn.cost.apirate": "Selected API price",
      "dyn.cost.needtput": "Throughput needed to beat the API",
      "dyn.cost.needtput.cur": "(currently est. {v})",
      "dyn.cost.cheaper": "At this utilization, <b>self-hosting is cheaper</b> — but only if you keep {n}the GPU busy.",
      "dyn.cost.cheaperN": "the {N} GPUs ",
      "dyn.cost.apicheaper": "At this utilization, <b>the API is cheaper</b>. Self-hosting only wins if you sustain more than {v} tok/s.",
      "dyn.moenote": " · MoE: memory holds all {t}B, but decode uses only the active {a}B → faster tok/s.",
      "dyn.ctxover": " ⚠️ Selected context exceeds the model max ({m})",
      "dyn.rd.model": "Model",
      "dyn.rd.arch": "Architecture",
      "dyn.rd.hardware": "Hardware",
      "dyn.rd.base": "Target {engine}",
      "dyn.rd.min": " · min v{v}",
      "dyn.rd.vramnote.vllm": "Arbitrary HF model — param count unknown, so VRAM auto-sizing / TP calc is skipped (TP=1 default, adjust directly in the manifest).",
      "dyn.rd.vramnote.engine": "Arbitrary HF model — param count unknown, so TP=1 default (adjust directly in the manifest).",
      "dyn.rd.whatif.vllm": "⚠️ <code>--quantization</code> is valid only if a matching quantized checkpoint actually exists. The calculator's quant choice is a VRAM \"what-if\"; vLLM must match the real on-disk weight format.",
      "dyn.rd.whatif.engine": "⚠️ The quant flag is valid only if a matching quantized checkpoint actually exists — the calculator's quant choice is a VRAM \"what-if\".",
      "dyn.rd.incompatible": "This hardware can't run {engine}, so no serve command is generated.",
      "dyn.spark.denseapprox": "dense [approx]",
      "dyn.spark.node": "Node {i}",
      "dyn.spark.noprune": "no pruning · {n} experts",
      "dyn.spark.reap.dense": "dense model — REAP not applicable",
      "dyn.spark.reap.warn": "⚠️ >30% pruning may degrade quality (Cerebras: ~97% retained at 50%)",
      "dyn.spark.fit": "✅ Fits on {n}× {gpu}",
      "dyn.spark.nofit": "⚠️ Doesn't fit on {n}× — more nodes / lower quant / more REAP",
      "dyn.spark.memtitle": "Per-node memory — {n}× · {mode} · {ctx} ctx",
      "dyn.spark.ctxfits": "Max context for this config <b>~{k}K tok</b> <span class=\"dim\">(currently {cur})</span>",
      "dyn.spark.ctxover": "Weights exceed usable — context 0",
      "dyn.copied": "copied",
      "dyn.copyfail": "copy failed — select the code manually",
      "dyn.hf.badurl": "Couldn't parse the URL/ID. e.g. <code>Qwen/Qwen3-8B</code>",
      "dyn.hf.curated": "✅ Curated model <b>{name}</b> — using offline verdict (no external request)",
      "dyn.hf.notcurated": "<b>{ref}</b> — not in the curated list. Use the button below to request <code>config.json</code> from HF for a vLLM verdict. <span class=\"warn\">(external network request)</span>",
      "dyn.hf.loading": "loading config.json…",
      "dyn.hf.loaded": "✅ <b>{ref}</b> config loaded — see the <b>vLLM readiness</b> tab on the right.",
      "dyn.hf.loadfail": "Load failed ({msg}). May be a gated/private model, CORS, or offline. Use the curated dropdown.",
      "dyn.err.load": "Couldn't load data. Locally, run with <code>python3 -m http.server</code> (file:// blocks fetch). Works on GitHub Pages.",
    },
  };

  // Korean-source -> English for strings that live in the data files (translated at render).
  const DATA = {
    // --- data/models.json: qwen3.8-2.4t-a95b ---
    "하이브리드 Gated DeltaNet(선형)/Gated Attention 4:1 교차 — 92층 중 풀어텐션(KV 보유) 23개 층만, 나머지 69층은 선형어텐션(RNN형 고정 상태) · MoE(512 전문가 중 top-10 라우팅 + 공유 1, 2.4T 중 95B active — 모델명 공식 표기 기준) · 262,144 컨텍스트(최대 1,010,000 확장 가능) · 텍스트 전용(멀티모달 미지원) · 항상 사고 모드(reasoning 비활성화 불가, reasoning_effort 파라미터로 강도 조절) · Qwen3.8-Max License(MAU/매출 임계 조건부 상업 라이선스, 조건 확인 필요)":
      "Hybrid Gated DeltaNet (linear)/Gated Attention in a 4:1 interleave — only 23 of 92 layers run full attention and carry KV, the other 69 run linear attention with a constant recurrent state · MoE (top-10 of 512 experts + 1 shared, 95B active of 2.4T — per the model's official naming) · 262,144 context (extensible up to 1,010,000) · text-only (no multimodal) · thinking mode always on (reasoning cannot be disabled; strength tunable via reasoning_effort) · Qwen3.8-Max License (conditional commercial license with MAU/revenue thresholds — check terms)",
    "네이티브 목록 미등록 → Transformers 백엔드(--model-impl transformers)로 near-native 시도":
      "Not on the native list → attempted near-native via the Transformers backend (--model-impl transformers)",
    "Qwen3_5MoeForCausalLM — 엔진 레지스트리 미등록, 지원 확인/실측 필요":
      "Qwen3_5MoeForCausalLM — not registered in the engine's architecture list, support unconfirmed/needs a real test",

    // --- data/models.json: qwen3.8-27b ---
    "하이브리드 Gated DeltaNet(선형)/Gated Attention 4:1 교차 — 64층 중 풀어텐션(KV 보유) 16개 층만, 나머지 48층은 선형어텐션(RNN형 고정 상태) · 네이티브 비전-언어(이미지·비디오) 멀티모달 · 262,144 컨텍스트(최대 1M 확장 가능)":
      "Hybrid Gated DeltaNet (linear)/Gated Attention in a 4:1 interleave — only 16 of 64 layers run full attention and carry KV, the other 48 run linear attention with a constant recurrent state · native vision-language (image/video) multimodal · 262,144 context (extensible up to 1M)",
    "하이브리드 GDN(Gated DeltaNet) 아키텍처 — vLLM 0.17+에서 자체 Qwen3_5Config로 네이티브 파싱(FlashInfer/CuTeDSL GDN 커널), 최신 버전 권장":
      "Hybrid GDN (Gated DeltaNet) architecture — natively parsed via vLLM's own Qwen3_5Config since 0.17+ (FlashInfer/CuTeDSL GDN kernels); a recent version is recommended",
    "하이브리드 GDN(Gated DeltaNet) — SGLang v0.5.13+ FlashInfer GDN/CuTeDSL 커널로 지원, 상대적으로 신규 경로라 최신 빌드 권장(--mamba-radix-cache-strategy v2 NVIDIA 권장)":
      "Hybrid GDN (Gated DeltaNet) — supported via SGLang v0.5.13+ FlashInfer GDN/CuTeDSL kernels; a relatively new path, so a recent build is recommended (--mamba-radix-cache-strategy v2 recommended on NVIDIA)",
    // --- data/speech-models.json + data/serving-support.json ---
    "TensorRT 저장소의 demo/Diffusion 경로(TensorRT-LLM이 아님) — SDXL·SDXL Turbo가 명시적으로 등재돼 있습니다.":
      "The demo/Diffusion path in the TensorRT repo (not TensorRT-LLM) — SDXL and SDXL Turbo are listed explicitly.",
    "엔진을 미리 빌드하는 방식이라 해상도와 배치 크기가 엔진에 고정됩니다(--build-static-batch). 설정을 바꾸면 몇 분짜리 재빌드가 필요합니다.":
      "Engines are pre-built, so resolution and batch size are baked into the engine (--build-static-batch). Changing either means a multi-minute rebuild.",
    "model_index.json의 _diffusers_version이 0.37.0.dev0으로 찍혀 있지만 이건 저장 당시 버전이지 최소 요구가 아닙니다 — 실측에서 diffusers 0.39 정식 릴리스로 로드됐습니다. .dev 표기만 보고 git main을 설치하다 기존 diffusers를 깨뜨린 사고가 있었으니 판정은 hasattr(diffusers,'Flux2KleinPipeline')로 하세요.":
      "model_index.json records _diffusers_version 0.37.0.dev0, but that is the version it was SAVED with, not a minimum requirement — measured, it loads on the diffusers 0.39 stable release. Installing git main because of a .dev tag once broke an existing diffusers install here, so test with hasattr(diffusers,'Flux2KleinPipeline') instead.",
    "prompt를 반드시 키워드 인자로 넘겨야 합니다 — 첫 위치 인자가 prompt가 아니라서 포지셔널로 주면 전부 'Provide either prompt or prompt_embeds'로 죽습니다.":
      "Pass prompt as a keyword argument — its first positional parameter is not prompt, so positional calls all die with 'Provide either prompt or prompt_embeds'.",
    "TensorRT-LLM VisualGen이 FLUX.2 계열을 다루지만 지원 체크포인트 표에 FLUX.2-dev만 있고 klein-4B(증류 소형판)는 이름이 없습니다 — 실측 확인 필요.":
      "TensorRT-LLM VisualGen covers the FLUX.2 family, but its supported-checkpoint table names only FLUX.2-dev; the distilled klein-4B is absent — needs verifying.",
    "TensorRT 저장소의 demo/Diffusion은 FLUX.1 계열만 지원해 FLUX.2는 대상이 아닙니다.":
      "The TensorRT repo's demo/Diffusion covers only the FLUX.1 family, so FLUX.2 is out of scope there.",
    "_diffusers_version이 0.36.0.dev0이지만 0.39 정식 릴리스에서 동작합니다(실측).":
      "_diffusers_version says 0.36.0.dev0, but it runs on the 0.39 stable release (measured).",
    "TensorRT-LLM VisualGen 표에도, TensorRT demo/Diffusion 목록에도 없습니다.":
      "Absent from both the TensorRT-LLM VisualGen table and the TensorRT demo/Diffusion list.",
    "TensorRT-LLM VisualGen 지원 체크포인트 표에 정확한 이름으로 등재돼 있고 trtllm-serve의 /v1/images/generations로 서빙됩니다.":
      "Listed by exact name in the TensorRT-LLM VisualGen supported-checkpoint table and served through trtllm-serve's /v1/images/generations.",
    "VisualGen은 2026-02 도입된 베타라 API와 지원 목록이 계속 바뀐다고 문서에 명시돼 있습니다.":
      "VisualGen is a beta introduced in 2026-02; the docs state its API and supported list are still changing.",
    "vLLM-Omni 표에는 Qwen/Qwen-Image-Edit로 등재돼 있고 우리가 쓰는 2511 리비전은 이름이 다릅니다 — 같은 계열이라 동작할 가능성이 높지만 확인이 필요합니다.":
      "The vLLM-Omni table lists Qwen/Qwen-Image-Edit, whereas we run the 2511 revision under a different name — same family, so it will most likely work, but it needs confirming.",
    "MoE라 transformer(high-noise)와 transformer_2(low-noise)를 모두 로드하고 boundary_ratio로 전환합니다 — diffusers 0.35 이상이 필요합니다.":
      "Being MoE, it loads both transformer (high-noise) and transformer_2 (low-noise) and switches on boundary_ratio — diffusers 0.35 or newer is required.",
    "TensorRT-LLM VisualGen 표에 Diffusers 리비전 이름으로 등재돼 있습니다.":
      "Listed in the TensorRT-LLM VisualGen table under its Diffusers revision name.",
    "TensorRT demo/Diffusion에도 Wan 2.2가 있지만 이쪽은 엔진 빌드 방식이고 T2V·I2V 구분이 문서에 드러나지 않습니다.":
      "TensorRT demo/Diffusion also carries Wan 2.2, but that is the engine-build path and the docs do not separate T2V from I2V.",
    "TensorRT demo/Diffusion 목록은 Wan 2.2를 통칭할 뿐 I2V 변형을 따로 명시하지 않아 그 경로는 미확인입니다.":
      "The TensorRT demo/Diffusion list names Wan 2.2 generically without calling out the I2V variant, so that path is unverified.",
    "모델 카드가 diffusers 지원을 'coming soon'으로 적어두고 있어 현재 정본 경로는 Lightricks/LTX-2 저장소의 CLI입니다. ThakiCloud 실측도 이 경로로 돌렸습니다.":
      "The model card marks diffusers support as 'coming soon', so the canonical path today is the CLI in the Lightricks/LTX-2 repo. ThakiCloud's own measurement used that path.",
    "텍스트 인코더로 gemma-3-12b-it를 따로 받아야 합니다 — 체크포인트에 포함돼 있지 않습니다.":
      "You must download gemma-3-12b-it separately as the text encoder — it is not bundled in the checkpoint.",
    "vLLM-Omni는 diffusers 포맷으로 변환된 diffusers/LTX-2.3-Diffusers를 등재하고 있습니다. 우리가 스테이징한 것은 Lightricks/LTX-2.3의 단일 파일 체크포인트라 저장 포맷이 다릅니다 — 변환본을 받아야 합니다.":
      "vLLM-Omni lists diffusers/LTX-2.3-Diffusers, a format-converted repo. What we staged is the single-file checkpoint from Lightricks/LTX-2.3, which is a different layout — you need the converted build.",
    "VisualGen 표에 'Lightricks/LTX-2'가 통칭으로 올라 있고 Gemma3 텍스트 인코더와 BF16/FP8/FP4를 명시하지만, 2.3 포인트 릴리스는 이름이 없어 버전 동등성은 미확인입니다.":
      "The VisualGen table carries 'Lightricks/LTX-2' generically and specifies a Gemma3 text encoder with BF16/FP8/FP4, but the 2.3 point release is not named, so version parity is unverified.",
    "model_index.json 기준 파이프라인은 MiniMaxH3ModularPipeline이고 transformer_ref(참조 조건화용 두 번째 DiT)까지 포함합니다 — 두 트랜스포머를 모두 올리면 상주 메모리가 더 늘어납니다.":
      "Per model_index.json the pipeline is MiniMaxH3ModularPipeline and it includes transformer_ref, a second DiT for reference conditioning — loading both transformers raises resident memory further.",
    "vLLM-Omni 표에서 NVIDIA 백엔드만 지원으로 표시돼 있습니다(AMD·Ascend·Intel 미표기).":
      "The vLLM-Omni table marks only the NVIDIA backend as supported (AMD, Ascend and Intel are not listed).",
    "TensorRT-LLM VisualGen과 TensorRT demo/Diffusion 어디에도 없습니다. 벤더 문서는 SGLang·vLLM-Omni·ComfyUI를 권장합니다.":
      "Absent from both TensorRT-LLM VisualGen and TensorRT demo/Diffusion. The vendor's own docs point to SGLang, vLLM-Omni and ComfyUI.",
    "vLLM 코어의 /v1/audio/transcriptions로 서빙됩니다 — ThakiCloud가 이 경로로 실측했고 동시성 8에서 실시간 124배가 나왔습니다.":
      "Served through vLLM core's /v1/audio/transcriptions — this is the path ThakiCloud measured, reaching 124x realtime at concurrency 8.",
    "TensorRT-LLM에도 TensorRT-Edge-LLM에도 등재돼 있지 않습니다.":
      "Listed in neither TensorRT-LLM nor TensorRT-Edge-LLM.",
    "순수 transformers로는 오디오 함수처럼 못 씁니다 — 프로세서가 text 인자를 필수로 요구하는 멀티모달 챗 인터페이스입니다.":
      "You cannot call it like an audio function from plain transformers — the processor requires a text argument, making it a multimodal chat interface.",
    "반드시 -hf 빌드 + transformers 5.14 이상이어야 합니다. 이미지 기본값 5.12.1은 model type qwen3_asr를 모릅니다(에러 메시지가 체크포인트 탓처럼 나와 원인을 헷갈리게 합니다).":
      "It requires the -hf build plus transformers 5.14 or newer. The image default of 5.12.1 does not know model type qwen3_asr (and the error blames the checkpoint, which misdirects the diagnosis).",
    "vLLM 코어 레지스트리에 등재된 ASR이고 ThakiCloud 실측 경로입니다(1.7B 기준 동시성 8에서 실시간 68.7배).":
      "Registered as an ASR in the vLLM core registry and the path ThakiCloud measured (68.7x realtime at concurrency 8 for the 1.7B).",
    "메인라인 TensorRT-LLM이 아니라 별도 저장소인 NVIDIA/TensorRT-Edge-LLM(Jetson·DRIVE 대상)에 Qwen3-ASR 1.7B가 등재돼 있습니다 — 코드베이스가 다르므로 데이터센터 GPU 서빙 근거로 쓸 수 없습니다.":
      "Not mainline TensorRT-LLM: Qwen3-ASR 1.7B appears in the separate NVIDIA/TensorRT-Edge-LLM repo (Jetson/DRIVE). That is a different codebase and cannot be cited as data-centre GPU support.",
    "메인라인 TensorRT-LLM이 아니라 별도 저장소인 NVIDIA/TensorRT-Edge-LLM(Jetson·DRIVE 대상)에 Qwen3-ASR 0.6B가 등재돼 있습니다 — 코드베이스가 다르므로 데이터센터 GPU 서빙 근거로 쓸 수 없습니다.":
      "Not mainline TensorRT-LLM: Qwen3-ASR 0.6B appears in the separate NVIDIA/TensorRT-Edge-LLM repo (Jetson/DRIVE). That is a different codebase and cannot be cited as data-centre GPU support.",
    "trust_remote_code=True가 필요한 custom_code 모델입니다.":
      "A custom_code model requiring trust_remote_code=True.",
    "TensorRT-LLM에 전용 예제가 있습니다(convert_checkpoint.py → trtllm-build → run.py). 이 목록에서 세 엔진 모두에서 도는 유일한 음성 모델입니다.":
      "TensorRT-LLM ships a dedicated example (convert_checkpoint.py to trtllm-build to run.py). It is the only speech model here that runs on all three engines.",
    "RNN-T 아키텍처라 vLLM이 서빙하지 못합니다(inputs_embeds 계약 불일치).":
      "vLLM cannot serve it: the RNN-T architecture does not match the inputs_embeds contract.",
    "전용 패키지 voxcpm으로 스톡 이미지에서 그대로 돕니다 — 이 목록에서 격리 venv가 필요 없는 유일한 TTS입니다.":
      "Runs as-is on the stock image through its own voxcpm package — the only TTS here that needs no isolated venv.",
    "torch.compile로 1.27배 빨라집니다(실측).":
      "torch.compile makes it 1.27x faster (measured).",
    "vLLM-Omni가 등재한 것은 VoxCPM2이고 우리가 쓰는 것은 VoxCPM1.5입니다 — 세대가 달라 그대로 적용된다고 볼 수 없습니다.":
      "What vLLM-Omni lists is VoxCPM2, while we run VoxCPM1.5 — a different generation, so support does not carry over unchanged.",
    "의존성이 torch 2.6을 핀하고 transformers 5.x에서 LlamaModel import가 깨져 격리 venv가 필수입니다. numpy·pkuseg 휠도 계단식으로 막혀 constraints 파일로 재해결을 막아야 합니다.":
      "Its dependencies pin torch 2.6 and its LlamaModel import breaks on transformers 5.x, so an isolated venv is mandatory. numpy and pkuseg wheels then block in cascade, so pin a constraints file to stop re-resolution.",
    "실측 RTF 1.277로 실시간에 못 미칩니다.":
      "Measured RTF 1.277 — slower than realtime.",
    "vLLM 코어에도 vLLM-Omni 지원 목록에도 없습니다.":
      "Present in neither vLLM core nor the vLLM-Omni supported list.",
    "82M이라 CPU에서도 실용적입니다.":
      "At 82M it is practical even on CPU.",
    "vLLM-Omni 지원 목록에 없습니다.":
      "Not in the vLLM-Omni supported list.",
    "funasr가 아니라 cosyvoice 패키지이고, 벤더 저장소를 tarball로 받아야 합니다(잡 이미지에 git이 없음).":
      "The package is cosyvoice, not funasr, and the vendor repo has to be fetched as a tarball (the job image has no git).",
    "메인라인이 아닌 NVIDIA/TensorRT-Edge-LLM에 Qwen3-TTS-12Hz-0.6B/1.7B-CustomVoice가 등재돼 있습니다 — 엣지 대상의 별도 코드베이스입니다.":
      "Qwen3-TTS-12Hz-0.6B/1.7B-CustomVoice appears in NVIDIA/TensorRT-Edge-LLM rather than mainline — a separate, edge-targeted codebase.",
    "diffusers와 transformers 모두 HTTP 서버를 내장하지 않습니다 — 직접 FastAPI 등으로 감싸거나 아래 엔진을 쓰세요.":
      "Neither diffusers nor transformers bundles an HTTP server — wrap it yourself, or use one of the engines below.",
    "VisualGen은 2026-02 도입된 베타로 API와 지원 목록이 계속 바뀝니다. demo/Diffusion은 엔진을 미리 빌드해 해상도·배치가 고정됩니다.":
      "VisualGen is a beta introduced in 2026-02 and its API and supported list keep changing. demo/Diffusion pre-builds engines, so resolution and batch are fixed.",
    "TensorRT-Edge-LLM (별도 저장소)":
      "TensorRT-Edge-LLM (separate repo)",
    "TensorRT-LLM whisper 예제":
      "TensorRT-LLM whisper example",
    "실측한 STT 중 정확도와 속도 모두 1위입니다(WER 0.82%, 동시성 8에서 0.37%). 이름은 1B이지만 음성 인코더까지 합쳐 실제 2.32B이고 bf16 상주 약 5GB라 어떤 최신 GPU에도 여유롭게 들어갑니다. vLLM이 네이티브로 서빙하고, 동시성을 1에서 8로 올리면 실시간 대비 37.9배에서 124배로 뜁니다 — 디퓨전과 달리 음성은 배칭이 실제로 듣습니다.":
      "Fastest AND most accurate of the STT models we benchmarked (WER 0.82%, and 0.37% at concurrency 8). Despite the 1B in its name it is really 2.32B once the speech encoder is counted, and about 5GB resident at bf16 — comfortable on any current GPU. vLLM serves it natively, and raising concurrency from 1 to 8 takes it from 37.9x to 124x realtime: unlike diffusion, speech genuinely benefits from batching.",
    "52개 언어를 지원하는 다국어 STT로, 한국어를 포함한 비영어 작업의 기본 선택지입니다. 영어 LibriSpeech에서는 Granite보다 느리고(17.7배 대 37.9배) WER도 높지만(1.24% 대 0.82%) 언어 커버리지가 훨씬 넓습니다. ⚠️ 순수 transformers로는 굴러가지 않습니다 — 프로세서가 text 인자를 필수로 요구하는 멀티모달 챗 인터페이스라 오디오 함수처럼 호출할 수 없고, 반드시 `-hf` 빌드 + transformers 5.14 이상이 필요합니다. 실서빙 경로는 vLLM입니다.":
      "A multilingual STT covering 52 languages, making it the default choice for non-English work including Korean. On English LibriSpeech it is slower than Granite (17.7x vs 37.9x) with a higher WER (1.24% vs 0.82%), but its language coverage is far wider. ⚠️ It does not run under plain transformers — the processor requires a text argument, so it is a multimodal chat interface rather than an audio function, and it needs the -hf build with transformers 5.14+. The real serving path is vLLM.",
    "1.7B와 같은 아키텍처의 소형 버전으로 bf16 상주 약 2GB입니다. 엣지나 다중 인스턴스 배치에 적합합니다. 자체 측정은 1.7B만 했으므로 속도는 같은 계열에서 파라미터 비율로 환산한 값이고, 정확도는 상위 모델보다 낮을 것으로 보아야 합니다(미측정).":
      "The small sibling of the 1.7B on the same architecture, about 2GB resident at bf16. Suited to edge deployment or packing many instances per device. We only benchmarked the 1.7B, so the speed here is scaled from that within the family by parameter ratio, and accuracy should be assumed lower than the larger model (unmeasured).",
    "vLLM 레지스트리에 등재된 ASR이라 서빙 경로는 열려 있습니다. ⚠️ gated 저장소라 인제스트 시 19개 파일 중 18개가 403으로 실패했는데도 워커는 성공으로 끝났고, 빈 prefix를 가리키는 카탈로그 행이 만들어진 적이 있습니다 — 라이선스 동의는 토큰을 소유한 계정에 붙으므로 실제 파일에 HEAD를 던져 확인해야 합니다. 자체 속도·정확도 측정치는 없습니다.":
      "An ASR registered in the vLLM registry, so the serving path is open. ⚠️ It is a gated repo: during ingest 18 of 19 files failed with 403 while the worker still reported success, producing a catalog row pointing at an empty prefix. Licence acceptance binds to the account holding the token, so verify by sending a HEAD to an actual weight file. We have no speed or accuracy measurement of our own.",
    "100개 이상 언어를 다루는 인코더-디코더 STT의 사실상 정확도 기준선입니다. 이 목록에서 가장 오래됐지만 여전히 가장 널리 배포돼 있고, vLLM·TensorRT-LLM·transformers 어디서나 도는 유일한 모델이라 서빙 경로 선택지가 가장 넓습니다. ThakiCloud 레지스트리에는 스테이징돼 있지 않아 자체 측정치가 없습니다.":
      "The de-facto accuracy baseline for encoder-decoder STT across 100+ languages. It is the oldest model here yet still the most widely deployed, and the only one that runs on transformers, vLLM and TensorRT-LLM alike — so it has the widest choice of serving paths. It is not staged in the ThakiCloud registry, so we have no measurement of our own.",
    "large-v3에서 디코더 층을 32개에서 4개로 줄여 훨씬 빠르면서 정확도 손실은 작은 버전입니다. 실시간 전사에서 가장 흔한 기본값이며 bf16 상주 2GB 미만이라 소형 카드에도 들어갑니다. 자체 측정치는 없습니다.":
      "large-v3 with the decoder cut from 32 layers to 4 — much faster for a small accuracy cost. It is the most common default for realtime transcription and sits under 2GB resident at bf16, so it fits small cards. No measurement of our own.",
    "실측한 TTS 중 압도적으로 빠릅니다 — RTF 0.028, 즉 실시간의 36배로 합성합니다. 1분짜리 음성을 1.7초에 만듭니다. bf16 상주 2GB로 가볍고 스톡 이미지에서 그대로 돌아가는 유일한 TTS이기도 합니다. torch.compile로 1.27배 더 빨라집니다. ⚠️ 초판 측정에서 웜업을 빼지 않아 RTF를 4.49(실시간 0.2배)로 잘못 보고했다가 0.028로 정정한 이력이 있습니다 — 160배 오차였습니다.":
      "By far the fastest TTS we measured — RTF 0.028, meaning it synthesises at 36x realtime and produces a minute of speech in 1.7 seconds. It is also light at 2GB resident and the only TTS here that runs on the stock image unmodified. torch.compile adds another 1.27x. ⚠️ Our first measurement failed to exclude warm-up and reported RTF 4.49 (0.2x realtime) before being corrected to 0.028 — a 160x error.",
    "23개 이상 언어와 감정 제어, zero-shot 클로닝을 지원하지만 ⚠️ 실시간에 못 미칩니다(RTF 1.277 = 실시간의 0.78배). 1분 음성을 만드는 데 77초가 걸립니다. 이 목록에서 가장 작은 축인데 가장 느리다는 점이 중요합니다 — 작은 모델을 고르는 것과 실시간 합성을 얻는 것은 별개입니다. 의존성이 torch 2.6을 핀하고 transformers 5.x에서 LlamaModel import가 깨져 격리 venv가 필수입니다.":
      "Supports 23+ languages with emotion control and zero-shot cloning, but ⚠️ it does not reach realtime (RTF 1.277 = 0.78x realtime), taking 77 seconds to produce a minute of speech. The important point is that the smallest model here is also the slowest — picking a small model and getting realtime synthesis are different things. Its dependencies pin torch 2.6 and its LlamaModel import breaks on transformers 5.x, so an isolated venv is mandatory.",
    "82M짜리 초경량 TTS로 엣지·CPU 배포에서 가장 인기 있는 선택지입니다. 상주 메모리가 1GB 미만이라 GPU 없이도 실용적입니다. ThakiCloud 레지스트리에 스테이징돼 있지 않아 자체 측정치는 없고, 속도는 파라미터 기반 추정입니다.":
      "An ultra-light 82M TTS and the most popular choice for edge and CPU deployment, under 1GB resident and practical without a GPU. It is not staged in the ThakiCloud registry, so we have no measurement and the speed is a parameter-based estimate.",
    // --- data/media-models.json (image + video generation) ---
    "라이선스가 유럽연합·영국·대한민국·미국을 Excluded Territory로 지정하고, 해당 지역에서는 상업 이용뿐 아니라 사용·복제·수정·배포·전시 전부를 금지합니다(제V.4조). 별도 라이선스를 신청하면 승인받을 수 있습니다. ThakiCloud는 이 조항 때문에 스테이징했던 가중치를 삭제했습니다 — 아래 수치는 라이선스가 허용되는 지역에서의 도입 검토용입니다.":
      "The licence names the European Union, the United Kingdom, the Republic of Korea and the United States as Excluded Territories, and in those regions it forbids not just commercial use but use, reproduction, modification, distribution and display outright (Section V.4). A separate licence can be applied for and granted. ThakiCloud deleted its staged weights because of this clause — the figures below are for evaluating deployment where the licence permits it.",
    "오디오까지 함께 만드는 옴니모달 DiT(50블록·hidden 5376, patch 1x2x2). HF 인덱스 실측으로 트랜스포머 66.28GB=33.14B, 텍스트 인코더 Qwen3-VL 66.71GB=33.36B — 둘을 합치면 bf16 상주 가중치만 약 134GB라 H200 두 장 또는 GB200급이 필요합니다. VisualVAE는 공간 16배·시간 4배 압축에 latent 24채널, 768p 기준 4~15초·24fps. 스텝 수와 CFG는 모델 카드에 공개되지 않아 같은 계열 관행값(40스텝·CFG)을 가정했으므로 속도는 추정값입니다.":
      "An omni-modal DiT (50 blocks, hidden 5376, patch 1x2x2) that generates audio alongside video. Measured from the HF index: the transformer is 66.28GB = 33.14B and the Qwen3-VL text encoder 66.71GB = 33.36B, so bf16 resident weights alone come to about 134GB — two H200s or a GB200-class device. The VisualVAE compresses 16x spatially and 4x temporally with 24 latent channels; 4-15s at 768p, 24fps. Step count and CFG are not published on the model card, so we assume the usual values for this family (40 steps, CFG on) and the speed is therefore an estimate.",
    "옴니모달(텍스트·이미지·비디오·오디오) 33B DiT. 768p 기준 4~15초, 24fps. ⛔ 국내 사용 금지 대상이라 VRAM·속도·비용을 계산하지 않습니다 — 라이선스가 허용되는 지역에서만 검토하세요. 아키텍처 세부(스텝 수·CFG·VAE 압축률)는 모델 카드에 공개되지 않아 미검증입니다.":
      "Omni-modal (text/image/video/audio) 33B DiT. 4-15s clips at 768p, 24fps. Not calculated: this model is licence-restricted in Korea, so VRAM, speed and cost are withheld — evaluate it only where the licence permits. Architectural details (step count, CFG, VAE compression) are not published on the model card and remain unverified.",
    "라이선스가 대한민국을 Excluded Territory로 지정합니다 — 국내 상업 이용 불가. ThakiCloud는 이 판정에 따라 스테이징한 가중치를 삭제했고, 카탈로그 항목만 이력으로 남아 있습니다.":
      "The licence names the Republic of Korea an Excluded Territory, so commercial use here is not permitted. ThakiCloud deleted the staged weights on that basis; only the catalog entry remains as a record.",
    "오디오까지 한 모델에서 같이 생성하는 DiT(48블록·hidden 4096). 체크포인트 단일 파일 23.07B = DiT 21.0B + VAE·보코더·투영 2.07B이고, 텍스트 인코더는 별도 gemma-3-12b-it(약 12.2B)가 필수라 실제 상주 가중치는 그 둘의 합입니다. 배포판은 8스텝·CFG 미사용 distilled 버전. 가로세로는 32의 배수, 프레임 수는 8의 배수+1이어야 합니다. 측정값은 B200 1클립 약 12초로 대략치이며 스텝 수 외 조건이 기록되지 않았습니다.":
      "A DiT (48 blocks, hidden 4096) that generates synchronised audio alongside the video. The single-file checkpoint totals 23.07B = 21.0B DiT + 2.07B VAE/vocoder/projection, and a separate gemma-3-12b-it text encoder (about 12.2B) is mandatory, so resident weights are the sum of both. The shipped build is the 8-step, CFG-free distilled version. Width and height must be multiples of 32 and the frame count a multiple of 8 plus 1. The measurement is an approximate 12s per clip on a B200; no conditions beyond step count were recorded.",
    "전문가 2개(high-noise·low-noise)를 노이즈 구간으로 갈아 끼우는 MoE라 한 스텝에는 14.3B만 계산에 쓰이지만, 전환 비용을 피하려면 28.6B 양쪽을 모두 VRAM에 올려둡니다. 텍스트 인코더 UMT5-XXL 5.68B가 별도로 붙습니다. 디스크 가중치는 fp32(117.5 GiB)로 배포되지만 서빙은 bf16 기준입니다. 프레임 수는 4의 배수+1(81 ≈ 16fps에서 5.06초). 자체 지연 측정치가 없어 속도는 추정값입니다.":
      "An MoE that swaps between two experts (high-noise and low-noise) by noise band, so only 14.3B is used per step — but you keep all 28.6B resident to avoid the swap cost. A UMT5-XXL text encoder (5.68B) sits on top. Weights ship as fp32 on disk (117.5 GiB) while serving assumes bf16. Frame count must be a multiple of 4 plus 1 (81 is about 5.06s at 16fps). We have no latency measurement of our own, so the speed here is an estimate.",
    "T2V와 같은 MoE 백본에 입력 이미지 조건화가 붙은 image-to-video 버전. 해상도는 입력 이미지 비율을 따라가고 기본 픽셀 예산은 480p급(832x480)입니다. ThakiCloud 실측에서 조건화가 실제로 작동함을 2x2 교차 상관 행렬로 확인했습니다(대각 1.000/0.999 대 비대각 -0.114/-0.119). 자체 지연 측정치가 없어 속도는 추정값입니다.":
      "The image-to-video variant: the same MoE backbone as T2V with input-image conditioning added. Resolution follows the input image's aspect ratio and the default pixel budget is 480p-class (832x480). ThakiCloud verified the conditioning actually takes effect with a 2x2 cross-correlation matrix (diagonal 1.000/0.999 against off-diagonal -0.114/-0.119). We have no latency measurement of our own, so the speed here is an estimate.",
    "DiT 60블록·hidden 3072의 20B 백본에 Qwen2.5-VL 7B(8.29B) 텍스트 인코더가 붙어, 아무것도 양자화하지 않으면 상주 가중치만 57.7GB입니다 — 80GB 한 장에 겨우 들어가는 크기라 텍스트 인코더를 빼먹고 계산하면 어긋납니다. 모델 카드 기본값은 50스텝·true_cfg 4.0이고, 측정은 20스텝·CFG 미사용 조건이었습니다.":
      "A 20B backbone (DiT, 60 blocks, hidden 3072) plus a Qwen2.5-VL 7B (8.29B) text encoder, so resident weights alone are 57.7GB unquantised — only just inside a single 80GB card, which is why sizing that forgets the text encoder comes out wrong. The model card defaults to 50 steps with true_cfg 4.0; our measurement was 20 steps with CFG off.",
    "Qwen-Image와 동일한 20B 백본·인코더를 쓰는 이미지 편집(다중 이미지 합성) 버전이라 VRAM 요구도 같습니다. 출력 해상도는 입력 이미지에 따라 달라지므로 여기 기본값은 계산용 가정치입니다. 기본 40스텝. 자체 지연 측정치가 없어 속도는 같은 계열의 추정값입니다.":
      "An image-editing (multi-image compose) build on the same 20B backbone and encoder as Qwen-Image, so it needs the same VRAM. Output resolution follows the input image, so the default here is a calculation assumption. 40 steps by default. We have no latency measurement of this variant, so speed is scaled from its identical sibling.",
    "한 번의 50스텝 패스로 이미지를 RGBA 레이어 여러 장으로 분해해 내놓는 변형입니다. 레이어 수를 늘려도 패스가 늘지 않으므로 비용은 일반 Qwen-Image와 같은 급으로 봅니다. 백본·인코더가 동일해 VRAM도 같습니다. 자체 지연 측정치가 없어 속도는 추정값입니다.":
      "A variant that decomposes an image into several RGBA layers within a single 50-step pass. Adding layers does not add passes, so cost stays in the same band as ordinary Qwen-Image. The backbone and encoder are identical, so VRAM matches too. We have no latency measurement of this variant, so speed is scaled from its identical sibling.",
    "6B 백본에 Qwen3-4B 텍스트 인코더가 붙어 bf16 상주 20.5GB — 24GB 카드에 들어가는 몇 안 되는 최신 이미지 모델입니다. 8스텝·CFG 미사용 distilled. 흥미로운 실측 결과: 파라미터가 3분의 1인데도 같은 조건에서 Qwen-Image(20B)보다 느립니다(4.02초 대 2.51초). 파라미터 수로 속도를 추정하면 안 된다는 근거라, 이 계산기는 모델별 실측치를 각자의 기준점으로 씁니다.":
      "A 6B backbone with a Qwen3-4B text encoder, 20.5GB resident at bf16 — one of the few current image models that fits a 24GB card. 8 steps, CFG-free, distilled. A notable measured result: despite having a third of the parameters it is SLOWER than Qwen-Image (20B) under identical conditions (4.02s against 2.51s). That is the evidence that parameter count does not predict speed, which is why this calculator anchors each model to its own measurement.",
    "3.9B 백본 + Qwen3-4B 텍스트 인코더로 bf16 상주 16GB, 4스텝·CFG 미사용 distilled이라 이 목록에서 가장 가볍고 가장 빠릅니다. 실측 CLIPScore도 37.44로 가장 높았습니다(프롬프트 준수 기준이며 화질 지표는 아닙니다). 가속 실측: torch.compile 1.50배, fp8 단독은 0.83배로 오히려 손해, fp8+compile이 1.72배(장당 0.699초)입니다 — 양자화만 걸면 느려집니다.":
      "A 3.9B backbone plus a Qwen3-4B text encoder, 16GB resident at bf16, 4 steps and CFG-free distilled — the lightest and fastest entry on this list. It also scored the highest measured CLIPScore at 37.44 (prompt adherence, not an image-quality metric). Measured acceleration: torch.compile 1.50x, fp8 alone 0.83x (a net loss), fp8 with compile 1.72x (0.699s per image) — quantisation on its own makes it slower.",
    "이 목록에서 유일한 UNet 계열(나머지는 전부 DiT)입니다. UNet은 파라미터가 저해상도 블록에 몰려 있어 '모든 latent 토큰에 전체 파라미터를 적용한다'는 DiT용 계산식이 실제보다 10배 이상 부풀립니다. 자체 벤치마크도 없어서 속도는 아예 추정하지 않습니다 — VRAM 적합성만 정확히 계산합니다. 텍스트 인코더 두 개(CLIP-L 0.12B + OpenCLIP bigG 0.69B) 합산 0.82B, bf16 상주 약 6.9GB로 소비자용 카드에서도 여유 있게 돌아갑니다.":
      "The only UNet on this list; everything else is a DiT. A UNet concentrates its parameters in low-resolution blocks, so the DiT formula of 'apply every parameter to every latent token' overstates it by more than 10x. We have no benchmark of our own either, so we do not estimate speed at all and compute VRAM only. Its two text encoders (CLIP-L 0.12B + OpenCLIP bigG 0.69B) total 0.82B, giving about 6.9GB resident at bf16 — comfortable even on consumer cards.",
    "네이티브 하이브리드-리니어 MoE(512 routed top-8 + 공유 1, 124B 중 5.1B active) · 42층=35 KDA(Kimi Delta Attention, 선형/고정상태)+7 Gated MLA 5:1 교차(표시 KV는 MLA 7층만의 보수적 상한, KDA는 KV 없음) · MLA 압축 KV(kv_lora 512+rope 64=576) · config.json 원시 레이어 합산 시 MTP 예측 레이어(num_nextn_predict_layers=1) 포함으로 약 127.5B까지 더 크게 계산됨(모델 카드 공식 수치 124B 사용) · 262,144(256K) 컨텍스트(8K→32K→256K 훈련 스케줄) · reasoning/tool-call 파서 ling3 · SGLang HiCache+Mooncake 계층 캐싱 네이티브 통합(장문 재입력 TTFT 60~80%↓) · Ant Group inclusionAI · MIT · 2026-08-06 공개, HF 트렌딩 상위": "Native hybrid-linear MoE (512 routed top-8 + 1 shared, 5.1B active of 124B) · 42 layers = 35 KDA (Kimi Delta Attention, linear/stateful) + 7 Gated MLA in a 5:1 interleave (shown KV is a conservative upper bound over the 7 MLA layers only; KDA layers carry no KV) · MLA compressed KV (kv_lora 512 + rope 64 = 576) · raw config.json layer sum computes to ~127.5B due to the MTP prediction layer (num_nextn_predict_layers=1); the official model-card figure of 124B is used · 262,144 (256K) context (8K→32K→256K training schedule) · reasoning/tool-call parser ling3 · native SGLang HiCache+Mooncake hierarchical caching integration (60-80% TTFT reduction on long-input re-entry) · Ant Group inclusionAI · MIT · released 2026-08-06, trending near the top on Hugging Face",
    "BailingMoeV3ForCausalLM — 마스터 브랜치 미등록, inclusionAI 자체 포크(github inclusionAI/vllm-ling-v3, ling_3_0 브랜치) --trust-remote-code로 서빙": "BailingMoeV3ForCausalLM — not on vLLM master; served via inclusionAI's own fork (github inclusionAI/vllm-ling-v3, ling_3_0 branch) with --trust-remote-code",
    "BailingMoeV3ForCausalLM — SGLang 마스터 미등록(v0.5.17 arch_support 기준), inclusionAI 공식 dev 이미지(lmsysorg/sglang:dev-Ling-3.0-flash)+쿡북 제공 — --reasoning-parser ling3 --tool-call-parser ling3 --speculative-algorithm NEXTN, 4×80GB급 GPU tp4/tp8": "BailingMoeV3ForCausalLM — not on SGLang master (as of v0.5.17 arch_support); inclusionAI ships an official dev image (lmsysorg/sglang:dev-Ling-3.0-flash) and cookbook — --reasoning-parser ling3 --tool-call-parser ling3 --speculative-algorithm NEXTN, tp4/tp8 on 80GB-class GPUs",
    "BailingMoeV3ForCausalLM — 모델 카드에 TensorRT-LLM 지원 언급 없음, 엔진 레지스트리 미등록": "BailingMoeV3ForCausalLM — no TensorRT-LLM support mentioned on the model card, not registered in the engine registry",
    "SGLang v0.5.17 Day-0 네이티브 지원(KimiK3ForConditionalGeneration) — DCP+DSpark 스펙 디코딩, KDA-aware prefix caching, HiCache L2, --tool-call-parser kimi_k3 --reasoning-parser kimi_k3 · NVIDIA GB300·AMD MI35X 검증": "SGLang v0.5.17 Day-0 native support (KimiK3ForConditionalGeneration) — DCP+DSpark speculative decoding, KDA-aware prefix caching, HiCache L2, --tool-call-parser kimi_k3 --reasoning-parser kimi_k3 · verified on NVIDIA GB300 and AMD MI35X",
    "Day-0 지원 v0.5.17 — DCP+DSpark 스펙 디코딩, chunked-prefill PP+TP 디코드, KDA-aware prefix caching, HiCache L2, 양자화 가중치 위 LoRA · NVIDIA GB300·AMD MI35X 검증": "Day-0 support in v0.5.17 — DCP+DSpark speculative decoding, chunked-prefill PP with TP decode, KDA-aware prefix caching, HiCache L2, LoRA on quantized weights · verified on NVIDIA GB300 and AMD MI35X",
    "MoE(256 experts top-8 + 공유 1, 750B 중 37B active) · GQA 8 KV heads×128(kv_dim=1024) · 78층(full-attention과 sliding-window 어텐션 1:3 반복 패턴) · 262,144 컨텍스트 · 툴콜링 지원 · enable_thinking 기본 on(멀티턴 preserve_thinking 지원) · 한국 독자 AI 파운데이션 모델 프로젝트 2호 · Apache 2.0 · vLLM/SGLang 엔진 레지스트리 네이티브 미등록(LG 자체 서빙 포크 제공, vLLM은 Transformers 백엔드로도 근사 가능)": "MoE (256 experts top-8 + 1 shared, 37B active of 750B) · GQA 8 KV heads×128 (kv_dim=1024) · 78 layers (full-attention and sliding-window attention repeating in a 1:3 pattern) · 262,144 context · tool-calling supported · enable_thinking on by default (preserve_thinking for multi-turn) · the second model under Korea's Independent AI Foundation Model Project · Apache 2.0 · not yet natively registered in the vLLM/SGLang engine registries (LG ships its own serving forks; vLLM can also approximate via the Transformers backend)",
    "ExaoneMoeForCausalLM — 엔진 레지스트리 미등록, 지원 확인/실측 필요": "ExaoneMoeForCausalLM — not registered in the engine registry, support unconfirmed / testing recommended",
    "MoE(256 routed top-8 + 공유 1, 688B 중 33B active) · MLA 압축 KV(kv_lora 512+rope 64=576) · 61층(1 dense+60 MoE) · 262,144 컨텍스트(128K 네이티브+YaRN 2배 확장) · 툴콜링 지원(hermes 파서) · Think-Fusion 가변 추론모드 · FP8(e4m3) 체크포인트 · 한국 독자 AI 파운데이션 모델 프로젝트 · vLLM/SGLang 엔진 레지스트리 네이티브 미등록(SKT 자체 서빙 포크 제공)": "MoE (256 routed top-8 + 1 shared, 33B active of 688B) · MLA compressed KV (kv_lora 512 + rope 64 = 576) · 61 layers (1 dense + 60 MoE) · 262,144 context (128K native, extended 2× via YaRN) · tool-calling supported (hermes parser) · Think-Fusion variable reasoning mode · FP8 (e4m3) checkpoint · under Korea's Independent AI Foundation Model Project · not yet natively registered in the vLLM/SGLang engine registries (SKT ships its own serving fork)",
    "AXK2ForCausalLM — 엔진 레지스트리 미등록, 지원 확인/실측 필요": "AXK2ForCausalLM — not registered in the engine registry, support unconfirmed / testing recommended",
    "MoE(320 routed top-8 + shared 1, 250B 중 15B active) · GQA 8 KV heads×128(kv_dim=1024) · 1M(1,048,576) 컨텍스트 · 한국어·영어·일본어 · OpenAI 호환 툴콜링 · reasoning_effort 가변 추론 · Solar Open 1(102B) 가중치 2.3% 선별 전이로 초기화 · vLLM/SGLang/TensorRT-LLM 네이티브 미등록(vLLM은 Transformers 백엔드 근사 가능) · Upstage Solar License(파생모델 'Solar' 접두 표기 의무)": "MoE (320 routed top-8 + 1 shared, 15B active of 250B) · GQA 8 KV heads×128 (kv_dim=1024) · 1M (1,048,576) context · Korean/English/Japanese · OpenAI-compatible tool calling · variable reasoning_effort · initialized via selective weight transfer (2.3%) from Solar Open 1 (102B) · not yet natively registered in vLLM/SGLang/TensorRT-LLM (vLLM can approximate via the Transformers backend) · Upstage Solar License (derivatives must be prefixed 'Solar')",
    "네이티브 목록 미등록 → Transformers 백엔드(--model-impl transformers)로 near-native 시도": "Not on the native list → attempt near-native via the Transformers backend (--model-impl transformers)",
    "SolarOpen2ForCausalLM — 엔진 레지스트리 미등록, 지원 확인/실측 필요": "SolarOpen2ForCausalLM — not registered in the engine registry, support unconfirmed / testing recommended",
    "MuseGlimmerForConditionalGeneration — 엔진 레지스트리 미등록, 지원 확인/실측 필요": "MuseGlimmerForConditionalGeneration — not registered in the engine registry, support unconfirmed / testing recommended",
    "vLLM 0.27.0에서 신규 네이티브 등록(KimiK3ForConditionalGeneration) — Python·Rust 프론트엔드, DeepGEMM, compressed-tensors 양자화 체크포인트, --tool-call-parser kimi_k3 --reasoning-parser kimi_k3": "Newly registered natively in vLLM 0.27.0 (KimiK3ForConditionalGeneration) — Python/Rust frontend, DeepGEMM, compressed-tensors quantized checkpoints, --tool-call-parser kimi_k3 --reasoning-parser kimi_k3",
    "MoE(256 routed top-6 + shared 2, 975B 중 41B active) · GQA 8 KV heads×128(kv_dim=1024) · 하이브리드 로컬/글로벌 어텐션(슬라이딩윈도우 512, 66층) · 텍스트·이미지·오디오 입력 멀티모달(출력은 텍스트만) · 1M(1,048,576) 컨텍스트 · 가변 reasoning-effort(thinking 강도 조절) · vLLM/SGLang Day-0 네이티브 지원(BF16+NVFP4)": "MoE (256 routed top-6 + 2 shared, 41B active of 975B) · GQA 8 KV heads×128 (kv_dim=1024) · hybrid local/global attention (sliding-window 512, 66 layers) · natively multimodal text/image/audio input (text-only output) · 1M (1,048,576) context · variable reasoning-effort (adjustable thinking depth) · vLLM/SGLang Day-0 native support (BF16+NVFP4)",
    "Day-0 지원 · NVIDIA는 BF16+NVFP4 체크포인트, AMD는 BF16만 — MI35X는 --attention-backend triton --moe-runner-backend aiter 필요": "Day-0 support · NVIDIA ships BF16+NVFP4 checkpoints, AMD BF16-only — MI35X needs --attention-backend triton --moe-runner-backend aiter",
    "Day-0 발표에 TensorRT-LLM 직접 언급 없음 — SGLang이 NVFP4 MoE 라우팅에 flashinfer_trtllm_routed 백엔드(TRT-LLM 커널)를 옵션으로 쓰지만 TRT-LLM 자체 네이티브 서빙은 미확인, 실측 필요": "Not directly mentioned in the day-0 announcements — SGLang optionally uses the flashinfer_trtllm_routed backend (TRT-LLM kernels) for NVFP4 MoE routing, but native TensorRT-LLM serving of Inkling itself is unconfirmed; verify before relying on it",
    "MoE(256 routed top-10 + shared 1, 118B 중 ~8B active) · GQA 8 KV heads×128(kv_dim=1024) · 하이브리드 슬라이딩윈도우(512, 36층)+풀어텐션(12층) · per-head softplus 게이팅 · YaRN으로 1M 컨텍스트 · NVIDIA DGX Spark 단일 노드 목표 설계": "MoE (256 routed top-10 + 1 shared, ~8B active of 118B) · GQA 8 KV heads×128 (kv_dim=1024) · hybrid sliding-window (512, 36 layers) + full attention (12 layers) · per-head softplus gating · YaRN extends context to 1M · designed to target a single NVIDIA DGX Spark node",
    "커스텀 모델링 코드(auto_map/trust_remote_code) — vLLM 0.25.0+에서 --trust-remote-code로 서빙, day-0 vLLM Recipes 확인됨": "Custom modeling code (auto_map/trust_remote_code) — served on vLLM 0.25.0+ via --trust-remote-code, confirmed by day-0 vLLM Recipes",
    "BF16 가중치 ~235GB — 8×H200/B200 tensor-parallel 필요, 단일 GPU는 INT4/NVFP4 양자화 버전 사용": "BF16 weights ~235GB — needs 8×H200/B200 tensor-parallel; use the INT4/NVFP4 quantized build for a single GPU",
    "PR #24204는 Laguna-XS.2(33B)만 SGLang 네이티브 등록 — S-2.1(118B)은 모델카드의 --trust-remote-code 경로 의존, 실측 필요": "PR #24204 only registers Laguna-XS.2 (33B) natively in SGLang — S-2.1 (118B) depends on the model card's --trust-remote-code path; testing recommended",
    "PR #13559(NVIDIA/TensorRT-LLM)도 Laguna-XS.2만 커버 — S-2.1은 --trust-remote-code 경로, tool/reasoning 파서 플래그명이 vLLM과 다름(tool_parser/reasoning_parser=laguna)": "PR #13559 (NVIDIA/TensorRT-LLM) also covers only Laguna-XS.2 — S-2.1 uses the --trust-remote-code path, and the tool/reasoning parser flag names differ from vLLM's (tool_parser/reasoning_parser=laguna)",
    "2.8T MoE(896 experts·16 active+공유 2, 104B active) · 93층=69 KDA(선형어텐션, 고정 상태)+24 Gated MLA → 표시 KV는 MLA 24층만(선형 69층은 KV 없음)의 보수적 상한 · MLA 압축 KV(kv_lora 512+rope 64=576) · MoonViT 네이티브 비전 멀티모달 · 1M(1,048,576) 컨텍스트 · MXFP4 가중치+MXFP8 활성(QAT) · Together·Featherless 서빙 라이브": "2.8T MoE (896 experts · 16 active + 2 shared, 104B active) · 93 layers = 69 KDA (linear attention, fixed state) + 24 Gated MLA → shown KV is a conservative upper bound over the 24 MLA layers only (the 69 linear layers hold no KV) · MLA compressed KV (kv_lora 512 + rope 64 = 576) · MoonViT native-vision multimodal · 1M (1,048,576) context · MXFP4 weights + MXFP8 activations (QAT) · served live by Together · Featherless",
    "가중치 공개 완료(2026-07-27) · Together·Featherless 인퍼런스 프로바이더가 서빙 중": "Weights released (2026-07-27) · served by the Together and Featherless inference providers",
    "신규 아키텍처(KDA·Stable LatentMoE·Gated MLA) — vLLM 네이티브 미등록, 896-expert 라우팅은 프레임워크 패치가 필요할 수 있음": "Novel architecture (KDA · Stable LatentMoE · Gated MLA) — not registered natively in vLLM; 896-expert routing may need a framework patch",
    "MXFP4 가중치 — mxfp4 커널(Blackwell 계열 권장) 필요": "MXFP4 weights — needs the mxfp4 kernel (Blackwell-class recommended)",
    "가중치 2026-07-27 공개 예정 — 그 전엔 서빙 불가": "Weights ship 2026-07-27 — not servable before then",
    "신규 아키텍처(KDA·Stable LatentMoE·Gated MLA) — SGLang 모델 레지스트리 미등록, 896-expert 라우팅은 지원 PR 필요": "Novel architecture (KDA · Stable LatentMoE · Gated MLA) — not in the SGLang model registry; 896-expert routing needs a support PR",
    "신규 아키텍처 — TensorRT-LLM 미등록, MXFP4 가중치는 Blackwell 필요": "Novel architecture — not in TensorRT-LLM; MXFP4 weights require Blackwell",
    "DSA 희소 어텐션 — 표시 KV는 보수적 상한(실제 더 작음)": "DSA sparse attention — shown KV is a conservative upper bound (actual is smaller)",
    "DSA 희소 어텐션 경로 — vLLM 0.25+ 필요": "DSA sparse-attention path — needs vLLM 0.25+",
    "MLA 압축 KV · 멀티모달(image-text)": "MLA compressed KV · multimodal (image-text)",
    "MLA 압축 KV 경로": "MLA compressed-KV path",
    "하이브리드 Mamba-2/MoE/어텐션 — KV는 어텐션 12개 층만(Mamba는 SSM 상태) · 카드는 최대 1M ctx 주장(config 262144)": "Hybrid Mamba-2/MoE/attention — KV is only the 12 attention layers (Mamba keeps SSM state) · card claims up to 1M ctx (config 262144)",
    "하이브리드 Mamba-2 — NemotronH 경로, vLLM 0.25+ 필요": "Hybrid Mamba-2 — NemotronH path, needs vLLM 0.25+",
    "압축 KV(head_dim 512×1) + 희소 인덱서 — 표시 KV는 상한": "Compressed KV (head_dim 512×1) + sparse indexer — shown KV is an upper bound",
    "DeepSeek V4 지원은 vLLM 0.25+": "DeepSeek V4 support requires vLLM 0.25+",
    "압축 KV + 희소 인덱서 — 표시 KV는 상한": "Compressed KV + sparse indexer — shown KV is an upper bound",
    "멀티모달(image-text)": "multimodal (image-text)",
    "멀티모달(image-text) — 비전 타워 포함": "multimodal (image-text) — includes a vision tower",
    "슬라이딩 윈도우 어텐션 — 표시 KV는 보수적 상한": "sliding-window attention — shown KV is a conservative upper bound",
    "슬라이딩 윈도우 어텐션 · 멀티모달": "sliding-window attention · multimodal",
    "슬라이딩 윈도우 — 표시 KV는 상한": "sliding window — shown KV is an upper bound",
    "슬라이딩 윈도우 어텐션": "sliding-window attention",
    "PLE/공유 KV — 실제 KV는 표시보다 훨씬 작음": "PLE / shared KV — actual KV is much smaller than shown",
    "하이브리드 Mamba-2/MoE/어텐션 — KV는 어텐션 층만 · 카드는 최대 1M ctx 주장(config 262144)": "Hybrid Mamba-2/MoE/attention — KV is attention layers only · card claims up to 1M ctx (config 262144)",
    "하이브리드 Mamba-2 — NemotronH 경로": "Hybrid Mamba-2 — NemotronH path",
    "하이브리드 Mamba-2/어텐션 MoE — KV는 어텐션 6개 층만 · Mamba는 SSM 상태": "Hybrid Mamba-2/attention MoE — KV is only the 6 attention layers · Mamba keeps SSM state",
    "코딩 특화(에이전틱 SWE) · dense · 텍스트 backbone 기준(Pixtral 비전 타워 별도)": "Coding-focused (agentic SWE) · dense · text backbone only (Pixtral vision tower separate)",
    "하이브리드 Mamba-2/MoE — KV는 어텐션 4개 층만(NoPE) · Mamba는 SSM 상태": "Hybrid Mamba-2/MoE — KV is only the 4 attention layers (NoPE) · Mamba keeps SSM state",
    "GraniteMoeHybrid — vLLM 0.25+ 필요": "GraniteMoeHybrid — needs vLLM 0.25+",
    "슬라이딩 윈도우 어텐션(교대 층) — 표시 KV는 보수적 상한 · MXFP4 MoE": "sliding-window attention (alternating layers) — shown KV is a conservative upper bound · MXFP4 MoE",
    "MXFP4 기본 — --quantization mxfp4, Blackwell 계열 권장": "MXFP4 by default — --quantization mxfp4, Blackwell-class recommended",
    "vLLM에 전용 구현이 있어 최고 속도로 바로 서빙됩니다. 별도 플래그 불필요.": "vLLM has a dedicated implementation, so it serves at top speed out of the box. No extra flags needed.",
    "네이티브 등록 목록엔 없지만 표준 아키텍처라 Transformers 백엔드(--model-impl transformers)로 near-native 구동이 가능합니다. config.json만으론 100% 확정은 어려워 '가능성 높음'으로 봅니다.": "Not on the native list, but as a standard architecture it can run near-native via the Transformers backend (--model-impl transformers). config.json alone can't fully confirm it, so we treat it as 'likely'.",
    "커스텀 모델링 코드(auto_map/trust_remote_code)입니다. --trust-remote-code가 필요하고, Transformers 백엔드 호환은 그 코드가 표준 attention 인터페이스를 따를 때만 성립합니다. 실측 시도를 권장합니다.": "Custom modeling code (auto_map/trust_remote_code). It needs --trust-remote-code, and Transformers-backend compatibility holds only if that code follows the standard attention interface. Testing is recommended.",
    "config.json에서 architectures를 읽지 못해 판정할 수 없습니다. 모델 카드를 직접 확인하세요.": "Can't determine — architectures weren't found in config.json. Check the model card directly.",
    "SGLang 모델 레지스트리에 전용 구현이 있어 최고 속도로 바로 서빙됩니다(RadixAttention·연속 배칭). DeepSeek/MLA 계열은 DP-attention으로 특히 강합니다.": "SGLang's model registry has a dedicated implementation, so it serves at top speed out of the box (RadixAttention · continuous batching). DeepSeek/MLA models are especially strong via DP-attention.",
    "SGLang이 지원하지만 비교적 신규 경로(하이브리드 Mamba·신규 MoE)라 최신 빌드가 필요하고 성능/정확도는 실측 권장입니다.": "Supported by SGLang, but a relatively new path (hybrid Mamba · new MoE), so it needs a recent build and performance/accuracy should be measured.",
    "SGLang 모델 레지스트리에 아직 없는 아키텍처입니다. Transformers 폴백 백엔드로 시도하거나 지원 PR/실측이 필요합니다.": "Architecture not yet in the SGLang model registry. Try the Transformers fallback backend, or a support PR / test is needed.",
    "선택한 하드웨어에서 SGLang이 동작하지 않습니다(Apple/NPU). vLLM 등 다른 런타임을 사용하세요.": "SGLang doesn't run on the selected hardware (Apple/NPU). Use another runtime such as vLLM.",
    "멀티모달 Llama 4 — 비전 경로 포함": "Multimodal Llama 4 — includes the vision path",
    "비전-언어 멀티모달 서빙 경로": "vision-language multimodal serving path",
    "비전 타워 포함 멀티모달 — SGLang 멀티모달 경로": "multimodal with a vision tower — SGLang multimodal path",
    "슬라이딩 윈도우 · 멀티모달": "sliding window · multimodal",
    "슬라이딩 윈도우 어텐션 — Gemma 4는 신규, 최신 SGLang 빌드 권장": "sliding-window attention — Gemma 4 is new, a recent SGLang build is recommended",
    "슬라이딩 윈도우 · 멀티모달 — Gemma 4는 신규, 최신 빌드 권장": "sliding window · multimodal — Gemma 4 is new, a recent build is recommended",
    "MLA 압축 KV + DP-attention — SGLang 대표 최적화 경로": "MLA compressed KV + DP-attention — SGLang's flagship optimized path",
    "MLA + DP-attention 최적화 — SGLang 강점": "MLA + DP-attention optimized — an SGLang strength",
    "DeepSeek V4 — 압축 KV/희소 인덱서 경로, 최신 SGLang 빌드 필요": "DeepSeek V4 — compressed-KV / sparse-indexer path, needs a recent SGLang build",
    "DeepSeek V4 — 압축 KV/희소 인덱서 경로 · 텐서/전문가/컨텍스트 병렬 + 분리서빙 포함 풀스택은 v0.5.12부터": "DeepSeek V4 — compressed-KV / sparse-indexer path · the full stack (tensor/expert/context parallel + disaggregation) landed in v0.5.12",
    "GLM MoE — DSA 희소 어텐션 경로는 최신 빌드 권장": "GLM MoE — the DSA sparse-attention path recommends a recent build",
    "MXFP4 MoE 기본 — Blackwell 계열 GPU 권장, --quantization mxfp4 자동 감지": "MXFP4 MoE by default — Blackwell-class GPU recommended, --quantization mxfp4 auto-detected",
    "MiniMax — 비교적 신규, 최신 SGLang 빌드 + 실측 권장": "MiniMax — relatively new, a recent SGLang build + testing recommended",
    "MiniMax M2 — 신규 아키텍처, 최신 SGLang 빌드 + 실측 권장": "MiniMax M2 — novel architecture, a recent SGLang build + testing recommended",
    "하이브리드 Mamba-2/어텐션 — SGLang 하이브리드 경로는 vLLM 대비 신규, 실측 권장": "Hybrid Mamba-2/attention — SGLang's hybrid path is newer than vLLM's, testing recommended",
    "하이브리드 Mamba-2/MoE — SGLang 하이브리드 지원은 신규, 실측 권장": "Hybrid Mamba-2/MoE — SGLang hybrid support is new, testing recommended",
    "하이브리드 Mamba-2/어텐션 — DP-attention+MTP 포함 하이브리드 경로는 v0.5.14부터, 실측 권장": "Hybrid Mamba-2/attention — the hybrid path with DP-attention+MTP landed in v0.5.14, testing recommended",
    "하이브리드 Mamba-2/MoE — SGLang 하이브리드 지원은 상대적으로 신규(v0.5.14 전후), 실측 권장": "Hybrid Mamba-2/MoE — SGLang hybrid support is relatively new (around v0.5.14), testing recommended",
    "SGLang은 NVIDIA(CUDA)·AMD(ROCm) 가속기에서 동작합니다. Apple Silicon·NPU(Furiosa/Rebellions/Gaudi/Trainium)는 미지원 — 이 경우 vLLM(Apple: llama.cpp/MLX, NPU: 벤더 런타임)을 사용하세요.": "SGLang runs on NVIDIA (CUDA) and AMD (ROCm) accelerators. Apple Silicon and NPUs (Furiosa/Rebellions/Gaudi/Trainium) are unsupported — use vLLM (Apple: llama.cpp/MLX, NPU: vendor runtime) instead.",
    "TensorRT-LLM에 전용 최적화 경로가 있어 NVIDIA GPU에서 최고 처리량으로 서빙됩니다. 최신 릴리스는 trtllm-serve(PyTorch 백엔드)로 사전 엔진 빌드 없이 바로 구동 가능합니다.": "TensorRT-LLM has a dedicated optimized path, serving at top throughput on NVIDIA GPUs. Recent releases run directly via trtllm-serve (PyTorch backend) with no ahead-of-time engine build.",
    "TensorRT-LLM이 지원하지만 신규/멀티모달 경로라 최신 릴리스가 필요하고 정확도/성능은 실측 권장입니다.": "Supported by TensorRT-LLM, but a new/multimodal path, so it needs a recent release and accuracy/performance should be measured.",
    "TensorRT-LLM 모델 레지스트리에 아직 없는 아키텍처입니다 — vLLM 또는 SGLang을 사용하거나 지원 확인이 필요합니다.": "Architecture not yet in the TensorRT-LLM model registry — use vLLM or SGLang, or verify support.",
    "TensorRT-LLM은 NVIDIA GPU 전용입니다 — 선택한 하드웨어(AMD/Apple/NPU)에서는 동작하지 않습니다.": "TensorRT-LLM is NVIDIA-GPU only — it doesn't run on the selected hardware (AMD/Apple/NPU).",
    "멀티모달 — TensorRT-LLM 비전 경로는 제한적, 실측 권장": "multimodal — TensorRT-LLM's vision path is limited, testing recommended",
    "멀티모달(비전 타워) — TensorRT-LLM VL 지원은 제한적, 텍스트 경로 위주, 실측 권장": "multimodal (vision tower) — TensorRT-LLM VL support is limited, text path mostly, testing recommended",
    "슬라이딩 윈도우 · 멀티모달 — 비전 경로 제한적": "sliding window · multimodal — vision path is limited",
    "슬라이딩 윈도우 — Gemma 4는 신규, 최신 TensorRT-LLM 필요": "sliding window — Gemma 4 is new, needs a recent TensorRT-LLM",
    "멀티모달 Gemma 4 — 텍스트 경로 위주, 비전은 제한적": "multimodal Gemma 4 — text path mostly, vision is limited",
    "FP8/NVFP4로 강하게 최적화(Hopper/Blackwell) — TensorRT-LLM 대표 경로": "Heavily optimized for FP8/NVFP4 (Hopper/Blackwell) — a flagship TensorRT-LLM path",
    "DeepSeek V4 — 압축 KV/희소 인덱서, 최신 TensorRT-LLM 필요": "DeepSeek V4 — compressed KV / sparse indexer, needs a recent TensorRT-LLM",
    "GLM MoE — 최신 TensorRT-LLM 빌드 필요, DSA 희소 어텐션 경로 실측 권장": "GLM MoE — needs a recent TensorRT-LLM build, DSA sparse-attention path should be measured",
    "MXFP4/NVFP4 — NVIDIA 협업 최적화, Blackwell 계열 권장": "MXFP4/NVFP4 — NVIDIA-collaborated optimization, Blackwell-class recommended",
    "NVIDIA 자사 모델 — TensorRT-LLM 우선 지원": "NVIDIA's own model — first-class TensorRT-LLM support",
    "하이브리드 Mamba-2 — NVIDIA 자사 모델, TensorRT-LLM 지원": "Hybrid Mamba-2 — NVIDIA's own model, supported by TensorRT-LLM",
    "Granite MoE — 최신 빌드 권장": "Granite MoE — a recent build is recommended",
    "하이브리드 Mamba-2/MoE — TensorRT-LLM 하이브리드 지원 확인/실측 필요": "Hybrid Mamba-2/MoE — TensorRT-LLM hybrid support should be verified/measured",
    "MiniMax — TensorRT-LLM 모델 레지스트리 미등록, 지원 확인/실측 필요": "MiniMax — not in the TensorRT-LLM model registry, support should be verified/measured",
    "MiniMax M2 — TensorRT-LLM 미등록, 지원 확인/실측 필요": "MiniMax M2 — not in TensorRT-LLM, support should be verified/measured",
    "TensorRT-LLM은 NVIDIA GPU(Ampere/Hopper/Blackwell) 전용입니다. AMD Instinct·Apple Silicon·NPU(Furiosa/Rebellions/Gaudi/Trainium)에서는 동작하지 않습니다 — 그 하드웨어에서는 vLLM 또는 SGLang(AMD)/벤더 런타임을 사용하세요.": "TensorRT-LLM is for NVIDIA GPUs only (Ampere/Hopper/Blackwell). It doesn't run on AMD Instinct, Apple Silicon, or NPUs (Furiosa/Rebellions/Gaudi/Trainium) — on that hardware use vLLM, or SGLang (AMD) / a vendor runtime.",
    // verdict tier labels (from compute.js)
    "네이티브 지원": "Native support",
    "Transformers 백엔드": "Transformers backend",
    "커스텀 코드 — 확인 필요": "Custom code — verify",
    "판정 불가": "Undetermined",
    "미지원": "Unsupported",
    "부분 지원 — 확인 필요": "Partial support — verify",
    "하드웨어 미지원": "Hardware unsupported",
    // speech.json notes
    "토큰 단위 · 텍스트 입력 $5 / 이미지 입력 $8 (표준). 이미지당 단가는 OpenAI 계산기 참고": "Token-priced · text in $5 / image in $8 (standard). See the OpenAI calculator for per-image cost",
    "저가형 · 이미지 입력 $2.50 / 텍스트 입력 $2": "Low-cost · image in $2.50 / text in $2",
    "1K/2K 출력 · 입력 $0.002/img": "1K/2K output · input $0.002/img",
    "인코더-디코더 · 100+ 언어 · 정확도 기준선": "encoder-decoder · 100+ languages · accuracy baseline",
    "디코더 프루닝 · 훨씬 빠름": "decoder-pruned · much faster",
    "FastConformer · 다국어(EU) · 타임스탬프": "FastConformer · multilingual (EU) · timestamps",
    "25개 EU 언어 · ASR+번역": "25 EU languages · ASR + translation",
    "52개 언어 · 스트리밍+오프라인 통합": "52 languages · streaming + offline unified",
    "엣지용 초경량 · 영어": "ultra-light for edge · English",
    "토크나이저-프리 확산 · 30개 언어 · 48kHz · 클로닝": "tokenizer-free diffusion · 30 languages · 48kHz · cloning",
    "3초 클로닝 · 보이스 디자인 · 10개 언어": "3-sec cloning · voice design · 10 languages",
    "초경량·초고속 · 엣지 인기": "ultra-light, ultra-fast · popular for edge",
    "23+ 언어 · 제로샷 클로닝 · 감정 조절": "23+ languages · zero-shot cloning · emotion control",
    "Llama 기반 speech-LLM · ~200ms 스트리밍": "Llama-based speech-LLM · ~200ms streaming",
    "플로우매칭 DiT · 제로샷 클로닝 · 비상업 라이선스": "flow-matching DiT · zero-shot cloning · non-commercial license",
    "입력/출력": "input/output",
    "스트리밍": "streaming",
    "텍스트 입력 / 오디오 출력": "text in / audio out",
    "STT $0.10/시간 · S2S $0.05/분": "STT $0.10/hr · S2S $0.05/min",
    "크레딧 기반 환산 [추정]": "credit-based conversion [est.]",
    "MoE(384 routed top-8 + 공유 1, 505B 중 18B active — 모델 카드 공식 수치) · config.json 원시 레이어 합산 시 MTP 예측 레이어(num_nextn_predict_layers=3) 포함으로 약 542B까지 더 크게 계산됨(표준 서빙엔 MTP 레이어 미탑재) · MLA 압축 KV(kv_lora 512+rope 64=576, 표시 KV는 보수적 상한) · DSA 희소 인덱서(index_topk=2048)+슬라이딩 윈도우 혼합 어텐션 · 524,288(512K) 컨텍스트 · 화웨이 어센드 NPU로 사전학습(엔비디아 GPU 미사용) · openPangu Model License v2.0(상업적 이용 조건 확인 필요)": "MoE (384 routed top-8 + 1 shared, 18B active of 505B — per the official model card) · summing raw layers from config.json yields a larger ~542B once the MTP prediction layers (num_nextn_predict_layers=3) are included (not loaded for standard serving) · MLA compressed KV (kv_lora 512 + rope 64 = 576, shown KV is a conservative upper bound) · DSA sparse indexer (index_topk=2048) + sliding-window mixed attention · 524,288 (512K) context · pretrained on Huawei Ascend NPUs (no Nvidia GPUs used) · openPangu Model License v2.0 (check commercial-use terms)",
    "OpenPanguV2ForCausalLM — 커스텀 모델링 코드(auto_map/trust_remote_code), 화웨이는 자체 omni-infer(Ascend NPU) 프레임워크를 권장하며 모델 카드에 vLLM 지원 언급 없음 — NVIDIA GPU 서빙은 실측 필요": "OpenPanguV2ForCausalLM — custom modeling code (auto_map/trust_remote_code); Huawei recommends its own omni-infer framework (Ascend NPU) and the model card does not mention vLLM support — NVIDIA GPU serving needs testing",
    "OpenPanguV2ForCausalLM — 엔진 레지스트리 미등록, 지원 확인/실측 필요": "OpenPanguV2ForCausalLM — not registered in the engine registry, support unconfirmed / testing recommended",
    // speech.json units
    "/이미지": "/image",
    "/1M 오디오 tok": "/1M audio tok",
    "/분": "/min",
    "/시간": "/hr",
    "/1M자": "/1M chars",
    "RNN-T 스트리밍 ASR입니다. 오프라인 transcribe()가 언어 프롬프트를 읽지 않는 것은 NVIDIA 이슈 트래커에서도 확인된 미해결 버그라 배치 전사로는 쓸 수 없고, NeMo의 cache-aware 스트리밍 스크립트(att_context_size로 지연 제어) 또는 NIM 컨테이너(nemotron-asr-streaming)로 서빙합니다. 모델 카드 기준 H100 1장에서 80ms 청크 약 240 동시 스트림, 1120ms 청크 약 2,400 스트림입니다. 디스크 5.66GB가 큰 이유는 fp32로 배포되기 때문이고, 실제 파라미터는 1.42B입니다. ⚠️ 라이선스가 HF 메타데이터에는 other로 표기돼 있어 상업 이용 전 원문 확인이 필요합니다.":
      "Streaming RNN-T ASR. Offline transcribe() ignoring the language prompt is an unresolved bug confirmed on NVIDIA's own issue tracker, so batch transcription is out — serve it with NeMo's cache-aware streaming script (att_context_size controls latency) or the NIM container (nemotron-asr-streaming). Per the model card, one H100 sustains ~240 concurrent streams at 80ms chunks and ~2,400 at 1,120ms chunks. The 5.66GB on disk is fp32 packaging; the real parameter count is 1.42B. ⚠️ The license shows as 'other' in HF metadata — read the original text before commercial use.",
    "다국어 zero-shot TTS입니다. 로컬 cosyvoice 패키지는 torch 2.3 세대 코드가 최신 오디오 API(torchcodec)에서 깨져 벤더 핀(torch 2.3.1·numpy 1.26.4) 격리 환경이 필요합니다. 사전 화자 목록이 비어 있는 것은 결함이 아니라 zero-shot 전용 설계입니다(참조 음성 필수). vLLM-Omni가 정확히 이 체크포인트를 구현·등재하고 있어 벤더 스택을 우회하는 서빙 경로가 있습니다.":
      "Multilingual zero-shot TTS. The local cosyvoice package needs a vendor-pinned isolated env (torch 2.3.1, numpy 1.26.4) because its torch 2.3-era code breaks on the modern audio API (torchcodec). The empty preset-speaker list is by design, not a defect — CosyVoice3 is zero-shot only (reference audio required). vLLM-Omni implements and lists exactly this checkpoint, giving a serving path that bypasses the vendor stack.",
    "10개 언어와 3초 클로닝, 보이스 디자인을 내세운 TTS입니다. 공식 파이썬 패키지 qwen-tts(PyPI 0.1.1, transformers 4.57.3 핀)가 로드 경로이고, vLLM-Omni도 Base·CustomVoice·VoiceDesign 체크포인트를 day-0로 등재해 서빙 경로가 둘 다 열려 있습니다. ⚠️ Base 체크포인트는 generate_custom_voice를 거부하고 generate_voice_clone(ref_audio, ref_text) 경로만 받으므로 참조 음성이 반드시 필요합니다. 파라미터 2.27B는 speech_tokenizer 0.68GB를 포함한 스테이징 가중치 기준입니다.":
      "A TTS touting 10 languages, 3-second cloning and voice design. The official Python package qwen-tts (PyPI 0.1.1, pinned to transformers 4.57.3) is the load path, and vLLM-Omni also lists the Base, CustomVoice and VoiceDesign checkpoints day-0 — both serving routes are open. ⚠️ The Base checkpoint refuses generate_custom_voice and only accepts generate_voice_clone(ref_audio, ref_text), so reference audio is mandatory. The 2.27B parameter figure is from the staged weights including the 0.68GB speech_tokenizer.",
    "transformers가 아니라 NeMo 생태계입니다 — 정식 릴리스가 아니라 git main 설치(nemo_toolkit[asr])가 필요하고 Python 3.10은 미지원입니다.":
      "This is the NeMo ecosystem, not transformers — it needs a git-main install (nemo_toolkit[asr]) rather than a tagged release, and Python 3.10 is unsupported.",
    "언어 프롬프트는 set_inference_prompt(PromptStreamingMixin)로만 전달됩니다 — 오프라인 transcribe()가 이를 읽지 않는 버그는 NVIDIA 이슈 트래커에서도 미해결로 확인됩니다. 정상 경로는 cache-aware 스트리밍 추론 스크립트(att_context_size로 지연·처리량 조절)입니다.":
      "The language prompt only flows through set_inference_prompt (PromptStreamingMixin) — offline transcribe() ignoring it is confirmed unresolved on NVIDIA's issue tracker. The correct path is the cache-aware streaming inference script (att_context_size trades latency for throughput).",
    "TensorRT-LLM 변환 경로는 확인되지 않습니다. NVIDIA의 프로덕션 경로는 NIM 컨테이너 nemotron-asr-streaming(스트리밍 저지연·고처리량·오프라인 3모드)이며 내부적으로 NeMo/Riva 스택입니다.":
      "No TensorRT-LLM conversion path could be confirmed. NVIDIA's production route is the NIM container nemotron-asr-streaming (low-latency streaming, high-throughput streaming and offline modes), running the NeMo/Riva stack internally.",
    "현재 스택에서 합성이 되지 않습니다 — torch 2.3 시절 코드가 torch 2.11 오디오 API에서 torchcodec 예외로 깨집니다(9라운드 확인). 벤더 핀(torch 2.3.1) 격리 환경에서만 동작합니다.":
      "Synthesis does not work on the current stack — torch 2.3-era code breaks against the torch 2.11 audio API with a torchcodec exception (confirmed over nine rounds). It only runs in a vendor-pinned (torch 2.3.1) isolated environment.",
    "사전 화자 모드가 없는 것은 설계입니다 — CosyVoice3는 zero-shot(ref_audio+ref_text) 전용이라 list_available_spks()가 빈 배열인 게 정상입니다.":
      "The absence of a preset-speaker mode is by design — CosyVoice3 is zero-shot only (ref_audio + ref_text), so list_available_spks() returning an empty array is expected.",
    "vLLM-Omni가 정확히 이 체크포인트를 구현·등재하고 있습니다 — vllm serve FunAudioLLM/Fun-CosyVoice3-0.5B-2512 --omni (talker+flow-matching 2단, 24kHz, 스트리밍 /v1/audio/speech/stream). 벤더의 torch 2.3 핀 스택을 완전히 우회합니다(자체 실측은 아직 없음).":
      "vLLM-Omni implements and lists exactly this checkpoint — vllm serve FunAudioLLM/Fun-CosyVoice3-0.5B-2512 --omni (two-stage talker + flow-matching, 24kHz, streaming via /v1/audio/speech/stream). It bypasses the vendor's torch 2.3-pinned stack entirely (no in-house benchmark yet).",
    "TensorRT-LLM 가속은 CosyVoice2 기준으로만 문서화돼 있고 CosyVoice3 확인이 없습니다. sherpa-onnx도 미구현(기능 요청 오픈) 상태입니다.":
      "TensorRT-LLM acceleration is documented for CosyVoice2 only, with no CosyVoice3 confirmation. sherpa-onnx has not implemented it either (feature request open).",
    "transformers 코어에는 qwen3_tts 모델 타입이 없습니다 — 공식 파이썬 패키지 qwen-tts(PyPI 0.1.1, transformers 4.57.3 핀)가 로드 경로입니다.":
      "transformers core has no qwen3_tts model type — the official Python package qwen-tts (PyPI 0.1.1, pinned to transformers 4.57.3) is the load path.",
    "CUDA bf16 + FlashAttention 2 권장이고 배치 합성과 스트리밍(엔드투엔드 97ms) 생성을 지원합니다. ThakiCloud는 이 패키지로 실동작을 확인했습니다.":
      "CUDA bf16 with FlashAttention 2 is recommended; batch synthesis and streaming generation (97ms end-to-end) are supported. ThakiCloud has verified it running with this package.",
    "vLLM-Omni가 Qwen3-TTS 시리즈(Base·CustomVoice·VoiceDesign)를 day-0로 등재하고 있습니다(/v1/audio/speech). 프로덕션 서빙은 이 경로가 정본입니다(자체 실측은 아직 없음).":
      "vLLM-Omni lists the Qwen3-TTS series (Base, CustomVoice, VoiceDesign) with day-0 support (/v1/audio/speech). This is the canonical production serving path (no in-house benchmark yet).",
    "메인라인 TensorRT-LLM은 멀티코드북 오디오 토큰 생성을 샘플러가 지원하지 않아 미지원입니다(기능 요청 이슈 오픈).":
      "Mainline TensorRT-LLM cannot serve it — the sampler does not support multi-codebook audio-token generation (feature request open).",
    "기본 생성은 768p이고 2K는 H3-Regenerate-2K 업스케일 단계를 따로 돌립니다.":
      "Base generation is 768p; 2K requires the separate H3-Regenerate-2K upscale stage.",
    "모델 카드 스펙입니다.":
      "Model-card spec.",
    "공개 양자화 변형이 아직 없고, AdaLN 브랜치(~13B)는 추론 전용 배포에서 생략할 수 있습니다.":
      "No quantized variants published yet; the AdaLN branches (~13B) can be dropped for inference-only deploys.",
    "증류 파이프라인은 고정 시그마 스케줄로 1단계 8스텝 + 2단계 4스텝을 돕니다.":
      "The distilled pipeline runs a fixed sigma schedule: 8 steps stage 1 + 4 steps stage 2.",
    "증류 체크포인트는 CFG가 내장돼 있습니다.":
      "Distilled checkpoints have guidance baked in.",
    "VAE 패치·시간압축 제약입니다. 어기면 자동 패드·크롭됩니다.":
      "VAE patch/temporal-compression constraints; violations are auto-padded and cropped.",
    "별도 체크포인트가 아니라 로드타임 플래그로 fp8 캐스트를 겁니다(scaled-mm은 Hopper 이상).":
      "fp8 is a load-time flag, not a separate checkpoint (scaled-mm needs Hopper+).",
    "T2V 태스크에 맞춰 튜닝된 flow-matching 타임스텝 시프트입니다.":
      "Flow-matching timestep shift tuned for the T2V task.",
    "고노이즈(레이아웃)·저노이즈(디테일) 전문가가 서로 다른 CFG 강도를 씁니다. 경계는 SNR 0.875입니다.":
      "The high-noise (layout) and low-noise (detail) experts use different CFG strengths; the SNR switch boundary is 0.875.",
    "카드가 검증한 해상도 조합입니다.":
      "Officially validated resolutions.",
    "MoE 2전문가 중 비활성 쪽을 내려 피크 VRAM을 줄입니다(활성은 14B, 디스크는 27B).":
      "Offloads the inactive expert of the two-expert MoE to cut peak VRAM (14B active, 27B on disk).",
    "이미지 조건이 붙는 I2V는 T2V(12.0)보다 낮은 시프트가 최적입니다.":
      "With image conditioning, I2V wants a lower shift than T2V's 12.0.",
    "I2V는 두 전문가가 같은 CFG를 쓰고 경계는 SNR 0.900입니다.":
      "I2V weights both experts equally; the SNR boundary is 0.900.",
    "출력 종횡비는 고정 W×H가 아니라 소스 이미지를 따릅니다.":
      "Output aspect follows the source image rather than a fixed WxH.",
    "비활성 전문가 오프로드 + dtype 변환으로 피크 VRAM을 줄입니다.":
      "Cuts peak VRAM by offloading the inactive expert and converting dtype.",
    "모델 카드 퀵스타트 기본값입니다. 줄이면 빨라지지만 세부 묘사가 무너집니다.":
      "Model-card quick-start default. Fewer steps are faster but fine detail degrades.",
    "높일수록 프롬프트 충실도가 오르지만 4를 넘기면 아티팩트가 늘어납니다.":
      "Higher improves prompt adherence; past 4 artifacts increase.",
    "학습된 종횡비 버킷을 그대로 쓰는 것이 가장 안정적입니다.":
      "Stick to the trained aspect-ratio buckets for the most stable output.",
    "모델 카드가 제공하는 저품질·AI 흔적 억제용 네거티브 프롬프트를 쓰면 기본 품질이 올라갑니다.":
      "Using the card-provided quality-defect negative prompt raises baseline quality.",
    "기본 40스텝이고, Lightning 증류 LoRA를 얹으면 4스텝까지 줄일 수 있습니다.":
      "Default is 40 steps; the Lightning distillation LoRA cuts it to ~4.",
    "파이프라인은 guidance_scale 1.0을 두고 true_cfg_scale이 실제 유도를 담당합니다.":
      "The pipeline keeps guidance_scale at 1.0; true_cfg_scale does the real guidance.",
    "카드 기본값은 빈 문자열이 아니라 공백 한 칸입니다.":
      "The card default is a single-space string, not an empty one.",
    "레이어 수를 지정한 RGBA 분해가 핵심 기능이고, 결과 레이어를 다시 분해할 수도 있습니다.":
      "Variable-count RGBA layer decomposition is the core capability; layers can be decomposed recursively.",
    "카드가 못박은 하드 요구사항입니다 — 낮은 버전은 로드 자체가 안 됩니다.":
      "A hard requirement stated on the card — older versions fail to load.",
    "증류(Decoupled-DMD) 모델이라 CFG를 꺼야 합니다 — 카드가 'Turbo는 guidance 0'을 명시합니다.":
      "A distilled (Decoupled-DMD) model — the card states guidance must be 0 for Turbo.",
    "증류 목표 스텝 수입니다. 더 늘려도 품질이 늘지 않습니다.":
      "The distillation target step count; more steps do not buy quality.",
    "카드 퀵스타트 기본값입니다.":
      "Card quick-start default.",
    "가이던스 증류 체크포인트라 4스텝이 기본입니다.":
      "A guidance-distilled checkpoint — 4 steps is the default.",
    "가이던스가 증류로 내장돼 있어 CFG를 더 걸 필요가 없습니다.":
      "Guidance is baked in by distillation; extra CFG is unnecessary.",
    "증류가 아닌 고전 CFG 모델의 표준 기본값입니다.":
      "Standard default for a classic non-distilled CFG model.",
    "카드의 base+refiner 앙상블 예제가 40스텝을 씁니다.":
      "The card's base+refiner ensemble example uses 40 steps.",
    "디테일이 필요하면 refiner로 마지막 20%를 넘기는 앙상블 파이프라인이 카드 권장입니다.":
      "For extra detail the card recommends handing the last ~20% of denoising to the refiner.",
    "카드가 추론에 FA2를 요구합니다(transformers>=5.5.3, torch>=2.9.1).":
      "The card requires FA2 for inference (transformers>=5.5.3, torch>=2.9.1).",
    "키워드 바이어싱이 희귀 고유명사·약어 인식률을 올립니다.":
      "Keyword biasing improves recall of rare names and acronyms.",
    "기본값은 긴 오디오에서 전사를 자릅니다 — 길면 올리세요.":
      "The default truncates long transcripts — raise it for long audio.",
    "처리량이 필요하면 올립니다. 동시성이 실시간 배수를 크게 늘립니다.":
      "Raise for throughput; concurrency multiplies the realtime factor.",
    "내장 언어감지가 있고 스트리밍·오프라인이 단일 모델입니다.":
      "Built-in language ID; one model covers streaming and offline.",
    "프로세서 기본값을 공유합니다.":
      "Shares the 1.7B processor defaults.",
    "model.transcribe() 입력 스펙입니다. 긴 오디오는 자동 청킹됩니다.":
      "Input spec of model.transcribe(); long audio is auto-chunked.",
    "인코더 torch.compile + CPU 디토크나이즈 오버랩으로 처리량을 올립니다.":
      "torch.compile on the encoder plus CPU-detokenize overlap raises throughput.",
    "그리디 + 온도 폴백(0→1.0)이 카드 기본입니다. 저신뢰 구간만 재디코딩합니다.":
      "Greedy with the temperature-fallback tuple (0→1.0) is the card default; only low-confidence spans re-decode.",
    "청크 간 환각 루프를 막습니다.":
      "Prevents hallucination loops across chunks.",
    "30초가 네이티브 학습 창이고 448이 디코더 상한입니다.":
      "30s is the native training window; 448 is the decoder cap.",
    "생성 설정을 공유하고, 4레이어 디코더로 2-3배 빠릅니다.":
      "Shares large-v3's generation config; the 4-layer decoder is 2-3x faster.",
    "룩어헤드로 지연·정확도를 거래합니다 — [56,0]은 80ms 초저지연, [56,13]은 1.12s 최고 정확도.":
      "Lookahead trades latency for accuracy — [56,0] is 80ms ultra-low-latency, [56,13] is 1.12s highest-accuracy.",
    "청크가 클수록 처리량이 오르고(동시 스트림 240→2,400) 지연이 늘어납니다.":
      "Bigger chunks raise throughput (240→2,400 concurrent streams) at the cost of latency.",
    "제로샷 클로닝이 음색·억양·운율을 그대로 가져갑니다.":
      "Zero-shot cloning captures timbre, accent and prosody from the clip.",
    "CFG는 유도 강도-자연스러움, 타임스텝은 품질-속도 트레이드오프입니다.":
      "cfg trades guidance strength vs naturalness; timesteps trade quality vs speed.",
    "감정 강도입니다. 0.7 이상은 표현이 커지고 말도 빨라집니다.":
      "Emotional intensity; 0.7+ gets expressive and speeds up delivery.",
    "참조 음성 충실도입니다. 드라마틱한 낭독은 0.3 근처가 권장입니다.":
      "Reference-voice fidelity; ~0.3 is recommended for dramatic reads.",
    "보이스 팩이 음색과 언어를 결정합니다.":
      "The voice pack selects timbre and language.",
    "장문은 speed 0.9와 정규식 청킹이 말 빨라짐을 막아줍니다.":
      "For long text, speed 0.9 plus regex chunking prevents rushed delivery.",
    "instruct 모드는 자연어 지시문으로 스타일을 제어합니다.":
      "Instruct mode controls style via a natural-language directive.",
    "운율·감정을 지시문으로 조절합니다.":
      "Prosody and emotion are steered by the directive.",
    "실용 스트리밍 지연은 약 150ms입니다.":
      "Practical streaming latency is ~150ms.",
    "Base는 제로샷 클로닝 전용이라 참조 음성이 필수입니다.":
      "Base is zero-shot-clone only, so reference audio is mandatory.",
    "텍스트 언어의 네이티브 화자를 고르는 것이 카드 권장입니다.":
      "Picking a speaker native to the text language is the card's recommendation.",
    "generate_custom_voice에 스타일 지시를 넘길 수 있습니다.":
      "A style directive can be passed to generate_custom_voice.",
  };

  let lang = "ko";
  function interp(s, v) { return v ? s.replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? "" : v[k])) : s; }
  function t(key, v) {
    const d = UI[lang] || UI.ko;
    const s = (d[key] != null) ? d[key] : (UI.ko[key] != null ? UI.ko[key] : key);
    return interp(s, v);
  }
  function td(ko) { if (lang === "ko" || ko == null) return ko; return DATA[ko] || ko; }

  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach(e => { e.textContent = t(e.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-html]").forEach(e => { e.innerHTML = t(e.getAttribute("data-i18n-html")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(e => { e.setAttribute("placeholder", t(e.getAttribute("data-i18n-ph"))); });
    const ti = document.querySelector("title"); if (ti) ti.textContent = t("doc.title");
    const de = document.querySelector('meta[name="description"]'); if (de) de.setAttribute("content", t("doc.desc"));
    document.documentElement.lang = lang;
  }
  function updateToggles() {
    document.querySelectorAll("#langToggle [data-lang]").forEach(b => b.classList.toggle("active", b.dataset.lang === lang));
    const th = currentTheme();
    document.querySelectorAll("#themeToggle [data-theme-set]").forEach(b => b.classList.toggle("active", b.dataset.themeSet === th));
  }
  function setLang(l, rerender) {
    lang = (l === "en") ? "en" : "ko";
    try { localStorage.setItem("llmcalc.lang", lang); } catch (e) {}
    applyStatic();
    if (rerender && typeof root.render === "function") root.render();
    updateToggles();
  }
  function initLang() {
    let l = null;
    try { l = localStorage.getItem("llmcalc.lang"); } catch (e) {}
    if (!l) l = (navigator.language || "").toLowerCase().indexOf("ko") === 0 ? "ko" : "en";
    lang = (l === "en") ? "en" : "ko";
  }
  function currentTheme() { return document.documentElement.getAttribute("data-theme") || "dark"; }
  function setTheme(tm) {
    const v = (tm === "light") ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", v);
    try { localStorage.setItem("llmcalc.theme", v); } catch (e) {}
    updateToggles();
  }
  function initTheme() {
    let tm = null;
    try { tm = localStorage.getItem("llmcalc.theme"); } catch (e) {}
    if (!tm) tm = (root.matchMedia && root.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", (tm === "light") ? "light" : "dark");
  }

  root.I18N = { t, td, applyStatic, setLang, initLang, setTheme, initTheme, updateToggles, currentTheme,
    get lang() { return lang; } };
})(typeof self !== "undefined" ? self : this);
