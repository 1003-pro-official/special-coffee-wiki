# 폰에서 보기 & 배포하기

두 가지 방법이 있습니다.

| | 로컬 서버 | GitHub Pages |
|---|---|---|
| PC 필요 | **켜져 있어야 함** | 불필요 |
| 네트워크 | 같은 Wi-Fi만 | 어디서나 (LTE 포함) |
| 준비 | 명령어 한 줄 | 최초 설정 5분 |
| 저장소 공개 | 불필요 | **Public이어야 함** (무료 플랜) |

**일단 로컬로 써보시고, 괜찮으면 Pages로 넘어가는 순서**를 권합니다.

---

## 방법 1 — 로컬 서버 (지금 바로)

### 1. 서버 켜기

PowerShell을 열고 (시작 메뉴에서 `powershell` 검색) 아래를 붙여넣습니다.

```powershell
cd $env:USERPROFILE\Documents\projects\special-coffee-wiki
python -m http.server 8000 --bind 0.0.0.0
```

`Serving HTTP on 0.0.0.0 port 8000` 이 뜨면 켜진 것입니다.
**이 창을 닫으면 서버도 꺼집니다.** 쓰는 동안 열어두세요.

### 2. 이 PC의 주소 확인

주소는 공유기를 바꾸거나 재부팅하면 달라질 수 있습니다. 확인하려면 새 PowerShell 창에서:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' }).IPAddress
```

`192.168.0.5` 처럼 나옵니다.

> **주의** — `100.x.x.x` 로 시작하는 주소가 같이 나올 수 있습니다.
> 그건 Tailscale 같은 VPN의 가상 주소라 일반 Wi-Fi에서는 안 됩니다.
> **`192.168.` 로 시작하는 것**을 쓰세요.

### 3. 폰에서 접속

폰 브라우저 주소창에 입력합니다.

```
http://192.168.0.5:8000
```

홈 화면에 추가해두면 앱처럼 쓸 수 있습니다.
Safari는 공유 → "홈 화면에 추가", Chrome은 ⋮ → "홈 화면에 추가".

### 안 될 때

| 증상 | 원인 | 해결 |
|---|---|---|
| 페이지가 안 열림 | 폰이 다른 네트워크 | 폰 Wi-Fi가 PC와 같은 공유기인지 확인. LTE는 안 됨 |
| 계속 로딩만 됨 | 서버 꺼짐 | PowerShell 창이 살아 있는지 확인 |
| 연결 거부 | 방화벽 차단 | 아래 명령을 **관리자 권한** PowerShell에서 실행 |
| 주소가 틀림 | VPN 주소 사용 | `192.168.`로 시작하는 주소인지 확인 |

방화벽을 여는 명령입니다. 시작 메뉴에서 PowerShell을 **오른쪽 클릭 → 관리자 권한으로 실행** 후:

```powershell
New-NetFirewallRule -DisplayName "Coffee Wiki 8000" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

---

## 방법 2 — GitHub Pages (PC 없이)

한 번 설정하면 **PC를 꺼도, LTE로도** 열립니다.

### 전제 — 저장소를 Public으로 바꿔야 합니다

GitHub 무료 플랜에서는 **Private 저장소의 Pages가 동작하지 않습니다.**
Pro 이상이면 Private으로도 가능합니다.

공개 전 점검은 이미 마쳤습니다. 개인 브루잉 로그도, 비밀정보도 커밋에 없습니다.
다만 **커밋 작성자 이메일이 공개**된다는 점만 알아두세요.

### 1단계 — Public으로 전환

1. <https://github.com/1003-pro-official/special-coffee-wiki> 접속
2. 상단 메뉴에서 **Settings** 클릭 (톱니바퀴 아이콘)
3. 페이지를 **맨 아래까지** 스크롤 → 빨간 테두리의 **Danger Zone**
4. `Change repository visibility` 옆 **Change visibility** 버튼
5. **Make public** 선택
6. 확인 문구로 `1003-pro-official/special-coffee-wiki` 를 그대로 입력
7. `I understand, change repository visibility` 클릭

### 2단계 — Pages 켜기

1. 같은 **Settings** 안에서, 왼쪽 사이드바의 **Pages** 클릭
2. **Source** 를 `Deploy from a branch` 로 둡니다
3. **Branch** 에서
   - 왼쪽 드롭다운: `main`
   - 오른쪽 드롭다운: `/ (root)`
4. **Save** 클릭

### 3단계 — 기다리기

1~3분 뒤 같은 Pages 화면 위쪽에 초록 체크와 함께 주소가 뜹니다.

```
https://1003-pro-official.github.io/special-coffee-wiki/
```

이 주소를 폰에서 열고 홈 화면에 추가하면 끝입니다.

배포 진행 상황은 저장소 상단의 **Actions** 탭에서 볼 수 있습니다.

### 이후 업데이트

코드를 고치고 push하면 **1~2분 뒤 자동으로 반영**됩니다. 따로 할 일이 없습니다.

```powershell
cd $env:USERPROFILE\Documents\projects\special-coffee-wiki
git add .
git commit -m "메시지"
git push
```

---

## HTTPS가 왜 중요한가

GitHub Pages는 HTTPS를 자동으로 붙여줍니다. 이게 없으면 아래 기능이 동작하지 않습니다.

| 기능 | 필요한 API |
|---|---|
| 추출 중 화면 꺼짐 방지 | Screen Wake Lock |
| 단계 전환 진동 | Vibration |
| BLE 저울 연동 (검토 중) | Web Bluetooth |

로컬 서버(`http://192.168.0.5:8000`)는 HTTPS가 아니라서 **화면 꺼짐 방지가 동작하지 않을 수 있습니다.**
`localhost`는 예외로 허용되지만 IP 주소로 접속하면 보안 컨텍스트가 아니기 때문입니다.

즉 **추출 가이드를 제대로 쓰려면 Pages 배포가 필요합니다.**

---

## 브루잉 기록은 어떻게 되나

기록은 브라우저마다 따로 저장됩니다. **PC와 폰의 기록은 서로 공유되지 않습니다.**
로컬 서버로 보던 것과 Pages로 보는 것도 주소가 달라 별개로 취급됩니다.

폰에서 쓰기로 하셨다면 **폰에서만 기록**하시는 편이 헷갈리지 않습니다.

기록 탭의 **내보내기**로 JSON 파일을 받아두면 기기를 옮길 때 **불러오기**로 복원할 수 있습니다.
같은 파일을 두 번 불러와도 중복되지 않습니다.
