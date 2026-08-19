# Special Coffee Wiki

브루잉 커피 학습자가 **자신의 장비와 원두를 입력하면** 검증된 레시피를 자기 장비 기준으로 변환받아,
실시간 가이드로 추출하고, 결과를 기록해 다음 잔을 개선하는 공개 브루잉 위키.

한국어 / English 지원 · 모바일 우선 · 로그인 없음

---

## 현재 상태

**Phase 4 완료** — 기획서에 적은 기능이 전부 동작합니다.

| 구분 | 상태 |
|---|---|
| 기획서 | 완료 — [`docs/01-project-plan.md`](docs/01-project-plan.md) |
| 디자인 시스템 | 완료 — [`docs/02-design-system.md`](docs/02-design-system.md) |
| 디자인 목업 | 완료 — [`docs/mockup.html`](docs/mockup.html) |
| 시드 데이터 | 완료 — `data/` 4종 + i18n 3종 |
| **앱 — 온보딩 · i18n** | **동작** |
| **앱 — 추천 엔진** | **동작** — `assets/engine.js` |
| **앱 — 추출 가이드** | **동작** — `assets/brew.js` |
| **앱 — 브루잉 로그** | **동작** — `assets/logs.js` |
| **앱 — 레시피 아카이브** | **동작** — 필터 · 세로 타임라인 |
| **앱 — 플레이버 탐색** | **동작** — `assets/flavor.js` |
| **앱 — 로그 분석** | **동작** — `assets/analysis.js` |
| **앱 — 위키 문서** | **동작** — 4편 |
| BLE 저울 연동 | **보류** — [검토 결과](docs/04-ble-scale-evaluation.md) |

---

## 실행

`fetch()`로 JSON을 읽으므로 **`file://`로 직접 열면 동작하지 않습니다.**
브라우저 보안 정책상 로컬 파일을 그렇게 읽을 수 없기 때문입니다.
(앱이 이 상황을 감지해 안내 화면을 띄웁니다.)

```bash
python -m http.server 8000
#  또는
npx serve .
```

브라우저에서 <http://localhost:8000> 을 엽니다.
같은 Wi-Fi의 폰에서 보려면 PC의 로컬 IP로 접속하세요 — 예: `http://192.168.0.10:8000`

---

## 구조

```
index.html              앱 셸
assets/
  ├─ style.css          디자인 토큰 + 컴포넌트
  ├─ engine.js          Grind · Score · Convert · Engine  (DOM 의존 없음)
  ├─ brew.js            BrewPlan · Alerts · WakeLock · BrewSession
  ├─ logs.js            LogEntry · LogStore
  ├─ flavor.js          FlavorTree · Wheel
  ├─ analysis.js        Extraction · Analysis · Chart
  └─ app.js             Store · I18n · Data · App        (화면·이벤트)
data/
  ├─ brewers.json       드리퍼 17
  ├─ grinders.json      그라인더 21 + 앵커
  ├─ flavor-nodes.json  향미 용어 83
  ├─ recipes.json       레시피 15
  ├─ beans.json         원두 프로파일 16
  ├─ wiki.json          위키 문서 4편
  └─ i18n/
      ├─ ko.json        UI 문자열 (한국어)
      ├─ en.json        UI 문자열 (영어)
      └─ terms.json     열거형 코드 → 표시명 사전
test/
  ├─ engine.test.mjs    추천 엔진 43건
  ├─ brew.test.mjs      추출 타임라인 44건
  ├─ logs.test.mjs      로그 저장 · 내보내기 44건
  ├─ flavor.test.mjs    향미 계층 · 휠 좌표 41건
  ├─ analysis.test.mjs  수율 · 시계열 · 차트 59건
  └─ ui.smoke.mjs       화면 렌더 · 전체 루프 90건
docs/                   기획서 · 디자인 시스템 · 업로드 절차 · BLE 검토 · 목업
```

### 테스트

```bash
node test/engine.test.mjs   # 추천 엔진 43건
node test/brew.test.mjs     # 추출 타임라인 44건
node test/logs.test.mjs     # 로그 저장 · 내보내기 44건
node test/flavor.test.mjs   # 향미 계층 · 휠 좌표 41건
node test/analysis.test.mjs # 수율 · 시계열 · 차트 59건
node test/ui.smoke.mjs      # 화면 렌더 · 전체 루프 90건
```

`engine.js`와 `brew.js`에는 DOM 의존이 없어 Node에서 그대로 돌아갑니다.
실제 `data/*.json`을 읽어 검증하므로, 데이터를 고치면 테스트가 먼저 깨집니다.
`ui.smoke.mjs`는 브라우저 API를 최소한으로 흉내내 화면 함수와 타이머를 돌립니다.

