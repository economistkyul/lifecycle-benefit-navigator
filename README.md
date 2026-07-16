# 국민 생애주기 혜택 내비게이터 (DEMO v3.9)

태어나는 순간부터 노년까지 — 나이·성별·소득·거주지역·장애·보훈·병역 등 조건을 선택하면
받을 수 있는 정부 혜택과 연간 수혜 범위를 한 화면에서 보여주는 프로토타입입니다.

- 18개 부처 '26년 열린재정 세부사업 6,200여 개 분석, 국민 직접수혜 112개 사업 수록
- 개인·가구 / 사업주·창업·기업 두 가지 모드
- ⚠️ 정책 구상용 데모입니다. 일부 단가·요건은 예시이며 실제 수급 여부와 다를 수 있습니다.

## 로컬 실행
```bash
npm install
npm run dev
```
브라우저에서 http://localhost:5173 접속

## GitHub에 올리기
```bash
git init
git add .
git commit -m "생애주기 혜택 내비게이터 DEMO v3.9"
# GitHub에서 새 저장소(repository) 만든 뒤:
git remote add origin https://github.com/<아이디>/<저장소이름>.git
git push -u origin main
```

## 배포 (Vercel, 무료)
1. https://vercel.com 에서 GitHub 계정으로 로그인
2. "Add New Project" → 방금 올린 저장소 선택
3. Framework가 Vite로 자동 인식됨 → Deploy 클릭
4. 1분 내 `https://<프로젝트명>.vercel.app` 주소 발급 — 이 링크를 공유하면 됩니다

## 데이터 출처
- 예산액: 기획재정부 열린재정 '26년 세부사업 자료
- 기준중위소득·기초연금·생계급여: '26년 보건복지부 확정 고시

## 저장소 구조
```
src/LifecycleBenefitNavigator.jsx  화면·데이터 (단일 컴포넌트)
src/live-budgets.json              자동 갱신된 예산액 (봇이 커밋)
data/budget-map.json               사업 id ↔ 열린재정 세부사업명 매칭 규칙 (30개)
data/raw/                          열린재정 파일 투입구 (xlsx·json·tsv·csv)
data/budget-update-report.json     갱신 실행 보고서 (매칭·오류 내역)
scripts/update-budgets.mjs         예산 갱신 스크립트
scripts/validate-data.mjs          데이터 무결성 검증 (npm run validate:data)
```
- 수록 사업 수·검증(src:true) 사업 수는 화면 상단 배너에서 자동 계산되어 표시됩니다.
- 자동갱신 연결(=budget-map 매핑) 사업은 30개이며, 나머지는 수기 검증값으로 관리됩니다.

## 예산액 자동 갱신
- `data/raw/` 폴더에 열린재정 엑셀을 올리면(깃허브 웹에서 드래그) GitHub Actions가 자동으로 예산액을 다시 계산해 반영합니다.
- 열린재정 OpenAPI 인증키가 있으면: 저장소 Settings → Secrets and variables → Actions → New repository secret → 이름 `OPENFISCAL_KEY` 로 등록 → 매월 1일 완전 자동 갱신.
- 매칭 규칙: `data/budget-map.json` (사업 id ↔ 세부사업명)
