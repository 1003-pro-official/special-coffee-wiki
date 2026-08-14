# GitHub 업로드 절차

이 저장소를 GitHub에 올리는 방법입니다. Windows PowerShell 기준입니다.

---

## 0. 먼저 폴더를 안전한 곳으로 옮기세요

**중요.** 지금 이 폴더는 Claude 세션 작업 폴더 안에 있습니다. 세션이 정리되면 사라질 수 있습니다.

```powershell
# 예: 문서 폴더 아래 projects로 옮김
$src = "$env:APPDATA\Claude\local-agent-mode-sessions\db21827a-61a8-440e-a1ec-5512d9653aa8\6ddf52ac-0325-49ec-97e9-358bdbb014e2\local_c7c425b1-b39f-4f6f-a49d-6b47989ea892\outputs\special-coffee-wiki"
$dst = "$env:USERPROFILE\Documents\projects"

New-Item -ItemType Directory -Force -Path $dst
Move-Item $src $dst

cd "$dst\special-coffee-wiki"
```

옮긴 뒤 파일이 다 있는지 확인합니다.

```powershell
Get-ChildItem -Recurse -File | Select-Object -ExpandProperty FullName
```

12개 파일이 나와야 합니다. (README, LICENSE 2종, .gitignore, .editorconfig, data 4종, docs 4종)

---

## 1. git 설치 확인

```powershell
git --version
```

없다면 <https://git-scm.com/download/win> 에서 설치하세요.

최초 1회 사용자 정보 설정이 필요합니다.

```powershell
git config --global user.name "1003"
git config --global user.email "1003pro.official@gmail.com"
```

---

## 2. 로컬 저장소 생성 및 첫 커밋

```powershell
git init -b main
git add .
git status                    # 올라갈 파일 확인 — logs/ 가 없어야 정상
git commit -m "Phase 0: 기획서, 디자인 시스템, 시드 데이터 4종"
```

`git status`에서 확인할 것: `.gitignore`가 `logs/`를 제외하고 있으므로
개인 브루잉 로그는 커밋에 포함되지 않습니다.

---

## 3. GitHub에 빈 저장소 만들기

### 방법 A — 웹 (권장, 설치 불필요)

1. <https://github.com/new> 접속
2. **Repository name**: `special-coffee-wiki`
3. **Description**: `브루잉 커피 학습 위키 — 장비별 레시피 변환, 실시간 추출 가이드, 브루잉 로그`
4. **Private** 선택
5. **Add a README file / .gitignore / license 는 모두 체크하지 않음**
   → 이미 로컬에 있습니다. 체크하면 첫 push가 충돌합니다.
6. `Create repository`

### 방법 B — GitHub CLI

```powershell
winget install --id GitHub.cli      # 미설치 시
gh auth login
gh repo create special-coffee-wiki --private --source=. --remote=origin --push
```

방법 B를 쓰면 4단계까지 한 번에 끝납니다.

---

## 4. 원격 연결 및 push

방법 A로 만들었다면 이어서 실행합니다. `1003pro`는 본인 GitHub 사용자명으로 바꾸세요.

```powershell
git remote add origin https://github.com/1003pro/special-coffee-wiki.git
git remote -v                 # 주소 확인
git push -u origin main
```

브라우저 인증 창이 뜨면 로그인하세요.
이후에는 `git push`만으로 올라갑니다.

---

## 5. 다음부터의 작업 흐름

```powershell
git add .
git commit -m "메시지"
git push
```

커밋 메시지 예시:

```
Phase 1a: 데이터 로딩 + 온보딩 3화면
data: 챔피언 레시피 2024 Wölfl 추가
fix: Kalita 레시피 도징 22g으로 정정
docs: 플레이버 휠 저작권 처리 방침 보강
```

---

## 6. 나중에 Public으로 전환할 때 확인할 것

Private → Public 전환은 저장소 `Settings` 최하단 `Danger Zone`에서 합니다.
전환 전에 아래를 점검하세요.

- [ ] `git log`에 개인 정보(이메일 외 실명, 주소 등)가 남아 있지 않은지
      — 커밋 히스토리는 Public 전환 후에도 전부 열립니다
- [ ] `logs/` 나 개인 브루잉 로그가 과거 커밋에 실수로 들어가 있지 않은지
      → `git log --all --full-history -- "logs/*"` 로 확인
- [ ] `README.md`의 저작권·라이선스 섹션이 최신인지
- [ ] 미완성 상태가 노출돼도 괜찮은 단계인지 (Phase 1 완료 후를 권장)

---

## 7. GitHub Pages 배포 (Public 전환 후)

정적 사이트이므로 빌드 설정 없이 바로 배포됩니다.

1. `Settings` → `Pages`
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / `/ (root)`
4. `Save`

몇 분 후 `https://1003pro.github.io/special-coffee-wiki/` 에서 열립니다.

**HTTPS가 필요한 이유** — 기획서 6.1절에서 정한 대로, 다음 기능이 모두 보안 컨텍스트를 요구합니다.

| 기능 | API |
|---|---|
| 추출 중 화면 꺼짐 방지 | Screen Wake Lock |
| 단계 전환 진동 알림 | Vibration |
| BLE 저울 연동 (Phase 4) | Web Bluetooth |

GitHub Pages는 HTTPS를 자동 제공하므로 별도 설정이 없습니다.

> 주의: Private 저장소의 Pages는 GitHub Pro 이상에서만 동작합니다.
> 무료 플랜이면 Public 전환 후에 Pages를 켜세요.