---

## 데이터

| 파일 | 내용 | 항목 수 |
|---|---|---|
| [`data/brewers.json`](data/brewers.json) | 드리퍼 카탈로그 | 17 |
| [`data/grinders.json`](data/grinders.json) | 그라인더 카탈로그 + 분쇄도 앵커 | 21 |
| [`data/flavor-nodes.json`](data/flavor-nodes.json) | 향미 용어 계층 (L1 9 · L2 28 · L3 46) | 83 |
| [`data/recipes.json`](data/recipes.json) | 표준 8 + 챔피언 7 (2018~2025) | 15 |
| [`data/beans.json`](data/beans.json) | 산지 프로파일 | 16 |
| [`data/wiki.json`](data/wiki.json) | 위키 문서 | 4편 |
| [`data/i18n/ko.json`](data/i18n/ko.json) · [`en.json`](data/i18n/en.json) | UI 문자열 | 각 306 |
| [`data/i18n/terms.json`](data/i18n/terms.json) | 열거형 코드 사전 | 14종 |


---

## 핵심 설계 여덟 가지

### 1. 분쇄도 — 마이크론이 아니라 앵커 + 밴드

그라인더 간 분쇄도를 마이크론으로 환산하는 방식은 작동하지 않습니다.
버 형상(코니컬/플랫), 버 직경, 정렬 상태, 제로 포인트 설정 방식이 모두 달라
**같은 800µm이 같은 입도 분포를 뜻하지 않습니다.**

대신 각 그라인더의 **"V60 표준 세팅"을 앵커(밴드 0)** 로 잡고,
레시피는 앵커로부터의 **상대 오프셋(밴드)** 으로 저장합니다.

```
레시피가 "+2 밴드"일 때

Comandante C40    앵커 25 + 2×2 = 29 클릭
Timemore C3       앵커 20 + 2×2 = 24 클릭
1Zpresso J-Max    앵커 90 + 2×7 = 104 클릭
Fellow Ode Gen2   앵커 4  + 2×1 = 6 번
```

카탈로그에 없는 그라인더도 사용자가 자기 앵커만 입력하면 전부 지원됩니다.
**카탈로그 완성도에 의존하지 않는 것**이 이 방식의 핵심 이점입니다.

### 2. 로그인을 만들지 않는다

공개 사이트에 브루잉 로그가 있으면 보통 회원가입을 붙이게 되지만, 여기서는 의도적으로 안 합니다.

- 회원가입 장벽이 로그 작성률을 죽입니다. 로그의 가치는 "쉽게 남길 수 있음"에서 나옵니다
- 서버·DB·인증·개인정보처리방침이 전부 따라옵니다
- 대신 **localStorage + JSON 내보내기/불러오기**를 눈에 띄는 곳에 둡니다

### 3. 추천은 규칙 기반이고, 점수와 적합도를 분리한다

ML이 아니라 100점 가중 스코어입니다. **추천 근거를 화면에 설명할 수 있어야 공부가 되기 때문**입니다.

| 항목 | 배점 |
|---|---|
| 드리퍼 적합도 | 30 |
| 로스팅 정도 근접 | 20 |
| 프로세스 · 향미 | 20 |
| 목표 일치 | 15 |
| 난이도 적합 | 10 |
| 출처 검증 | 5 |

**점수만 보여주면 오해가 생깁니다.** 난이도 항목이 쉬운 레시피 모두에게 10점을 주고
드리퍼도 같은 geometry면 16점을 주기 때문에, 전혀 맞지 않는 레시피도 40점대가 나옵니다.

그래서 점수는 **순위를 매기기 위한 상대값**으로만 쓰고,
절대적인 적합 여부는 `Score.fit()`이 따로 판정합니다.
로스팅 정도가 2단계 이상 벌어지고 향미·목표가 하나도 안 맞으면 `mismatch`로 분류해
목록 아래쪽에 "조건에 맞지 않는 레시피"로 분리하고, 40점대를 '그럭저럭'으로 읽지 않게 합니다.

### 4. 타이머는 절대 시각으로 잰다

경과 시간을 `requestAnimationFrame` 누적으로 재면, 탭이 백그라운드로 갔다 오는 동안
프레임이 멈춰 시간이 어긋납니다. 추출 중에 알림을 확인하려고 다른 앱을 열기만 해도 틀어집니다.

