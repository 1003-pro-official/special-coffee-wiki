# Special Coffee Wiki

브루잉 커피 학습자가 **자신의 장비와 원두를 입력하면** 검증된 레시피를 자기 장비 기준으로 변환받아,
실시간 가이드로 추출하고, 결과를 기록해 다음 잔을 개선하는 공개 브루잉 위키.

한국어 / English 지원 · 모바일 우선 · 로그인 없음

---

## 현재 상태

**Phase 0 (기획·데이터 설계) 완료** — 아직 애플리케이션 코드는 없습니다.

| 구분 | 상태 |
|---|---|
| 기획서 | 완료 — [`docs/01-project-plan.md`](docs/01-project-plan.md) |
| 디자인 시스템 | 완료 — [`docs/02-design-system.md`](docs/02-design-system.md) |
| 디자인 목업 | 완료 — [`docs/mockup.html`](docs/mockup.html) (브라우저로 열면 동작) |
| 시드 데이터 | 완료 — `data/` 4종 |
| 애플리케이션 | **미착수** — Phase 1a |

---

## 데이터

| 파일 | 내용 | 항목 수 |
|---|---|---|
| [`data/brewers.json`](data/brewers.json) | 드리퍼 카탈로그 | 17 |
| [`data/grinders.json`](data/grinders.json) | 그라인더 카탈로그 + 분쇄도 앵커 | 21 |
| [`data/flavor-nodes.json`](data/flavor-nodes.json) | 향미 용어 계층 (L1 9 · L2 28 · L3 46) | 83 |
| [`data/recipes.json`](data/recipes.json) | 표준 레시피 8 + 챔피언 1 | 9 |

미작성: `data/beans.json`, `data/i18n/{ko,en,terms}.json`

---

## 핵심 설계 두 가지

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
- [ ] **Phase 1a** — 데이터 로딩 + 온보딩 + i18n 구조
- [ ] **Phase 1b** — 추천 엔진 (스코어링 + 장비 변환)
- [ ] **Phase 1c** — 추출 가이드 (타이머 · 진동 · Wake Lock)
- [ ] **Phase 1d** — 브루잉 로그 (저장 + JSON 내보내기)
- [ ] **Phase 2** — 챔피언 레시피 아카이브 (12~15개)
- [ ] **Phase 3** — 플레이버 탐색 (드릴다운 휠)
- [ ] **Phase 4** — 분석 · 위키 문서 · BLE 저울 연동 검토

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