그래서 `BrewSession`은 `Date.now()` 기준으로만 경과를 계산합니다.
rAF는 화면을 다시 그리는 용도로만 씁니다.

타이머 화면은 **매 프레임 `innerHTML`을 다시 만들지 않습니다.**
한 번 그린 뒤 `paintBrew()`가 바뀐 노드의 textContent만 갱신합니다.

### 5. 로그는 설정과 다른 키에 저장한다

`scw.settings`와 `scw.logs`를 분리했습니다.
로그는 계속 늘어나고 설정은 거의 안 늘어납니다. 한 키에 같이 두면
용량이 찼을 때 **장비 설정까지 함께 날아갑니다.**

로그에는 그 시점의 파라미터를 통째로 스냅숏해 둡니다.
`recipes.json`을 나중에 고쳐도 과거 기록의 의미가 변하면 안 되기 때문입니다.

읽기에 실패해도 기존 데이터를 지우지 않습니다.
빈 목록을 반환하되 원본은 남겨 수동 복구 여지를 둡니다.

**`next_action` 한 줄이 학습 루프를 닫습니다.**
"다음엔 온도 1도 낮추기"를 적어두면, 같은 레시피나 같은 로스팅 정도로
다시 추출할 때 타이머 화면 맨 위에 자동으로 뜹니다.

### 6. 원두는 '산지 프로파일'부터 채운다

`beans.json`에 특정 로스터의 제품을 임의로 만들어 넣으면
**없는 컵노트와 없는 점수를 지어내게 됩니다.**

그래서 산지 수준의 일반 프로파일 16종만 담았습니다.
"에티오피아 내추럴은 대체로 이런 향이 난다" 정도는 사실이고,
브루잉 힌트도 고도·가공·품종처럼 구조적 특성에서 나오는 것만 적었습니다.

실제로 마신 원두는 `entry_type: "actual"`로 하나씩 추가하는 것이 맞습니다.

**향미 매칭은 계층을 따릅니다.** `fruity`를 고르면
`fruity.berry.blueberry`를 가진 원두도 걸립니다.
id가 점 경로라 문자열 비교만으로 조상 판별이 되지만,
`sweet`가 `sweetened`를 잡지 않도록 경계(`.`)를 확인합니다.

### 7. 측정 장비가 없어도 막히지 않게 한다

TDS 미터, BLE 저울 같은 장비는 정밀도를 올려주지만 **없다고 기능이 막히면 안 됩니다.**

- TDS와 추출량은 선택 입력입니다. 비워두면 나머지는 그대로 동작합니다
- 추출량을 안 재면 `물량 − 도징 × 2`로 추정합니다
- 수율 차트는 y축을 늘려 18~22% 기준선이 **항상 보이게** 합니다
  내 수율이 전부 17%대일 때 기준선이 화면 밖으로 나가면
  "적정 구간 아래에 있다"는 가장 중요한 정보가 사라집니다

BLE 저울 연동은 같은 원칙으로 검토했고, **지금은 만들지 않기로 했습니다.**
Safari가 Web Bluetooth를 지원하지 않아 아이폰에서 쓸 수 없고,
저울마다 프로토콜이 달라 한 종을 지원하는 것이 그 저울 전용 코드를 쓰는 일이며,
무엇보다 실기기 없이 작성한 코드를 추출 가이드에 넣을 수 없기 때문입니다.
자세한 내용은 [BLE 검토 문서](docs/04-ble-scale-evaluation.md)에 있습니다.

### 8. 다국어 — 번역 비용을 3층으로 나눈다

전부 번역하려 들면 프로젝트가 무너집니다. 층별로 비용이 다릅니다.

| 층 | 대상 | 비용 | 처리 |
|---|---|---|---|
| UI 문자열 | 버튼·라벨 약 75개 | 낮음, 1회 | `data/i18n/{ko,en}.json` |
| 열거형 | 프로세스·재질·유속 등 14종 | 낮음, 1회 | `data/i18n/terms.json` |
| 서술형 | 해설, 코치 노트, 위키 문서 | **높음, 계속 증가** | **폴백 허용** |

서술형은 `{ ko, en, source_lang }` 구조이고, 번역이 없으면 **원문을 그대로 보여주고 배지로 표시**합니다.
번역 완료를 기다리면 영어판이 영원히 안 나오기 때문입니다.
기계번역을 자동으로 채우지는 않습니다 — 커피 용어에서 자주 틀리고, 틀린 해설은 없느니만 못합니다.

또한 데이터에는 **한글을 직접 박지 않고 코드만 저장**합니다.
`process: "natural"` 하나만 두면 표시명은 사전 한 곳에서 해결되고, 언어를 추가할 때 데이터를 손대지 않아도 됩니다.

---

## 수록 챔피언 레시피

| 연도 | 챔피언 | 국가 | 드리퍼 | 특징 |
|---|---|---|---|---|
| 2025 | George Peng | China | Solo Dripper | 3종 로스트 블렌딩 · 40ppm 저미네랄 물 |
| 2024 | Martin Wölfl | Austria | Orea V4 | Sibarist FAST 필터 · 2분 내 전량 투입 |
| 2023 | Carlos Medina | Chile | Origami | 50g씩 5회, 30초 고정 리듬 |
| 2022 | Shih Yuan Hsu | Taiwan | Orea + Kalita 필터 | 두 분쇄도 혼합 · 70 → 95 °C |
| 2021 | Matt Winton | Switzerland | V60 | 주전자 2개 · 93 → 88 °C |
| 2019 | Du Jianing | China | Origami | 이중 분쇄 + 채프 제거 · 총 1:40 |
| 2018 | Emi Fukahori | Switzerland | Hario Switch | 침지 → 투과 · 80 → 95 → 80 °C |

**단계별 온도**를 쓰는 레시피가 셋(2018 · 2021 · 2022)이라 `steps[].temp_c`를 선택 필드로 추가했습니다.
화면에서는 **직전 단계와 온도가 달라질 때만** 배지를 띄웁니다. 매 줄에 붙이면 정보가 아니라 소음이 됩니다.

파라미터는 전부 출처를 대조했고, 출처에 없어 추정한 값(푸어 간격, 드로우다운 종료 시각 등)은
각 레시피의 `verify_note`에 무엇을 추정했는지 남겼습니다.

---

## 저작권

### SCA Coffee Taster's Flavor Wheel

`data/flavor-nodes.json`은 **SCA 공식 휠 이미지를 복제하거나 변형한 것이 아닙니다.**

SCA 휠은 [CC BY-NC-ND 4.0](https://sca.coffee/research/coffee-tasters-flavor-wheel)이며
**ND(변형 금지)** 조항이 있어 공식 이미지의 가공·재배포가 허용되지 않습니다.

이 저장소는 World Coffee Research Sensory Lexicon과 SCA 휠이 사용하는 **향미 용어 계층만 참고**해
자체 구조를 구성했고, **색상 팔레트는 공식 팔레트를 쓰지 않고 새로 정의**했습니다.

> Terminology referenced from the Specialty Coffee Association and World Coffee Research.

### 레시피

레시피의 **파라미터(숫자)는 사실 정보**이므로 사용 가능합니다.
원문 기사 본문은 옮기지 않았으며, 각 레시피에 `source_urls`로 출처를 답니다.
해설(`curator_commentary`)은 직접 작성합니다.

---

## 라이선스

이 저장소는 두 개의 라이선스를 씁니다.

| 대상 | 라이선스 |
|---|---|
| 소스 코드 (HTML · CSS · JS) | [MIT](LICENSE) |
| 콘텐츠 · 데이터 (문서, 큐레이션 데이터, 해설) | [CC BY-NC-SA 4.0](LICENSE-CONTENT) |

레시피 파라미터 등 사실 정보 자체에는 저작권이 미치지 않습니다.
위 CC 라이선스는 이 저장소의 **선별·구성·서술**에 적용됩니다.

---

## 로드맵

- [x] **Phase 0** — 기획, 디자인 시스템, 시드 데이터
- [x] **Phase 1a** — 데이터 로딩 + 온보딩 + i18n 구조
- [x] **Phase 1b** — 추천 엔진 (스코어링 + 장비 변환)
- [x] **Phase 1c** — 추출 가이드 (타이머 · 진동 · Wake Lock)
- [x] **Phase 1d** — 브루잉 로그 (저장 + JSON 내보내기)
- [x] **Phase 2** — 챔피언 레시피 아카이브 (15종)
- [x] **Phase 3** — 플레이버 탐색 (드릴다운 휠)
- [x] **Phase 4** — 분석 · 위키 문서 · BLE 저울 연동 검토

자세한 내용은 [기획서 7절](docs/01-project-plan.md)을 보세요.

---

## 목업 실행

```bash
# 저장소를 받은 뒤
open docs/mockup.html          # macOS
start docs\mockup.html         # Windows
```

빌드 도구가 필요 없습니다. 상단 조작부에서 화면 전환 · 한/영 · 라이트/다크 · 폰/PC 폭을 바꿀 수 있고,
추출 가이드 화면의 타이머는 실제로 동작합니다.
