import { useState, useMemo, useEffect } from "react";

/* ─────────────────────────────────────────────
   국민 생애주기 혜택 내비게이터 (버전은 화면 DEMO 배지가 기준 · 아래 변경이력은 초기 기록)
   v0.4 변경점
   ① 성별 선택 추가 (성별 요건 사업 반영: 임신·출산, 여성청소년 등)
   ② 장애 정도 선택 추가 — '19년 등급제(1~6급) 폐지로
      현행 법정 구분인 [심한 장애(중증) / 심하지 않은 장애(경증)] 2단계 적용
      → 장애인연금(중증), 장애수당(경증), 활동지원(공통) 구분 반영
   ※ 금액·예산은 데모용 예시 수치 (실제와 다를 수 있음)
──────────────────────────────────────────── */

const STAGES = [
  { id: "infant", name: "영유아", min: 0, max: 5, color: "#4E8FD1" },
  { id: "child", name: "아동·청소년", min: 6, max: 18, color: "#3E9E74" },
  { id: "youth", name: "청년", min: 19, max: 34, color: "#DBA53A" },
  { id: "prime", name: "중년", min: 35, max: 49, color: "#CE6B47" },
  { id: "middle", name: "장년", min: 50, max: 64, color: "#8C5F52" },
  { id: "senior", name: "노년", min: 65, max: 100, color: "#96588B" },
];

const MEDIAN_BASE = [256, 420, 536, 649, 756]; /* '26년 기준중위소득 확정(월, 만원): 1인 2,564,238 ~ 5인 7,556,719원, 복지부 고시 */

const INCOME_LEVELS = [
  { id: "basic", label: "기초생활수급", rank: 0, ratio: 0.4 },
  { id: "nearPoor", label: "차상위", rank: 1, ratio: 0.5 },
  { id: "mid50", label: "중위 50% 이하", rank: 2, ratio: 0.5 },
  { id: "mid100", label: "중위 100% 이하", rank: 3, ratio: 1.0 },
  { id: "mid150", label: "중위 150% 이하", rank: 4, ratio: 1.5 },
  { id: "above", label: "그 이상", rank: 5, ratio: null },
  { id: "unknown", label: "잘 모르겠어요", rank: 3, ratio: null },
];

/* 직업: 혜택 체계가 별도로 존재하는 직업만 선택지로 제공 — 그 외는 '해당 없음(기타)' */
const JOBS = [
  { id: "none", label: "해당 없음 · 기타" },
  { id: "farmer", label: "농업인" },
  { id: "fisher", label: "어업인" },
  { id: "forester", label: "임업인" },
  { id: "artist", label: "문화예술인" },
  { id: "biz", label: "자영업·소상공인" },
];
const JOB_TAG = { farmer: "농업인", fisher: "어업인", forester: "임업인", artist: "예술인" };

const TAG_GROUPS = [
  { group: "가족·양육", items: ["임신 중", "자녀 양육", "한부모", "다자녀"] },
  { group: "일·배움", items: ["대학(원) 재학", "재직 중", "구직 중"] },
  { group: "주거", items: ["무주택", "전세사기 피해"] },
  { group: "특별 대상", items: ["자립준비청년(보호종료)", "북한이탈주민", "이산가족", "다문화가족", "재외동포", "출소(예정)자", "범죄 피해자"] },
];

const BIZ_SIZES = ["예비창업자", "소상공인", "중소기업", "중견기업", "대기업"];
const BIZ_TAGS = ["창업 준비·7년 이내", "폐업·재기 준비", "수출 희망", "청년·고령자 채용 계획", "장애인 고용", "디지털·스마트 전환"];

const REGIONS = [
  { id: "metro", label: "수도권" },
  { id: "nonmetro", label: "비수도권" },
  { id: "shrink", label: "인구감소지역(89곳)" },
];

const MIL_LEVELS = [
  { id: "none", label: "해당 없음" },
  { id: "enlisted", label: "병 복무 중" },
  { id: "officer", label: "간부(직업군인)" },
  { id: "reserve", label: "예비군" },
];

const VET_LEVELS = [
  { id: "none", label: "해당 없음" },
  { id: "self", label: "국가유공자 본인" },
  { id: "family", label: "유공자 유족·가족" },
];

const DISABILITY_LEVELS = [
  { id: "none", label: "해당 없음" },
  { id: "mild", label: "심하지 않은 장애 (경증)" },
  { id: "severe", label: "심한 장애 (중증)" },
];

const PORTAL = { 복지로: "https://www.bokjiro.go.kr", 고용24: "https://www.work24.go.kr", 한국장학재단: "https://www.kosaf.go.kr", 홈택스: "https://www.hometax.go.kr", 정부24: "https://www.gov.kr" };

/* gender: "F"|"M" 요건 / disability: "mild"|"severe"|"any" 요건
   vtype: cash 현금 | voucher 바우처 | service 서비스 | loan 융자
   valMin/valMax: 연간 환산 수혜액 범위(만원, 예시) — cash·voucher만 합산 */
const BENEFITS = [
  { id: 1, name: "임신·출산 진료비 지원(국민행복카드)", ministry: "보건복지부", ageMin: 15, ageMax: 49, incomeCap: 5, gender: "F", reqTags: ["임신 중"], vtype: "voucher", valMin: 100, valMax: 140, valNote: "일시금", amount: "100만원 바우처", desc: "임신·출산 관련 진료비를 바우처로 지원", channel: "복지로·건보공단", portal: "복지로", budget: "건강보험 재정", law: "국민건강보험법", brackets: [["단태아", "100만원"], ["다태아", "140만원 이상(태아 수별 가산)"], ["분만취약지 거주", "20만원 추가"]] },
  { id: 2, name: "산모·신생아 건강관리 지원", ministry: "보건복지부", ageMin: 15, ageMax: 49, incomeCap: 4, gender: "F", reqTags: ["임신 중"], vtype: "service", valMin: 100, valMax: 250, amount: "건강관리사 방문 서비스", desc: "출산 가정에 건강관리사 파견 (출산 전후 신청)", channel: "복지로", portal: "복지로", budget: "약 1,300억원(예시)", law: "모자보건법", brackets: [["서비스 기간", "5~25일 (태아 수·출산 순위별)"], ["본인부담", "소득구간별 차등"]] },
  { id: 3, name: "첫만남이용권", ageTarget: "child", ministry: "보건복지부", ageMin: 0, ageMax: 0, incomeCap: 5, vtype: "voucher", valMin: 200, valMax: 300, valNote: "일시금", amount: "200~300만원 바우처", desc: "출생아 1인당 바우처 지급", channel: "복지로·행정복지센터", portal: "복지로", budget: "4,111억원 ('26 열린재정·2-1 검증)", src: true, law: "저출산·고령사회기본법 제10조③", brackets: [["첫째", "200만원"], ["둘째 이상", "300만원"]] },
  { id: 4, name: "부모급여", excl: "infantCare", ageTarget: "child", ministry: "보건복지부", ageMin: 0, ageMax: 1, incomeCap: 5, vtype: "cash", valMin: 600, valMax: 1200, amount: "월 50~100만원", desc: "영아 양육가구 현금 지원", channel: "복지로", portal: "복지로", budget: "2조 3,726억원 ('26 열린재정)", src: true, law: "아동수당법", brackets: [["0세", "월 100만원"], ["1세", "월 50만원"], ["어린이집 이용 시", "보육료 차감 후 차액 지급"]] },
  { id: 5, name: "아동수당", ageTarget: "child", ministry: "보건복지부", ageMin: 0, ageMax: 8, incomeCap: 5, vtype: "cash", valMin: 120, valMax: 156, amount: "월 10만~13만원 (지역별)", desc: "'26년 만 9세 미만으로 확대 — 매년 1세씩 늘어 '30년 12세까지", channel: "복지로", portal: "복지로", budget: "2조 4,822억원 ('26 열린재정 · 지역차등 산식 2-1 검증)", src: true, law: "아동수당법 ('26.1월 개정)", brackets: [["연령", "만 9세 미만 (매년 1세씩 확대 → '30년 만 12세)"], ["수도권", "월 10만원"], ["비수도권", "월 10.5만원 ('26 한시 가산)"], ["인구감소 우대·특별지역", "월 11만~12만원 ('26 한시 가산)"], ["인구감소지역 상품권 수령 시", "월 최대 13만원 (지자체별)"]] },
  { id: 6, name: "보육료·유아학비 지원", excl: "infantCare", ageTarget: "child", ministry: "교육부(유보통합)", ageMin: 0, ageMax: 5, incomeCap: 5, vtype: "voucher", valMin: 240, valMax: 400, amount: "어린이집·유치원 이용료", desc: "누리과정 등 보육·교육비 지원 (5세 무상교육 단계 확대)", channel: "복지로", portal: "복지로", budget: "6조 5,090억원 ('26 열린재정, 영유아특별회계 보육료+유아교육비)", src: true, law: "유아교육법·영유아보육법", brackets: [["3~5세 누리과정", "월 28만원 수준(예시)"], ["0~2세 보육료", "연령별 차등 단가"]] },
  { id: 7, name: "교육급여", ministry: "교육부", ageMin: 6, ageMax: 18, incomeCap: 0, vtype: "cash", valMin: 49, valMax: 77, amount: "연 교육활동지원비", desc: "저소득 초·중·고 학생 교육비", channel: "복지로·교육청", portal: "복지로", budget: "1,711억원 ('26 열린재정)", src: true, law: "국민기초생활보장법", brackets: [["초등학생", "연 52만원 수준 ('26, 평균 6% 인상)"], ["중학생", "연 72만원 수준 ('26)"], ["고등학생", "연 81만원 수준 ('26) + 교과서·입학금"]] },
  { id: 8, name: "초중고 교육비 지원", ministry: "교육부·교육청", ageMin: 6, ageMax: 18, incomeCap: 2, vtype: "voucher", valMin: 30, valMax: 100, amount: "방과후수강권·급식비 등", desc: "시도교육청별 저소득 학생 지원", channel: "교육비원클릭", portal: "정부24", budget: "지방교육재정", law: "초·중등교육법", brackets: [["방과후 자유수강권", "연 60만원 내외(시도별 상이)"], ["급식비·정보화지원", "실비 지원"]] },
  { id: 9, name: "여성청소년 생리용품 바우처", ministry: "성평등가족부", ageMin: 9, ageMax: 24, incomeCap: 1, gender: "F", vtype: "voucher", valMin: 17, valMax: 17, amount: "월 1.4만원 바우처", desc: "저소득 여성청소년 보건위생물품 지원", channel: "복지로·지자체", portal: "복지로", budget: "166억원 ('26 열린재정)", src: true, law: "청소년복지 지원법", brackets: [["9~24세 저소득 여성청소년", "월 1.4만원 수준(예시)"]] },
  { id: 10, name: "청소년 특별지원", ministry: "성평등가족부", ageMin: 9, ageMax: 24, incomeCap: 3, vtype: "cash", valMin: 100, valMax: 780, amount: "생활·건강·학업지원비", desc: "위기 청소년 맞춤 지원", channel: "지자체·청소년상담센터", portal: "정부24", budget: "청소년 사회안전망구축 744억원 내 ('26 열린재정)", src: true, law: "청소년복지 지원법", brackets: [["생활지원", "월 최대 65만원"], ["건강·학업·자립지원", "항목별 한도 내 실비"]] },
  { id: 11, name: "국가장학금(Ⅰ·Ⅱ유형)", excl: "scholarship", ministry: "교육부", ageMin: 19, ageMax: 39, incomeCap: 4, reqTags: ["대학(원) 재학"], vtype: "voucher", valMin: 100, valMax: 700, amount: "소득구간별 등록금 지원", desc: "대학 등록금 부담 경감", channel: "한국장학재단", portal: "한국장학재단", budget: "맞춤형 국가장학금 지원 5조 1,161억원 ('26 열린재정 + 사업설명자료 검증)", src: true, law: "한국장학재단 설립 등에 관한 법률", brackets: [["기초·차상위", "등록금 전액"], ["1~3구간", "연 600만원 ('26 확정, +30)"], ["4~6구간", "연 440만원 ('26 확정, +20)"], ["7~8구간", "연 360만원 ('26 확정, +10)"], ["9구간", "연 100만원"], ["다자녀 첫째·둘째", "구간별 연 610·505·465만원 ('26 확정)"], ["다자녀 셋째 이상", "등록금 전액"]] },
  { id: 12, name: "취업 후 상환 학자금대출", ministry: "교육부", ageMin: 19, ageMax: 39, incomeCap: 5, reqTags: ["대학(원) 재학"], vtype: "loan", valMin: 0, valMax: 0, amount: "등록금·생활비 대출", desc: "소득 발생 후 상환하는 학자금", channel: "한국장학재단", portal: "한국장학재단", budget: "융자사업", law: "취업 후 학자금 상환 특별법", brackets: [["등록금", "소요액 전액 대출"], ["생활비", "연 400만원 한도(예시)"], ["금리", "1%대 저금리(예시)"]] },
  { id: 13, name: "국가근로장학금", conditional: true, ministry: "교육부", ageMin: 19, ageMax: 39, incomeCap: 3, reqTags: ["대학(원) 재학"], vtype: "cash", valMin: 100, valMax: 500, amount: "교내외 근로 장학", desc: "근로 경험과 장학금 동시 제공", channel: "한국장학재단", portal: "한국장학재단", budget: "대학생 근로장학금지원 5,738억원 ('26 사업설명자료 검증)", src: true, law: "한국장학재단 설립 등에 관한 법률", brackets: [["교내 근로", "시급 1만원 내외(예시)"], ["교외 근로", "시급 1.2만원 내외(예시)"]] },
  { id: 14, name: "청년도약계좌", excl: "youthAsset", ministry: "금융위원회", ageMin: 19, ageMax: 34, incomeCap: 4, reqTags: ["재직 중"], vtype: "cash", valMin: 10, valMax: 40, amount: "정부기여금 + 비과세", desc: "5년 만기 자산형성 지원", channel: "취급은행 앱", portal: "정부24", budget: "서민금융진흥원 출연 1,242억원 ('26 열린재정)", src: true, law: "조세특례제한법 등", brackets: [["납입 한도", "월 70만원"], ["정부기여금", "소득별 월 최대 3.3만원"], ["이자소득", "비과세"]] },
  { id: 15, name: "청년월세 특별지원", excl: "housing", ministry: "국토교통부", ageMin: 19, ageMax: 34, incomeCap: 2, reqTags: ["무주택"], vtype: "cash", valMin: 240, valMax: 240, amount: "월 20만원 × 12개월", desc: "무주택 청년 임차료 지원", channel: "복지로·지자체", portal: "복지로", budget: "1,300억원 ('26 열린재정·2-1 검증)", src: true, law: "주거기본법 §15·청년기본법 §20", brackets: [["지원액", "실제 월세 범위 내 월 20만원"], ["기간", "최대 12개월"]] },
  { id: 16, name: "국민취업지원제도", excl: "jobIncome", ministry: "고용노동부", ageMin: 15, ageMax: 69, incomeCap: 3, reqTags: ["구직 중"], vtype: "cash", valMin: 300, valMax: 540, amount: "구직촉진수당 월 50만원 × 6개월", desc: "취업지원 서비스 + 소득 지원", channel: "고용24", portal: "고용24", budget: "1조 228억원 ('26 열린재정, 일반+지특)", src: true, law: "구직자 취업촉진법", brackets: [["Ⅰ유형 구직촉진수당", "월 50만원 × 6개월"], ["부양가족 가산", "1인당 월 10만원(최대 40만원)"], ["취업성공수당", "최대 150만원"]] },
  { id: 17, name: "국민내일배움카드", ministry: "고용노동부", ageMin: 15, ageMax: 74, incomeCap: 5, anyTags: ["구직 중", "재직 중"], vtype: "voucher", valMin: 60, valMax: 100, amount: "훈련비 300~500만원 한도", desc: "직업훈련 비용 지원", channel: "고용24·HRD-Net", portal: "고용24", budget: "1조 1,364억원 ('26 열린재정, 일반+고보+지특)", src: true, law: "국민 평생 직업능력 개발법", brackets: [["기본 한도", "5년간 300만원"], ["저소득·특화과정", "최대 500만원"], ["자부담", "과정별 15~55%"]] },
  { id: 18, name: "K-패스", conditional: true, ministry: "국토교통부", ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "cash", valMin: 10, valMax: 80, amount: "대중교통비 20~53% 환급", desc: "월 15회 이상 이용 시 환급 — '26 다자녀·어르신 유형 및 '모두의 카드' 확인", channel: "K-패스 앱·카드사", portal: "정부24", budget: "대중교통비 환급 지원 5,580억원 ('26 열린재정·2-1 검증)", src: true, law: "대중교통법 제10조의12", brackets: [["일반", "20% 환급"], ["청년(19~34세)·어르신(65세+)", "30% 환급"], ["다자녀", "2자녀 30% · 3자녀 이상 50% ('26 2-1 확인)"], ["저소득층", "53% 환급"], ["모두의 카드", "일정 금액 초과 이용분 100% 환급 ('26 신설)"]] },
  { id: 19, name: "육아휴직급여", ministry: "고용노동부", ageMin: 19, ageMax: 54, incomeCap: 5, reqTags: ["자녀 양육", "재직 중"], vtype: "cash", valMin: 900, valMax: 2300, amount: "월 최대 250만원(초기)", desc: "육아휴직 기간 소득 보전 (부·모 각각 사용 가능)", channel: "고용24", portal: "고용24", budget: "모성보호육아지원 4조 728억원 ('26 열린재정, 출산휴가급여 포함)", src: true, law: "고용보험법", brackets: [["1~3개월", "월 최대 250만원(예시)"], ["4~6개월", "월 최대 200만원(예시)"], ["7개월~", "월 최대 160만원(예시)"], ["부모 동시 사용", "6+6 특례 가산"]] },
  { id: 20, name: "근로장려금(EITC)", ministry: "국세청", ageMin: 19, ageMax: 100, incomeCap: 2, reqTags: ["재직 중"], vtype: "cash", valMin: 50, valMax: 330, amount: "연 최대 330만원", desc: "저소득 근로가구 소득 지원", channel: "홈택스", portal: "홈택스", budget: "조세지출 약 5조원(예시)", law: "조세특례제한법", brackets: [["단독가구", "최대 165만원"], ["홑벌이가구", "최대 285만원"], ["맞벌이가구", "최대 330만원"]] },
  { id: 21, name: "자녀장려금", perChild: true, ministry: "국세청", ageMin: 19, ageMax: 64, incomeCap: 3, reqTags: ["자녀 양육"], vtype: "cash", valMin: 50, valMax: 100, valNote: "자녀 1인 기준", amount: "자녀 1인당 최대 100만원", desc: "저소득 양육가구 지원", channel: "홈택스", portal: "홈택스", budget: "조세지출 약 1조원(예시)", law: "조세특례제한법", brackets: [["18세 미만 자녀", "1인당 50~100만원(소득별)"]] },
  { id: 22, name: "생계급여", excl: "basicOffset", ministry: "보건복지부", ageMin: 0, ageMax: 100, incomeCap: 0, vtype: "cash", valMin: 400, valMax: 2340, amount: "중위 32% 기준 부족분", desc: "기초생활보장 현금급여 ('26 기준 약 4만 명 신규 수급 전망)", channel: "행정복지센터", portal: "복지로", budget: "9조 1,727억원 ('26 열린재정)", src: true, law: "국민기초생활보장법", brackets: [["1인 가구", "월 최대 82만 556원 ('26 확정)"], ["4인 가구", "월 최대 207만 8,316원 ('26 확정)"], ["지급 방식", "기준액 − 소득인정액"], ["'26 제도개선", "청년 근로소득 공제 확대, 자동차재산 기준 완화"]] },
  { id: 23, name: "의료급여", ministry: "보건복지부", ageMin: 0, ageMax: 100, incomeCap: 0, vtype: "service", valMin: 0, valMax: 0, amount: "의료비 본인부담 경감", desc: "저소득층 의료보장", channel: "행정복지센터", portal: "복지로", budget: "9조 8,400억원 ('26 열린재정)", src: true, law: "의료급여법", brackets: [["1종", "외래 1,000~2,000원 정액 등"], ["2종", "입원 10% 등 경감"]] },
  { id: 24, name: "주거급여", excl: "housing", ministry: "국토교통부", ageMin: 0, ageMax: 100, incomeCap: 2, reqTags: ["무주택"], vtype: "cash", valMin: 250, valMax: 440, valNote: "1인 가구 기준", amount: "기준임대료 내 임차료", desc: "저소득 가구 주거비 지원", channel: "복지로", portal: "복지로", budget: "3조 2,309억원 ('26 열린재정·사업설명자료 검증)", src: true, law: "주거급여법", brackets: [["1급지(서울) 1인", "월 36.9만원 ('26 확정, +1.7)"], ["4급지(그 외 지역) 1인", "월 21.2만원 ('26 확정)"], ["전체 범위", "급지·가구원수별 월 21.2~69.9만원"], ["자기부담", "소득인정액이 중위 32% 초과 시 일부 차감"], ["자가가구", "수선유지비 지원"]] },
  { id: 25, name: "한부모가족 아동양육비", perChild: true, ministry: "성평등가족부", ageMin: 19, ageMax: 64, incomeCap: 2, reqTags: ["한부모", "자녀 양육"], vtype: "cash", valMin: 276, valMax: 480, valNote: "자녀 1인 기준", amount: "자녀 1인당 월 23만원", desc: "한부모 가구 양육비 지원", channel: "복지로", portal: "복지로", budget: "5,722억원 ('26 열린재정)", src: true, law: "한부모가족지원법", brackets: [["일반", "자녀 1인당 월 23만원"], ["청소년한부모(0~1세 자녀)", "월 40만원 수준(예시)"], ["양육비 이행지원", "양육비이행관리원 '26 예산 461억원 — 미지급 양육비 추심·한시 긴급지원"]] },
  { id: 26, name: "에너지바우처", ministry: "기후에너지환경부(이관)", ageMin: 0, ageMax: 100, incomeCap: 1, vtype: "voucher", valMin: 31, valMax: 70, amount: "하절기·동절기 광열비", desc: "취약계층 냉난방비 지원", channel: "행정복지센터", portal: "복지로", budget: "4,940억원 + 산업부 계상 231억원 ('26 열린재정)", src: true, law: "에너지법", brackets: [["연간(가구원수별)", "31~70만원 수준(예시)"]] },
  { id: 27, name: "장애인연금", ministry: "보건복지부", ageMin: 18, ageMax: 100, incomeCap: 3, disability: "severe", vtype: "cash", valMin: 410, valMax: 520, amount: "월 최대 40만원대", desc: "중증장애인(심한 장애) 소득 보전", channel: "복지로", portal: "복지로", budget: "9,071억원 ('26 열린재정)", src: true, law: "장애인연금법", brackets: [["기초급여", "월 34만원 수준(예시)"], ["부가급여", "수급자격별 3~9만원"]] },
  { id: 28, name: "장애수당", ministry: "보건복지부", ageMin: 18, ageMax: 100, incomeCap: 1, disability: "mild", vtype: "cash", valMin: 72, valMax: 72, amount: "월 6만원", desc: "경증장애인(심하지 않은 장애) 기초·차상위 대상 수당", channel: "행정복지센터", portal: "복지로", budget: "2,300억원 ('26 열린재정, 기초+차상위)", src: true, law: "장애인복지법", brackets: [["재가 경증장애인", "월 6만원 ('26 2-1 검증)"], ["보장시설 수급자", "월 3만원 ('26 2-1 검증)"], ["장애아동수당(18세 미만)", "중증 월 22만원·시설 9만원 — 별도 수당 ('26 2-1)"]] },
  { id: 29, name: "장애인 활동지원 서비스", ministry: "보건복지부", ageMin: 6, ageMax: 64, incomeCap: 5, disability: "any", vtype: "service", valMin: 0, valMax: 0, amount: "활동지원사 서비스", desc: "일상·사회활동 지원 (서비스 지원 종합조사로 급여량 결정)", channel: "복지로·연금공단", portal: "복지로", budget: "2조 8,164억원 ('26 열린재정)", src: true, law: "장애인활동 지원에 관한 법률", brackets: [["급여량", "종합조사 구간별 월 60~747시간(예시)"], ["시간당 단가", "활동보조 17,270원 ('26 2-1 검증)"], ["본인부담", "소득 수준별 차등(기초 면제)"]] },
  { id: 30, name: "기초연금", excl: "basicOffset", ministry: "보건복지부", ageMin: 65, ageMax: 100, incomeCap: 3, vtype: "cash", valMin: 420, valMax: 480, amount: "월 최대 34.97만원 (저소득 40만원)", desc: "소득하위 70% 어르신 연금 — '26년 저소득층 40만원 우선 인상", channel: "복지로·국민연금공단", portal: "복지로", budget: "23조 1,378억원 ('26 열린재정)", src: true, law: "기초연금법", brackets: [["기준연금액", "월 349,700원 ('26 고시, 물가 2.1%)"], ["예산 편성 기준", "349,360원(물가 2.0% 가정)·수급 779만 명·국고보조율 84.42% ('26 2-1)"], ["저소득(중위 50% 이하)", "월 40만원 ('26 우선 인상 → '27 전체 확대 예정)"], ["선정기준액", "단독 월 247만원·부부 395.2만원 이하 ('26)"], ["부부가구", "각 20% 감액"], ["국민연금 연계", "수급액 따라 감액 가능"]] },
  { id: 31, name: "노인일자리 및 사회활동 지원", ministry: "보건복지부", ageMin: 65, ageMax: 100, incomeCap: 4, vtype: "cash", valMin: 348, valMax: 912, amount: "공익활동 월 29만원 등", desc: "어르신 일자리·활동비 지원", channel: "노인일자리 여기", portal: "복지로", budget: "2조 3,851억원 ('26 열린재정, 4개 재원 합산)", src: true, law: "노인복지법", brackets: [["공익활동형(월 30시간)", "월 29만원"], ["사회서비스형(월 60시간)", "월 76만원 수준(예시)"], ["시장형", "사업 수익 연동"]] },
  { id: 32, name: "노인장기요양보험", ministry: "복지부·건보공단", ageMin: 65, ageMax: 100, incomeCap: 5, vtype: "service", valMin: 0, valMax: 0, amount: "요양서비스 비용 지원", desc: "장기요양 등급자 재가·시설 급여", channel: "건보공단", portal: "정부24", budget: "국고지원 2조 5,849억원 ('26 열린재정) + 보험료 재정", src: true, law: "노인장기요양보험법", brackets: [["재가급여(등급별)", "월 한도 100~210만원 수준(예시)"], ["본인부담", "재가 15%·시설 20% (감경제도 있음)"]] },
  { id: 34, name: "구직급여(실업급여)", excl: "jobIncome", ministry: "고용노동부", ageMin: 18, ageMax: 64, incomeCap: 5, reqTags: ["구직 중"], vtype: "cash", valMin: 500, valMax: 1780, amount: "평균임금 60% × 120~270일", desc: "고용보험 가입 이직자의 구직활동 기간 소득 보전", channel: "고용24·고용센터", portal: "고용24", budget: "11조 5,376억원 ('26 열린재정)", src: true, law: "고용보험법", brackets: [["지급액", "이직 전 평균임금의 60% (1일 상한 6.6만원 수준·예시)"], ["소정급여일수", "120~270일 (가입기간·연령별)"], ["조기재취업수당", "잔여 1/2 이상 남기고 재취업 시 잔여분 50% ('26 예산 5,852억원)"]] },
  { id: 35, name: "출산전후휴가급여", ministry: "고용노동부", ageMin: 19, ageMax: 49, incomeCap: 5, gender: "F", reqTags: ["임신 중", "재직 중"], vtype: "cash", valMin: 400, valMax: 630, valNote: "90일 기준", amount: "통상임금 90일분(상한 내)", desc: "출산 전후 90일(다태아 120일) 휴가 기간 급여", channel: "고용24", portal: "고용24", budget: "모성보호육아지원 4조 728억원 내 ('26)", src: true, law: "고용보험법·근로기준법", brackets: [["휴가 기간", "90일 (다태아 120일)"], ["급여 상한", "월 210만원 수준(예시)"]] },
  { id: 36, name: "고용보험 미적용자 출산급여", ministry: "고용노동부", ageMin: 19, ageMax: 49, incomeCap: 5, gender: "F", reqTags: ["임신 중"], vtype: "cash", valMin: 150, valMax: 150, valNote: "일시금", amount: "총 150만원", desc: "프리랜서·1인 사업자 등 고용보험 미적용 출산 여성 지원", channel: "고용24·고용센터", portal: "고용24", budget: "283억원 ('26 열린재정)", src: true, law: "고용보험법 부칙 등", brackets: [["지급액", "월 50만원 × 3개월"]] },
  { id: 37, name: "두루누리 사회보험료 지원", ministry: "고용노동부", ageMin: 19, ageMax: 64, incomeCap: 3, reqTags: ["재직 중"], vtype: "cash", valMin: 50, valMax: 130, amount: "국민연금·고용보험료 80% 지원", desc: "소규모 사업장 저임금 근로자 사회보험료 경감", channel: "4대사회보험 정보연계센터", portal: "정부24", budget: "사회보험사각지대해소 9,443억원 ('26 열린재정)", src: true, law: "고용보험법·국민연금법", brackets: [["대상", "10인 미만 사업장 저임금 근로자"], ["지원율", "보험료의 80%"]] },
  { id: 38, name: "산재보험급여", ministry: "고용노동부", ageMin: 15, ageMax: 100, incomeCap: 5, reqTags: ["재직 중"], vtype: "service", valMin: 0, valMax: 0, amount: "요양·휴업·장해급여 등", desc: "업무상 재해 시 치료비 전액과 휴업 중 소득(평균임금 70%) 보장", channel: "근로복지공단", portal: "정부24", budget: "8조 1,463억원 ('26 열린재정)", src: true, law: "산업재해보상보험법", brackets: [["요양급여", "치료비 전액"], ["휴업급여", "평균임금의 70%"], ["장해·유족급여", "등급별 연금 또는 일시금"]] },
  { id: 39, name: "대지급금(임금체불)", ministry: "고용노동부", ageMin: 15, ageMax: 100, incomeCap: 5, reqTags: ["재직 중"], vtype: "service", valMin: 0, valMax: 0, amount: "체불임금 국가 선지급", desc: "임금 체불 시 국가가 먼저 지급하고 사업주에게 회수", channel: "근로복지공단·고용24", portal: "고용24", budget: "7,461억원 ('26 열린재정)", src: true, law: "임금채권보장법", brackets: [["퇴직자", "최대 2,100만원 수준(예시)"], ["재직자 간이대지급금", "최대 700만원 수준(예시)"]] },
  { id: 45, name: "청년미래적금", excl: "youthAsset", ministry: "금융위원회", ageMin: 19, ageMax: 34, incomeCap: 4, vtype: "cash", valMin: 36, valMax: 72, valNote: "연 기여금", amount: "월 납입 50만원에 기여금 6~12% 매칭", desc: "3년 만기 자산형성 적금 — '26.6월 출시, 기본금리 5%+우대 최대 3%p, 비과세", channel: "취급은행 14곳 앱 (반기별 모집: 6월·12월)", portal: "정부24", budget: "7,446억원 ('26 열린재정)", src: true, law: "조세특례제한법", brackets: [["가입", "만 19~34세 (병역기간 최대 6년 연령 미산입)"], ["일반형", "총급여 6,000만원 이하 + 가구 중위 200% 이하 → 기여금 6% (3년 최대 108만원)"], ["우대형", "중소기업 재직 3,600만원 이하 등 → 기여금 12% (최대 216만원)"], ["총급여 6,000만~7,500만원", "비과세 혜택만 적용"], ["만기 수령", "월 50만 납입 시 최대 2,255만원 수준"], ["도약계좌 가입자", "특별중도해지 후 갈아타기 가능"]] },
  { id: 46, name: "햇살론(특례·유스)", ministry: "금융위원회", ageMin: 19, ageMax: 64, incomeCap: 2, vtype: "loan", valMin: 0, valMax: 0, amount: "서민 보증부 저리 대출", desc: "저신용·저소득자와 청년(유스)의 긴급 생활·자립자금 융자", channel: "서민금융진흥원·서민금융콜센터 1397", portal: "정부24", budget: "1,297억원 ('26 열린재정, 특례+유스)", src: true, law: "서민의 금융생활 지원에 관한 법률", brackets: [["햇살론유스(청년)", "최대 1,200만원, 금리 3%대 수준(예시)"], ["보증", "서민금융진흥원 보증부"]] },
  { id: 44, name: "주택구입·전세자금 융자(디딤돌·버팀목)", ministry: "국토교통부", ageMin: 19, ageMax: 64, incomeCap: 4, reqTags: ["무주택"], vtype: "loan", valMin: 0, valMax: 0, amount: "저리 구입·전세 대출", desc: "무주택 서민의 내집마련·전세보증금 저금리 융자", channel: "기금e든든·수탁은행", portal: "정부24", budget: "10조 3,016억원 ('26 열린재정, 주택도시기금 융자)", src: true, law: "주택도시기금법", brackets: [["디딤돌(구입)", "금리 2%대, 최대 2.5~4억원 수준(예시)"], ["버팀목(전세)", "금리 1~2%대, 보증금 지역별 한도(예시)"], ["신생아 특례", "'26 신생아 특례 2.0조·청년주택드림 1.2조·디딤돌 3.1조 등 편성 (2-1 검증)"]] },
  { id: 43, name: "평생교육이용권(평생교육바우처)", ministry: "교육부", ageMin: 19, ageMax: 100, incomeCap: 1, vtype: "voucher", valMin: 35, valMax: 35, amount: "연 35만원 바우처", desc: "저소득 성인의 평생학습 강좌 수강 지원", channel: "평생교육바우처 누리집", portal: "정부24", budget: "286억원 ('26 열린재정)", src: true, law: "평생교육법", brackets: [["기초·차상위 성인", "연 35만원 (사용처: 등록 평생교육기관)"]] },
  { id: 40, name: "긴급복지지원", conditional: true, ministry: "보건복지부", ageMin: 0, ageMax: 100, incomeCap: 3, vtype: "cash", valMin: 180, valMax: 1100, amount: "위기 시 생계·의료·주거비", desc: "실직·질병·화재 등 갑작스러운 위기 상황 시 신속 지원", channel: "129 보건복지상담센터·행정복지센터", portal: "복지로", budget: "4,053억원 ('26 열린재정)", src: true, law: "긴급복지지원법", brackets: [["생계지원", "4인 가구 월 183만원 수준(예시) × 1~6개월"], ["의료지원", "회당 300만원 한도(예시)"], ["주거·교육·연료비", "항목별 별도 지원"]] },
  { id: 41, name: "자립준비청년 자립수당", ministry: "보건복지부", ageMin: 18, ageMax: 23, incomeCap: 5, reqTags: ["자립준비청년(보호종료)"], vtype: "cash", valMin: 600, valMax: 600, amount: "월 50만원", desc: "아동복지시설·위탁가정 보호종료 후 5년간 자립 지원", channel: "행정복지센터·자립지원전담기관", portal: "복지로", budget: "341억원 ('26 열린재정)", src: true, law: "아동복지법", brackets: [["보호종료 후 5년 이내", "월 50만원 ('26 2-1 검증 · 30→35→40→50만원 단계 인상)"], ["조기보호종료아동", "만 15세 이후 조기 종료자도 포함 ('24.2 확대)"], ["자립정착금", "지자체별 1,000만원 내외 별도(예시)"]] },
  { id: 42, name: "아동발달지원계좌(디딤씨앗통장)", ministry: "보건복지부", ageMin: 0, ageMax: 17, incomeCap: 1, vtype: "cash", valMin: 60, valMax: 120, amount: "적립금 1:2 정부 매칭", desc: "취약계층 아동 자산형성 지원 — 만 18세 이후 자립 용도 사용", channel: "행정복지센터", portal: "복지로", budget: "1,553억원 ('26 열린재정, 보조)", src: true, law: "아동복지법", brackets: [["정부 매칭", "적립액의 1:2 매칭, 월 10만원 한도 ('26 2-1 검증)"], ["본인 적립", "월 최대 50만원까지 가능"], ["사용", "만 18세 이후 학자금 등 사회진출 초기자금"]] },
  { id: 47, name: "무공해차(전기·수소차) 구매보조금", conditional: true, ministry: "기후에너지환경부", ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "cash", valMin: 200, valMax: 580, valNote: "일시금·차종별", amount: "국비 최대 580만원 수준", desc: "전기·수소차 구매 시 보조금 지급 (지방비 별도 추가)", channel: "무공해차 통합누리집·지자체", portal: "정부24", budget: "2조 2,845억원 ('26 열린재정)", src: true, law: "대기환경보전법", brackets: [["전기승용", "국비 최대 580만원 수준(예시) + 지방비"], ["전기화물", "국비 1,000만원 내외(예시)"], ["수소승용", "국비 2,000만원 내외(예시)"]] },
  { id: 48, name: "저소득층 에너지효율개선", ministry: "기후에너지환경부", ageMin: 0, ageMax: 100, incomeCap: 1, vtype: "service", valMin: 0, valMax: 0, amount: "단열·창호·보일러 시공", desc: "저소득 가구 주택 에너지 성능 개선 시공 지원", channel: "한국에너지재단·행정복지센터", portal: "복지로", budget: "1,086억원 ('26 열린재정)", src: true, law: "에너지법", brackets: [["시공 내용", "단열·창호·바닥·보일러 교체"], ["가구당", "수백만원 상당 시공(예시)"]] },
  { id: 60, name: "고용안정장려금", ministry: "고용노동부", audience: "biz", sizes: ["소상공인", "중소기업", "중견기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 240, valMax: 1440, amount: "근로자 1인당 월 20~120만원 수준", desc: "육아휴직 대체인력 채용, 워라밸·유연근무 도입 사업주 지원", channel: "고용24", portal: "고용24", budget: "4,394억원 ('26 열린재정)", src: true, law: "고용보험법", brackets: [["대체인력 지원금", "월 120만원 수준(예시)"], ["워라밸일자리 장려금", "월 30~50만원 수준(예시)"], ["육아기 업무분담지원금", "월 20만원 수준(예시)"]] },
  { id: 61, name: "장애인고용장려금", ministry: "고용노동부", audience: "biz", sizes: ["소상공인", "중소기업", "중견기업", "대기업"], bizTags: ["장애인 고용"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 420, valMax: 1080, amount: "1인당 월 35~90만원 수준", desc: "의무고용률 초과 장애인 고용 사업주 지원", channel: "한국장애인고용공단", portal: "고용24", budget: "4,032억원 ('26 열린재정)", src: true, law: "장애인고용촉진법", brackets: [["경증", "월 35~50만원 수준(예시)"], ["중증·여성", "월 60~90만원 수준(예시)"]] },
  { id: 62, name: "고령자 고용안정지원금", ministry: "고용노동부", audience: "biz", sizes: ["소상공인", "중소기업", "중견기업"], bizTags: ["청년·고령자 채용 계획"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 360, valMax: 360, amount: "계속고용 1인당 분기 지원", desc: "정년 이후 계속고용제도 도입 사업주 지원", channel: "고용24", portal: "고용24", budget: "536억원 ('26 열린재정)", src: true, law: "고용보험법", brackets: [["계속고용장려금", "1인당 월 30만원 수준(예시)"]] },
  { id: 63, name: "고용창출장려금", ministry: "고용노동부", audience: "biz", sizes: ["소상공인", "중소기업", "중견기업"], bizTags: ["청년·고령자 채용 계획"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 300, valMax: 720, amount: "신규채용 인건비 일부", desc: "일자리 함께하기 등 신규 고용 창출 사업주 지원", channel: "고용24", portal: "고용24", budget: "214억원 ('26 열린재정)", src: true, law: "고용보험법", brackets: [["일자리 함께하기", "증가 근로자 1인당 인건비 지원(예시)"]] },
  { id: 64, name: "전력효율향상(고효율기기 지원)", ministry: "기후에너지환경부", audience: "biz", sizes: ["소상공인", "중소기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 50, valMax: 500, amount: "고효율기기 교체비 지원", desc: "소상공인·취약부문 고효율 냉난방기·조명 교체 지원", channel: "한국전력·에너지공단", portal: "정부24", budget: "1,259억원 ('26 열린재정)", src: true, law: "에너지이용 합리화법", brackets: [["소상공인", "고효율기기 구매비 일부(예시)"], ["뿌리기업 등", "설비 교체 지원(예시)"]] },
  { id: 49, name: "이공계 연구생활장려금(스타이펜드)", ministry: "과학기술정보통신부", ageMin: 19, ageMax: 39, incomeCap: 5, reqTags: ["대학(원) 재학"], vtype: "cash", valMin: 960, valMax: 1320, amount: "석사 월 80만·박사 월 110만원 보장", desc: "이공계 대학원생 연구생활비 최소 보장 (기존 과제 인건비 포함 구조)", channel: "소속 대학·한국연구재단", portal: "정부24", budget: "830억원 ('26 열린재정)", src: true, law: "국가연구개발혁신법 등", brackets: [["석사과정", "월 80만원 보장(예시)"], ["박사과정", "월 110만원 보장(예시)"], ["구조", "연구과제 인건비 포함 총액 보장 — 부족분 국비 보전"]] },
  { id: 50, name: "이공계 우수 국가장학금(대통령과학장학금 등)", excl: "scholarship", ministry: "과학기술정보통신부", ageMin: 19, ageMax: 34, incomeCap: 5, reqTags: ["대학(원) 재학"], vtype: "cash", valMin: 500, valMax: 2400, amount: "등록금·생활비 장학", desc: "이공계 우수 학부·대학원생 장학 지원", channel: "한국장학재단", portal: "한국장학재단", budget: "698억원 ('26 열린재정)", src: true, law: "한국장학재단 설립 등에 관한 법률", brackets: [["학부(대통령과학장학금)", "등록금 + 학업장려비(예시)"], ["대학원", "석사 월 150만·박사 월 200만원 수준(예시)"]] },
  { id: 51, name: "디지털배움터", ministry: "과학기술정보통신부", ageMin: 0, ageMax: 100, incomeCap: 5, vtype: "service", valMin: 0, valMax: 0, amount: "무료 디지털역량 교육", desc: "키오스크·스마트폰 활용 등 전 국민 디지털 교육 (어르신 특화)", channel: "디지털배움터 누리집·주민센터", portal: "정부24", budget: "381억원 ('26 열린재정, 자율)", src: true, law: "지능정보화 기본법", brackets: [["교육 내용", "생활 속 디지털 활용 전반"], ["비용", "무료"]] },
  { id: 65, name: "AI통합바우처", ministry: "과학기술정보통신부", audience: "biz", sizes: ["중소기업"], bizTags: ["디지털·스마트 전환"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 2000, valMax: 7000, amount: "AI 도입 바우처", desc: "중소기업 AI 솔루션·데이터 도입 비용 바우처 지원", channel: "정보통신산업진흥원(NIPA)", portal: "정부24", budget: "898억원 ('26 열린재정)", src: true, law: "지능정보화 기본법", brackets: [["기업당", "수천만원 규모 바우처(예시)"], ["용도", "AI 솔루션 구매·컨설팅·데이터"]] },
  { id: 66, name: "공공연구성과 사업화·창업 지원", ministry: "과학기술정보통신부", audience: "biz", sizes: ["예비창업자", "중소기업"], bizTags: ["창업 준비·7년 이내"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 2000, valMax: 10000, amount: "기술창업 사업화 자금", desc: "공공 R&D 성과 기반 기술창업·사업화 지원", channel: "과기부·전문기관 공고", portal: "정부24", budget: "931억원 ('26 열린재정, R&D)", src: true, law: "기술이전법 등", brackets: [["실험실 창업 등", "과제별 사업화 자금(예시)"]] },
  { id: 52, name: "자활사업(자활근로)", excl: "jobIncome", ministry: "보건복지부", ageMin: 18, ageMax: 64, incomeCap: 1, vtype: "cash", valMin: 600, valMax: 1600, amount: "자활급여 월 60~140만원 수준", desc: "근로능력 있는 수급자·차상위의 일자리 참여형 자립 지원", channel: "행정복지센터·지역자활센터", portal: "복지로", budget: "8,409억원 ('26 열린재정)", src: true, law: "국민기초생활보장법", brackets: [["시장진입형·인턴형 등", "유형별 급여 차등(예시)"], ["자활성공지원금", "탈수급 시 인센티브(예시)"]] },
  { id: 53, name: "국가예방접종", ministry: "질병관리청", ageMin: 0, ageMax: 100, incomeCap: 5, vtype: "service", valMin: 0, valMax: 0, amount: "필수 예방접종 무료", desc: "아동 필수접종, 어르신 인플루엔자·폐렴구균, HPV 등 무료 접종", channel: "보건소·지정의료기관", portal: "정부24", budget: "6,392억원 ('26 열린재정)", src: true, law: "감염병예방법", brackets: [["아동(0~12세)", "필수 예방접종 전액 무료"], ["65세 이상", "인플루엔자·폐렴구균 무료"], ["여성청소년", "HPV 무료"]] },
  { id: 54, name: "노인맞춤돌봄서비스", ministry: "보건복지부", ageMin: 65, ageMax: 100, incomeCap: 3, vtype: "service", valMin: 0, valMax: 0, amount: "안부확인·가사·동행 돌봄", desc: "홀몸·취약 어르신 맞춤형 돌봄 (장기요양 미해당자 대상)", channel: "행정복지센터", portal: "복지로", budget: "5,894억원 ('26 열린재정)", src: true, law: "노인복지법", brackets: [["서비스", "안전지원·가사·외출동행 등 월 16~40시간(예시)"]] },
  { id: 55, name: "치매검진·치매안심센터", ministry: "보건복지부", ageMin: 60, ageMax: 100, incomeCap: 5, vtype: "service", valMin: 0, valMax: 0, amount: "치매 조기검진·사례관리 무료", desc: "60세 이상 치매 선별검사, 진단·감별검사비 지원 및 쉼터 운영", channel: "치매안심센터(보건소)", portal: "정부24", budget: "치매관리체계 구축 1,849억원 ('26 열린재정)", src: true, law: "치매관리법", brackets: [["선별검사", "무료"], ["진단·감별검사", "소득기준 내 검사비 지원(예시)"]] },
  { id: 56, name: "다함께돌봄센터(초등돌봄)", ageTarget: "child", ministry: "보건복지부", ageMin: 6, ageMax: 12, incomeCap: 5, vtype: "service", valMin: 0, valMax: 0, amount: "방과후 초등 돌봄", desc: "소득 무관 초등학생 상시·일시 돌봄 (지역 돌봄센터)", channel: "지자체 돌봄센터", portal: "정부24", budget: "775억원 ('26 열린재정, 자율)", src: true, law: "아동복지법", brackets: [["이용료", "월 10만원 내외 자부담(지자체별 상이·예시)"]] },
  { id: 57, name: "정보통신보조기기 보급", ministry: "과학기술정보통신부", ageMin: 0, ageMax: 100, incomeCap: 3, disability: "any", vtype: "voucher", valMin: 30, valMax: 200, valNote: "기기가액 예시", amount: "보조기기 구매가 80% 지원", desc: "장애인·국가유공 상이자의 정보통신 보조기기 보급", channel: "한국지능정보사회진흥원(NIA)·지자체", portal: "정부24", budget: "36억원 ('26 열린재정, 자율+제주+세종)", src: true, law: "지능정보화 기본법", brackets: [["지원율", "기기 가격의 80% (기초·차상위 90%)"]] },
  { id: 70, name: "보훈급여금(보상금·수당)", ministry: "국가보훈부", ageMin: 0, ageMax: 100, incomeCap: 5, vet: "any", vtype: "cash", valMin: 400, valMax: 3000, valNote: "대상별 상이", amount: "상이등급·유족별 월 보상금", desc: "국가유공자 본인·유족에 대한 보상금·각종 수당", channel: "보훈(지)청·보훈부 누리집", portal: "정부24", budget: "보상금 3조 7,175억원 ('26 열린재정)", src: true, law: "국가유공자 예우법", brackets: [["상이 유공자·유족", "상이등급·관계별 월 보상금"], ["6·25자녀수당", "'26 예산 4,198억원"], ["고엽제수당", "'26 예산 3,218억원"], ["생활조정수당", "'26 예산 1,201억원 (생활곤란 가산)"], ["간호수당·무공영예수당", "'26 예산 527억·399억원"]] },
  { id: 71, name: "참전명예수당", ministry: "국가보훈부", ageMin: 65, ageMax: 100, incomeCap: 5, vet: "self", vtype: "cash", valMin: 540, valMax: 540, amount: "월 45만원 수준(예시)", desc: "6·25 및 월남전 참전유공자 명예수당 (지자체 수당 별도)", channel: "보훈(지)청", portal: "정부24", budget: "5,565억원 ('26 열린재정)", src: true, law: "참전유공자 예우법", brackets: [["국가 수당", "월 45만원 수준(예시)"], ["지자체 참전수당", "시군구별 별도 추가"]] },
  { id: 72, name: "보훈의료 지원(보훈병원·위탁병원)", ministry: "국가보훈부", ageMin: 0, ageMax: 100, incomeCap: 5, vet: "any", vtype: "service", valMin: 0, valMax: 0, amount: "진료비 감면·무료", desc: "유공자 본인 국비 진료, 가족 감면 — 전국 보훈·위탁병원", channel: "보훈병원·위탁병원", portal: "정부24", budget: "7,200억원 ('26 열린재정, 보훈병원 4,505억+위탁병원 2,695억)", src: true, law: "국가유공자 예우법", brackets: [["유공자 본인", "국비 진료(무료) 또는 감면"], ["유족·가족", "60% 등 감면(예시)"], ["노후복지지원", "'26 예산 402억원 (요양·복지 별도)"]] },
  { id: 73, name: "보훈대상자 교육지원(수업료 면제)", ministry: "국가보훈부", ageMin: 6, ageMax: 24, incomeCap: 5, vet: "any", vtype: "voucher", valMin: 50, valMax: 500, valNote: "예시", amount: "수업료 면제·학습보조비", desc: "유공자 본인·자녀의 중고교·대학 수업료 면제 및 학습보조비", channel: "보훈(지)청·학교", portal: "정부24", budget: "224억원 ('26 열린재정)", src: true, law: "국가유공자 예우법", brackets: [["중·고·대학", "수업료 등 면제"], ["학습보조비", "학기별 지급(예시)"]] },
  { id: 74, name: "제대군인 사회복귀지원(전직지원금)", ministry: "국가보훈부", ageMin: 25, ageMax: 60, incomeCap: 5, vet: "self", vtype: "cash", valMin: 300, valMax: 550, amount: "전직지원금 월 지급", desc: "중·장기복무 제대군인 구직기간 전직지원금 및 취업지원", channel: "제대군인지원센터", portal: "정부24", budget: "152억원 ('26 열린재정)", src: true, law: "제대군인 지원법", brackets: [["장기복무", "월 77만원 수준 × 6개월(예시)"], ["중기복무", "월 50만원 수준 × 6개월(예시)"]] },
  { id: 75, name: "국가유공자 대부(융자)", ministry: "국가보훈부", ageMin: 19, ageMax: 100, incomeCap: 5, vet: "any", vtype: "loan", valMin: 0, valMax: 0, amount: "주택·사업·생활안정 저리 대부", desc: "유공자·유족 대상 주택구입·사업자금 장기 저리 융자", channel: "보훈(지)청", portal: "정부24", budget: "224억원 ('26 열린재정)", src: true, law: "국가유공자 예우법", brackets: [["주택대부", "수천만원 한도 저리(예시)"], ["사업·생활안정", "용도별 한도 차등(예시)"]] },
  { id: 76, name: "유공자 교통·시설 이용지원", ministry: "국가보훈부", ageMin: 0, ageMax: 100, incomeCap: 5, vet: "self", vtype: "service", valMin: 0, valMax: 0, amount: "교통·고궁 등 감면", desc: "상이유공자 등 대중교통·고궁·공원 이용료 감면", channel: "보훈(지)청 발급 신분증 제시", portal: "정부24", budget: "218억원 ('26 열린재정)", src: true, law: "국가유공자 예우법", brackets: [["대중교통", "무임 또는 할인(대상별)"], ["고궁·국공립시설", "면제·감면"]] },
  { id: 80, name: "소상공인 정책자금(융자)", ministry: "중소벤처기업부", audience: "biz", sizes: ["소상공인"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "loan", valMin: 0, valMax: 0, amount: "저리 운전·시설자금", desc: "소상공인 경영에 필요한 운전·시설자금 정책 융자", channel: "소상공인시장진흥공단", portal: "정부24", budget: "3조 3,620억원 ('26 열린재정)", src: true, law: "소상공인법", brackets: [["일반경영안정자금", "업체당 7천만원 한도 수준(예시)"], ["특별·긴급자금", "재해·경영위기 시 별도"]] },
  { id: 81, name: "중소기업 정책자금(융자)", ministry: "중소벤처기업부", audience: "biz", sizes: ["소상공인", "중소기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "loan", valMin: 0, valMax: 0, amount: "창업기~재도약 단계별 융자", desc: "중소벤처기업진흥공단 성장단계별 정책 융자", channel: "중소벤처기업진흥공단", portal: "정부24", budget: "혁신창업 1조 6,058억·신성장 1조 811억·재도약 6,125억·긴급경영 2,500억 등 ('26 열린재정)", src: true, law: "중소기업진흥법", brackets: [["혁신창업사업화자금", "창업 7년 이내, 수십억 한도(예시)"], ["신성장기반자금", "성장단계 시설·운전"], ["재도약·긴급경영", "위기·재기 기업"]] },
  { id: 82, name: "창업사업화지원(예비·초기창업패키지)", ministry: "중소벤처기업부", audience: "biz", sizes: ["예비창업자", "소상공인", "중소기업"], bizTags: ["창업 준비·7년 이내"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 3000, valMax: 10000, amount: "사업화 자금 최대 1억원 수준", desc: "예비~초기 창업자 사업화 자금·멘토링 패키지", channel: "K-스타트업 누리집", portal: "정부24", budget: "4,618억원 ('26 열린재정)", src: true, law: "중소기업창업 지원법", brackets: [["예비창업패키지", "최대 1억원 수준(예시)"], ["초기창업패키지", "창업 3년 이내, 최대 1억원 수준(예시)"]] },
  { id: 83, name: "청년창업사관학교", ministry: "중소벤처기업부", audience: "biz", sizes: ["예비창업자", "중소기업"], bizTags: ["창업 준비·7년 이내"], ageMin: 19, ageMax: 39, incomeCap: 5, vtype: "grant", valMin: 3000, valMax: 10000, amount: "최대 1억원 + 입주공간", desc: "만 39세 이하 청년 창업자 집중 육성 (창업성공패키지)", channel: "중소벤처기업진흥공단", portal: "정부24", budget: "창업성공패키지 1,064억원 ('26 열린재정)", src: true, law: "중소기업창업 지원법", brackets: [["지원", "사업화 자금 최대 1억원 + 교육·공간(예시)"], ["요건", "대표자 만 39세 이하, 창업 3년 이내"]] },
  { id: 84, name: "희망리턴패키지(폐업·재기 지원)", ministry: "중소벤처기업부", audience: "biz", sizes: ["소상공인"], bizTags: ["폐업·재기 준비"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 400, valMax: 1000, amount: "점포철거비·재기 교육", desc: "폐업 소상공인의 정리비용과 재취업·재창업 전환 지원", channel: "소상공인시장진흥공단", portal: "정부24", budget: "소상공인재기지원 3,516억원 ('26 열린재정)", src: true, law: "소상공인법", brackets: [["점포철거비", "최대 400만원 수준(예시)"], ["재취업 교육·전직장려수당", "과정별 지급(예시)"], ["재창업 사업화", "심사 후 지원(예시)"]] },
  { id: 85, name: "소상공인 성장·스마트화 지원", ministry: "중소벤처기업부", audience: "biz", sizes: ["소상공인"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 100, valMax: 500, amount: "스마트상점·경영개선", desc: "소상공인 매출 성장, 스마트기기·키오스크 도입 지원", channel: "소상공인시장진흥공단", portal: "정부24", budget: "성장지원 6,212억 + 스마트화 1,136억원 ('26 열린재정)", src: true, law: "소상공인법", brackets: [["스마트상점 기술보급", "도입비 일부(예시)"], ["성장 프로그램", "유형별 지원"]] },
  { id: 86, name: "수출바우처(수출지원기반활용)", ministry: "중기부·산업통상부(공동)", audience: "biz", sizes: ["중소기업", "중견기업"], bizTags: ["수출 희망"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 2000, valMax: 10000, amount: "수출 마케팅 바우처", desc: "해외마케팅·인증·물류 등 수출 준비 비용 바우처 (양 부처 공동 운영)", channel: "수출바우처 누리집", portal: "정부24", budget: "중기부 1,502억 + 산업부 1,811억원 ('26 열린재정)", src: true, law: "중소기업진흥법", brackets: [["기업당", "수천만원~1억원 수준(예시)"], ["용도", "마케팅·인증·번역·물류 등 메뉴판식"]] },
  { id: 87, name: "중소기업 혁신바우처", ministry: "중소벤처기업부", audience: "biz", sizes: ["중소기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 1000, valMax: 5000, amount: "컨설팅·기술지원 바우처", desc: "제조 소기업 컨설팅·기술개발·마케팅 바우처", channel: "혁신바우처 플랫폼", portal: "정부24", budget: "652억원 ('26 열린재정)", src: true, law: "중소기업진흥법", brackets: [["대상", "매출 120억원 이하 제조 소기업(예시)"], ["한도", "수천만원 바우처(예시)"]] },
  { id: 88, name: "스마트공장 보급(ICT융합)", ministry: "중소벤처기업부", audience: "biz", sizes: ["중소기업", "중견기업"], bizTags: ["디지털·스마트 전환"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 5000, valMax: 20000, amount: "구축비 최대 50% 내외", desc: "제조 중소기업 스마트공장 구축·고도화 지원", channel: "스마트제조혁신추진단", portal: "정부24", budget: "4,021억원 ('26 열린재정)", src: true, law: "중소기업 스마트제조혁신법", brackets: [["기초~고도화", "단계별 수천만~수억원(예시)"]] },
  { id: 90, name: "병 봉급·장병내일준비적금", ministry: "국방부", ageMin: 18, ageMax: 30, incomeCap: 5, mil: "enlisted", vtype: "cash", valMin: 1500, valMax: 2500, amount: "봉급 + 적금 정부매칭", desc: "의무복무 병 봉급과 전역 시 목돈 마련 자산형성 지원", channel: "소속 부대·나라사랑카드 은행", portal: "정부24", budget: "병인건비 3조 6,464억 + 병내일준비지원 1조 6,587억원 ('26 열린재정)", src: true, law: "군인보수법·장병내일준비적금법", brackets: [["병장 봉급", "월 150만원 수준(예시)"], ["내일준비지원금", "납입액 정부매칭 월 55만원 수준(예시)"], ["전역 시", "복무기간 저축 + 매칭으로 2천만원 내외 목돈(예시)"]] },
  { id: 91, name: "병 급식·피복·의료 지원", ministry: "국방부", ageMin: 18, ageMax: 30, incomeCap: 5, mil: "enlisted", vtype: "service", valMin: 0, valMax: 0, amount: "복무 중 현물·의료 무상", desc: "복무 중 급식·피복 현물 지급과 군 의료기관 무상 진료", channel: "소속 부대", portal: "정부24", budget: "기본급식 1조 8,119억 + 기본피복 3,914억원 ('26 열린재정)", src: true, law: "군인복지기본법", brackets: [["급식", "1일 단가 기준 현물(예시)"], ["피복", "보급 기준량 지급"], ["의료", "군 병원 무상진료"]] },
  { id: 92, name: "병 자기개발비용 지원", ministry: "국방부", ageMin: 18, ageMax: 30, incomeCap: 5, mil: "enlisted", vtype: "voucher", valMin: 12, valMax: 12, amount: "연 12만원 수준(예시)", desc: "복무 중 자격증·수강·도서 등 자기개발 비용 일부 지원", channel: "소속 부대·국방전자조달", portal: "정부24", budget: "자기개발교육 409억원 ('26 열린재정)", src: true, law: "군인복지기본법", brackets: [["지원율", "비용의 80%, 연 한도 내(예시)"], ["대학 원격강좌", "학점 취득 지원 별도"]] },
  { id: 93, name: "간부 주거지원(관사·전세이자)", ministry: "국방부", ageMin: 19, ageMax: 60, incomeCap: 5, mil: "officer", vtype: "service", valMin: 0, valMax: 0, amount: "관사·숙소 제공, 전세이자 지원", desc: "직업군인 관사·간부숙소 제공 및 전세자금 이자 지원", channel: "소속 부대·국군복지단", portal: "정부24", budget: "관사·간부숙소 7,607억 + 전세자금이자 530억원 ('26 열린재정)", src: true, law: "군인복지기본법", brackets: [["관사·숙소", "무상 또는 저비용 제공"], ["전세자금", "이자 지원(한도 내)"]] },
  { id: 94, name: "단기복무 장려금·수당(간부)", ministry: "국방부", ageMin: 19, ageMax: 40, incomeCap: 5, mil: "officer", vtype: "cash", valMin: 1000, valMax: 1200, valNote: "일시금 예시", amount: "장교·부사관 장려금", desc: "단기복무 장교·부사관 임관 장려금 등 간부 확보 지원", channel: "각 군 모집 공고", portal: "정부24", budget: "간부확보장려사업 1,600억원 ('26 열린재정)", src: true, law: "군인보수법 등", brackets: [["단기복무 장교", "1,200만원 수준 일시금(예시)"], ["단기복무 부사관", "1,000만원 수준 일시금(예시)"]] },
  { id: 95, name: "군인연금(퇴역연금)", ministry: "국방부", ageMin: 38, ageMax: 100, incomeCap: 5, mil: "officer", vtype: "cash", valMin: 2000, valMax: 4000, valNote: "예시", amount: "복무 19.5년 이상 퇴역연금", desc: "장기복무 간부 전역 후 연금 — 전역 즉시 수급 개시", channel: "국방부 군인연금과", portal: "정부24", budget: "퇴직급여 4조 1,489억원 ('26 열린재정, 군인연금기금)", src: true, law: "군인연금법", brackets: [["수급 요건", "복무 19년 6개월 이상"], ["개시 시점", "전역 즉시 (연령 무관)"], ["연금액", "계급·복무기간별 산정"]] },
  { id: 96, name: "군 어린이집 운영지원", ministry: "국방부", ageMin: 19, ageMax: 60, incomeCap: 5, mil: "any", reqTags: ["자녀 양육"], vtype: "service", valMin: 0, valMax: 0, amount: "군 관사지역 보육", desc: "군인 가족 대상 군 어린이집 운영 (격오지 포함)", channel: "국군복지단", portal: "정부24", budget: "652억원 ('26 열린재정)", src: true, law: "군인복지기본법", brackets: [["대상", "군인·군무원 자녀 우선"]] },
  { id: 97, name: "예비군 훈련 보상", ministry: "국방부", ageMin: 20, ageMax: 40, incomeCap: 5, mil: "reserve", vtype: "cash", valMin: 8, valMax: 25, amount: "훈련비·교통비·식비", desc: "동원·향방 훈련 참가 보상비 및 실비", channel: "예비군 홈페이지·소속 부대", portal: "정부24", budget: "동원훈련 514억원 ('26 열린재정)", src: true, law: "예비군법", brackets: [["동원훈련(2박3일)", "보상비 8만원대 수준(예시)"], ["일반훈련", "교통비·식비 실비(예시)"]] },
  { id: 100, name: "농업인 공익직불금", ministry: "농림축산식품부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["농업인"], vtype: "cash", valMin: 130, valMax: 600, amount: "소농 130만원~면적직불", desc: "농업·농촌 공익기능 증진 기본직불 (소농·면적직불)", channel: "국립농산물품질관리원·읍면동", portal: "정부24", budget: "2조 9,703억원 ('26 열린재정)", src: true, law: "농업농촌공익직불법", brackets: [["소농직불금", "가구당 연 130만원(요건 충족 시)"], ["면적직불금", "면적 구간별 ha당 단가"], ["농지이양 은퇴직불", "'26 예산 297억원 (고령농 은퇴 시 별도)"]] },
  { id: 101, name: "농업인 건강·연금보험료 지원", ministry: "농림축산식품부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["농업인"], vtype: "cash", valMin: 40, valMax: 100, amount: "보험료 일부 국고 지원", desc: "농업인 건강보험료·국민연금보험료 부담 경감", channel: "건보공단·연금공단 (자동 반영)", portal: "정부24", budget: "3,414억원 ('26 열린재정)", src: true, law: "농어촌 특별세법 등", brackets: [["건강보험료", "일정률 경감(예시)"], ["국민연금보험료", "기준소득 내 1/2 수준 지원(예시)"]] },
  { id: 102, name: "농작물·농업인 재해보험료 지원", ministry: "농림축산식품부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["농업인"], vtype: "voucher", valMin: 20, valMax: 300, amount: "보험료 50% 이상 국고", desc: "자연재해 농작물 피해·농작업 중 사고 대비 정책보험", channel: "지역 농협·NH손해보험", portal: "정부24", budget: "농업재해보험 8,871억 + 안전재해보험 956억원 ('26 열린재정)", src: true, law: "농어업재해보험법", brackets: [["농작물재해보험", "보험료 국고 50% + 지방비 추가"], ["농업인안전보험", "농작업 사고 보장, 보험료 50% 지원"]] },
  { id: 103, name: "청년농업인 영농정착지원", ministry: "농림축산식품부", ageMin: 19, ageMax: 39, incomeCap: 5, reqTags: ["농업인"], vtype: "cash", valMin: 660, valMax: 1320, amount: "월 최대 110만원 × 3년", desc: "만 40세 미만 청년농 정착지원금 (독립경영 3년 이하)", channel: "농림사업정보시스템(Agrix)", portal: "정부24", budget: "1,118억원 ('26 열린재정, 본예산+자율+제주)", src: true, law: "후계농어업인법", brackets: [["1년차", "월 110만원(예시)"], ["2~3년차", "월 90~100만원(예시)"], ["연계", "후계농 융자·농지은행 임대 우선"]] },
  { id: 104, name: "농지연금", ministry: "농림축산식품부", ageMin: 60, ageMax: 100, incomeCap: 5, reqTags: ["농업인"], vtype: "loan", valMin: 0, valMax: 0, amount: "농지 담보 월 연금", desc: "고령 농업인 소유 농지 담보 노후 연금 (주택연금의 농지판)", channel: "한국농어촌공사", portal: "정부24", budget: "2,766억원 ('26 열린재정, 융자)", src: true, law: "한국농어촌공사법", brackets: [["가입 연령", "60세 이상, 영농경력 5년 이상"], ["지급 방식", "종신형·기간형 월 지급"]] },
  { id: 105, name: "농식품바우처", ministry: "농림축산식품부", ageMin: 0, ageMax: 100, incomeCap: 1, vtype: "voucher", valMin: 48, valMax: 120, amount: "월 4~10만원 (가구원수별)", desc: "저소득 가구 신선 농식품 구매 바우처 — 먹거리 기본권", channel: "농식품바우처 카드·읍면동", portal: "정부24", budget: "740억원 ('26 열린재정)", src: true, law: "농업식품기본법", brackets: [["기초·차상위 가구", "가구원수별 월 4~10만원(예시)"], ["사용처", "과일·채소·우유 등 신선식품"]] },
  { id: 110, name: "수산 공익직불금", ministry: "해양수산부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["어업인"], vtype: "cash", valMin: 130, valMax: 500, amount: "소규모어가 130만원 등", desc: "수산자원 보호·어촌 유지 공익직불 (소규모어가·조건불리 등)", channel: "지자체·수협", portal: "정부24", budget: "1,193억원 ('26 열린재정)", src: true, law: "수산직접지불제법", brackets: [["소규모어가 직불", "가구당 연 130만원(예시)"], ["조건불리지역 직불", "어가당 연 수십만원(예시)"], ["경영이양·수산자원보호 직불", "유형별 별도"]] },
  { id: 111, name: "어선원·어선 재해보상보험", ministry: "해양수산부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["어업인"], vtype: "voucher", valMin: 20, valMax: 300, amount: "보험료 국고 지원", desc: "어선원 재해 보상과 어선 손해 대비 정책보험 (산재보험의 바다판)", channel: "수협중앙회", portal: "정부24", budget: "어선원·어선재해보험 1,821억 + 양식재해보험 248억원 ('26 열린재정)", src: true, law: "어선원재해보험법", brackets: [["어선원 보험", "재해 시 요양·휴업·유족급여"], ["보험료", "어선 규모별 국고 지원(3톤 미만 등 우대)"]] },
  { id: 112, name: "청년어촌정착지원", ministry: "해양수산부", ageMin: 19, ageMax: 39, incomeCap: 5, reqTags: ["어업인"], vtype: "cash", valMin: 660, valMax: 1320, amount: "월 최대 110만원 × 3년", desc: "만 40세 미만 청년 어업인 정착지원금 (청년농 미러 구조)", channel: "지자체·수협", portal: "정부24", budget: "81억원 ('26 열린재정)", src: true, law: "수산업·어촌 발전 기본법", brackets: [["1년차", "월 110만원(예시)"], ["2~3년차", "월 90~100만원(예시)"], ["어선청년임대", "'26 예산 20억원 (어선 임대 연계)"]] },
  { id: 113, name: "긴급경영안정자금(어업 재해 융자)", ministry: "해양수산부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["어업인"], vtype: "loan", valMin: 0, valMax: 0, amount: "재해 시 저리 융자", desc: "적조·고수온 등 재해 피해 어가 긴급 경영자금", channel: "수협", portal: "정부24", budget: "200억원 ('26 열린재정)", src: true, law: "농어업재해대책법", brackets: [["대상", "재해 피해 어가"], ["조건", "저리·상환유예(예시)"]] },
  { id: 115, name: "통합문화이용권(문화누리카드)", ministry: "문화체육관광부", ageMin: 6, ageMax: 100, incomeCap: 1, vtype: "voucher", valMin: 14, valMax: 14, amount: "연 14만원 수준(예시)", desc: "저소득층 문화·여행·체육 활동 카드 — 공연·영화·도서·교통 등", channel: "문화누리카드 누리집·읍면동", portal: "정부24", budget: "문화예술향유 지원 3,276억원 내 ('26 열린재정)", src: true, law: "문화예술진흥법", brackets: [["기초·차상위(6세 이상)", "1인당 연 14만원 수준(예시)"], ["사용처", "공연·영화·도서·숙박·철도 등"]] },
  { id: 116, name: "스포츠강좌이용권", ministry: "문화체육관광부", ageMin: 5, ageMax: 64, incomeCap: 1, vtype: "voucher", valMin: 120, valMax: 132, amount: "월 10~11만원 수준(예시)", desc: "저소득 유·청소년과 장애인의 체육강좌 수강권", channel: "스포츠강좌이용권 누리집", portal: "정부24", budget: "1,122억원 ('26 열린재정)", src: true, law: "국민체육진흥법", brackets: [["유·청소년(5~18세)", "월 10만원 수준(예시)"], ["장애인(5~64세)", "월 11만원 수준(예시), 소득요건 완화"]] },
  { id: 117, name: "예술인 창작준비금", ministry: "문화체육관광부", ageMin: 19, ageMax: 100, incomeCap: 3, reqTags: ["예술인"], vtype: "cash", valMin: 150, valMax: 300, valNote: "일시금", amount: "1인당 300만원 수준(예시)", desc: "예술활동증명 예술인의 창작 지속 지원 (창작안전망)", channel: "한국예술인복지재단", portal: "정부24", budget: "예술인 창작안전망 890억원 ('26 열린재정)", src: true, law: "예술인복지법", brackets: [["창작준비금", "300만원 수준 일시금(예시)"], ["신진 예술인", "별도 트랙(예시)"]] },
  { id: 118, name: "예술인 생활안정자금(융자)", ministry: "문화체육관광부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["예술인"], vtype: "loan", valMin: 0, valMax: 0, amount: "생활·전세자금 저리 융자", desc: "소득 불규칙한 예술인 대상 생활안정 융자", channel: "한국예술인복지재단", portal: "정부24", budget: "280억원 ('26 열린재정)", src: true, law: "예술인복지법", brackets: [["생활자금", "수백만원 한도 저리(예시)"], ["전세자금", "별도 한도(예시)"]] },
  { id: 120, name: "북한이탈주민 정착금·정착지원", ministry: "통일부", ageMin: 0, ageMax: 100, incomeCap: 5, reqTags: ["북한이탈주민"], vtype: "cash", valMin: 1000, valMax: 2000, valNote: "일시금+장려금 예시", amount: "정착기본금 + 장려금", desc: "입국 초기 정착기본금과 직업훈련·취업 장려금, 하나센터 밀착 지원", channel: "하나원·남북하나재단·하나센터", portal: "정부24", budget: "정착금 118억 + 교육훈련 143억 + 지원재단 366억원 ('26 열린재정)", src: true, law: "북한이탈주민법", brackets: [["정착기본금", "1인 세대 1,000만원 수준(예시, 분할 지급)"], ["직업훈련·자격취득 장려금", "과정별 수백만원(예시)"], ["주거지원", "임대주택 알선 + 주거지원금 별도"]] },
  { id: 121, name: "북한이탈주민 교육지원", ministry: "통일부", ageMin: 6, ageMax: 34, incomeCap: 5, reqTags: ["북한이탈주민"], vtype: "voucher", valMin: 100, valMax: 800, amount: "대학 등록금 면제·보조", desc: "만 35세 미만 입학 시 국공립대 등록금 면제, 사립대 반액 지원", channel: "남북하나재단·한국장학재단", portal: "정부24", budget: "교육훈련 143억원 내 ('26 열린재정)", src: true, law: "북한이탈주민법", brackets: [["국공립대", "등록금 면제"], ["사립대", "반액 지원"], ["초중고", "편입학·학습 지원(하나둘학교 등)"]] },
  { id: 122, name: "이산가족 교류지원", ministry: "통일부", ageMin: 0, ageMax: 100, incomeCap: 5, reqTags: ["이산가족"], vtype: "cash", valMin: 100, valMax: 600, valNote: "교류 시 예시", amount: "생사확인·상봉·서신 경비", desc: "남북 이산가족 개별 생사확인·상봉·교류 경비 지원", channel: "이산가족정보통합시스템·대한적십자사", portal: "정부24", budget: "이산가족교류지원 134억 + 문제해결지원 5억원 ('26 열린재정)", src: true, law: "남북 이산가족 생사확인 및 교류 촉진법", brackets: [["생사확인", "경비 수백만원 수준(예시)"], ["상봉·서신교환", "유형별 정액(예시)"], ["교류 주선", "적십자 신청"]] },
  { id: 130, name: "수출경쟁력 강화지원(해외인증 등)", ministry: "산업통상부", audience: "biz", sizes: ["중소기업", "중견기업"], bizTags: ["수출 희망"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 500, valMax: 3000, amount: "해외인증·판로 지원", desc: "해외규격 인증 획득, 수출 판로 개척 비용 지원", channel: "KOTRA·산업부 공고", portal: "정부24", budget: "414억원 ('26 열린재정)", src: true, law: "대외무역법", brackets: [["해외인증", "인증 취득비 일부(예시)"], ["판로 개척", "전시회·상담회 지원"]] },
  { id: 131, name: "뿌리산업 경쟁력강화 지원", ministry: "산업통상부", audience: "biz", sizes: ["중소기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 1000, valMax: 5000, amount: "공정개선·자동화 지원", desc: "주조·금형·용접 등 뿌리기업 공정 혁신 지원", channel: "국가뿌리산업진흥센터", portal: "정부24", budget: "97억원 ('26 열린재정)", src: true, law: "뿌리산업법", brackets: [["공정 개선", "기업당 수천만원(예시)"]] },
  { id: 140, name: "아이돌봄서비스", ministry: "성평등가족부", ageMin: 19, ageMax: 54, incomeCap: 4, reqTags: ["자녀 양육"], vtype: "voucher", valMin: 100, valMax: 1000, amount: "돌보미 이용료 소득별 지원", desc: "12세 이하 자녀 가정 방문 돌봄 — 맞벌이·야간·긴급 돌봄 공백 해소", channel: "아이돌봄서비스 누리집·앱", portal: "정부24", budget: "5,978억원 ('26 열린재정, 성평등가족부 최대 사업)", src: true, law: "아이돌봄 지원법", brackets: [["시간제", "시간당 정부지원 소득구간별 15~90%(예시)"], ["영아종일제", "0~2세 월 한도 내 지원"], ["긴급·단시간", "야간·주말 포함"]] },
  { id: 141, name: "여성 새로일하기센터(경력단절 재취업)", ministry: "성평등가족부", ageMin: 25, ageMax: 60, incomeCap: 5, gender: "F", reqTags: ["구직 중"], vtype: "service", valMin: 0, valMax: 0, amount: "직업훈련·인턴 연계", desc: "경력단절 여성 맞춤 취업상담·직업교육훈련·새일여성인턴", channel: "새일센터(전국)·여성워크넷", portal: "정부24", budget: "여성경제활동 촉진지원 1,002억원 ('26 열린재정)", src: true, law: "여성경제활동법", brackets: [["직업교육훈련", "무료 과정"], ["새일여성인턴", "기업 채용 연계 지원금(예시)"], ["돌봄 연계", "훈련 중 자녀돌봄 지원"]] },
  { id: 142, name: "다문화가족 지원", ministry: "성평등가족부", ageMin: 0, ageMax: 100, incomeCap: 5, reqTags: ["다문화가족"], vtype: "service", valMin: 0, valMax: 0, amount: "통번역·방문교육·자녀지원", desc: "가족센터 기반 한국어·통번역, 자녀 언어발달·학습 지원", channel: "가족센터(전국)·다누리콜센터 1577-1366", portal: "정부24", budget: "건강가정 및 다문화가족 지원 1,514억원 ('26 열린재정)", src: true, law: "다문화가족지원법", brackets: [["방문교육", "한국어·부모교육 가정방문"], ["자녀 지원", "언어발달·이중언어·학습"], ["통번역", "센터 배치 통번역사"]] },
  { id: 150, name: "출소자 사회복귀 지원(법무보호복지)", ministry: "법무부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["출소(예정)자"], vtype: "service", valMin: 0, valMax: 0, amount: "숙식·주거·취업·창업 지원", desc: "출소자 갱생보호 — 생활관 숙식, 주거지원, 허그일자리 취업, 창업 지원", channel: "한국법무보호복지공단(전국 지부)", portal: "정부24", budget: "갱생보호활동 485억원 ('26 열린재정)", src: true, law: "보호관찰 등에 관한 법률", brackets: [["숙식 제공", "생활관 최대 2년(예시)"], ["주거지원", "임대주택 연계"], ["허그일자리", "직업훈련 + 취업알선 + 수당(예시)"], ["가족 지원", "가족희망사업 병행"]] },
  { id: 151, name: "수용자 직업훈련·교정교화", ministry: "법무부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["출소(예정)자"], vtype: "service", valMin: 0, valMax: 0, amount: "기술훈련·자격취득·작업장려금", desc: "수용 중 직업훈련·검정고시·교도작업 (출소 후 자립 기반)", channel: "교정시설 내 신청", portal: "정부24", budget: "직업훈련 51억 + 교정교화 133억 + 교도작업 650억원 ('26 열린재정)", src: true, law: "형집행법", brackets: [["직업훈련", "용접·조리 등 자격과정"], ["교도작업", "작업장려금 적립 → 출소 시 지급"], ["학과교육", "검정고시·방송통신 과정"]] },
  { id: 152, name: "범죄피해자 구조금·치료지원", conditional: true, ministry: "법무부", ageMin: 0, ageMax: 100, incomeCap: 5, reqTags: ["범죄 피해자"], vtype: "cash", valMin: 500, valMax: 5000, valNote: "피해 유형별", amount: "구조금 + 치료·자립지원", desc: "강력범죄 피해자·유족 구조금, 치료비·심리지원·이전비", channel: "검찰청 피해자지원실·범죄피해자지원센터 1577-2584", portal: "정부24", budget: "구조금 118억 + 치료·자립지원 280억 + 피해자보호기금 ('26 열린재정)", src: true, law: "범죄피해자 보호법", brackets: [["유족구조금", "최대 1억원대(예시)"], ["장해·중상해구조금", "등급별(예시)"], ["치료비·심리치료", "스마일센터 등"], ["국선변호사", "'26 예산 121억원 (성폭력 등)"]] },
  { id: 153, name: "법률구조(무료 법률지원)", ministry: "법무부", ageMin: 0, ageMax: 100, incomeCap: 3, vtype: "service", valMin: 0, valMax: 0, amount: "무료 법률상담·소송대리", desc: "저소득 국민 무료 법률상담과 소송 대리 (대한법률구조공단)", channel: "법률구조공단 132", portal: "정부24", budget: "666억원 ('26 열린재정)", src: true, law: "법률구조법", brackets: [["무료 대상", "중위소득 이하·한부모·장애인 등"], ["범위", "민사·가사·형사 등"]] },
  { id: 160, name: "지역사랑상품권(할인 구매)", conditional: true, ministry: "행정안전부", ageMin: 0, ageMax: 100, incomeCap: 5, vtype: "voucher", valMin: 30, valMax: 120, valNote: "할인액 환산 예시", amount: "액면가 5~15% 할인 구매", desc: "거주 지역 상품권을 할인 구매해 지역 가맹점에서 사용 — 인구감소지역 할인폭 우대", channel: "지역상품권 앱(지자체별)·농협", portal: "정부24", budget: "발행지원 1조 1,500억원 ('26 열린재정)", src: true, law: "지역사랑상품권법", brackets: [["일반 지역", "5~10% 할인(지자체별)"], ["인구감소지역", "할인폭·한도 우대"], ["월 구매 한도", "지자체별 수십만원"]] },
  { id: 161, name: "풍수해·지진재해보험", ministry: "행정안전부", ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "voucher", valMin: 5, valMax: 50, valNote: "보험료 지원 예시", amount: "보험료 70% 이상 국고·지방 지원", desc: "주택·온실·소상공인 상가의 태풍·호우·지진 피해 대비 정책보험", channel: "지자체·취급 보험사", portal: "정부24", budget: "490억원 ('26 열린재정)", src: true, law: "풍수해·지진재해보험법", brackets: [["일반 가입자", "보험료 70% 내외 지원"], ["차상위·기초수급", "최대 92~100% 지원(예시)"], ["대상", "주택·비닐온실·소상공인 상가/공장"]] },
  { id: 162, name: "농어촌 기본소득 (시범)", ministry: "농식품부·지자체", ageMin: 0, ageMax: 100, incomeCap: 5, regionReq: "shrink", vtype: "cash", valMin: 180, valMax: 180, amount: "월 15만원 (지역화폐)", desc: "'26년 인구감소지역 6곳 시범 — 거주 주민 약 24만 명에 월 15만원", channel: "시범 지자체 공모 선정 지역", portal: "정부24", budget: "'26 시범사업 (6개 지역 공모)", src: true, law: "농어촌 기본소득 시범사업", brackets: [["대상", "선정 지역 거주 전 주민"], ["지급", "월 15만원 지역화폐"], ["유의", "시범 6곳 한정 — 거주지 선정 여부 확인 필요"]] },
  { id: 163, name: "청년일자리도약장려금", ministry: "고용노동부", audience: "biz", sizes: ["소상공인", "중소기업"], bizTags: ["청년·고령자 채용 계획"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 480, valMax: 720, amount: "청년 1인 채용 시 2년간 480만~720만원", desc: "취업애로청년 정규직 채용 기업 지원 — '26년 지역 차등 도입", channel: "고용24", portal: "고용24", budget: "'26년 지역차등 시행 (고용보험기금)", src: true, law: "고용보험법", brackets: [["일반 지역", "2년간 480만원"], ["인구감소 특별지역", "2년간 720만원 ('26 우대)"], ["요건", "취업애로청년 정규직 채용 + 6개월 이상 고용 유지"]] },
  { id: 170, name: "희귀질환자 의료비 지원", ministry: "질병관리청", ageMin: 0, ageMax: 100, incomeCap: 3, vtype: "voucher", valMin: 50, valMax: 500, amount: "요양급여 본인부담금 지원", desc: "희귀질환 산정특례 등록자의 의료비 본인부담 경감 (1,300여 개 질환)", channel: "희귀질환 헬프라인·보건소", portal: "정부24", budget: "233억원 ('26 열린재정)", src: true, law: "희귀질환관리법", brackets: [["대상", "지정 희귀질환 + 소득기준(중위 120% 수준·예시)"], ["지원", "요양급여 본인부담금, 일부 간병비"], ["산정특례 연계", "본인부담률 10%로 경감"]] },
  { id: 171, name: "재난적 의료비 지원", conditional: true, ministry: "보건복지부", ageMin: 0, ageMax: 100, incomeCap: 3, vtype: "cash", valMin: 100, valMax: 5000, valNote: "발생 시", amount: "연 최대 5,000만원", desc: "소득 대비 감당하기 어려운 의료비 발생 시 본인부담 일부 지원", channel: "건보공단 지사 (퇴원 후 180일 내)", portal: "정부24", budget: "105억원 ('26 열린재정) + 기금", src: true, law: "재난적의료비 지원법", brackets: [["대상", "중위 100% 이하 중심 (재산·의료비 비중 심사)"], ["지원율", "본인부담의 50~80%"], ["한도", "연 최대 5,000만원"]] },
  { id: 172, name: "결핵환자 치료·지원", ministry: "질병관리청", ageMin: 0, ageMax: 100, incomeCap: 5, vtype: "service", valMin: 0, valMax: 0, amount: "치료비 본인부담 면제", desc: "결핵 진단·치료비 국가 부담, 입원명령 환자 생활보호비 지원", channel: "보건소·의료기관", portal: "정부24", budget: "국가결핵예방 395억원 ('26 열린재정)", src: true, law: "결핵예방법", brackets: [["치료비", "산정특례로 본인부담 면제"], ["입원명령 환자", "생활보호비·부양가족 지원(예시)"], ["잠복결핵", "검진·치료 무료"]] },
  { id: 173, name: "장애인 의료비 지원", ministry: "보건복지부", ageMin: 0, ageMax: 100, incomeCap: 1, disability: "any", vtype: "service", valMin: 0, valMax: 0, amount: "의료비 본인부담 지원", desc: "의료급여 2종·차상위 장애인의 진료 본인부담금 지원", channel: "행정복지센터·의료기관", portal: "복지로", budget: "574억원 ('26 열린재정)", src: true, law: "장애인복지법", brackets: [["외래·입원", "본인부담금 전액 또는 대부분 지원"], ["대상", "의료급여 2종·차상위 등록장애인"]] },
  { id: 180, name: "사할린한인 영주귀국·정착 지원", ministry: "재외동포청", ageMin: 0, ageMax: 100, incomeCap: 5, reqTags: ["재외동포"], vtype: "service", valMin: 0, valMax: 0, amount: "귀국비용·임대주택·정착 지원", desc: "사할린 강제동원 한인과 동반가족의 영주귀국 및 국내 정착 지원", channel: "재외동포청·대한적십자사", portal: "정부24", budget: "78억원 ('26 열린재정)", src: true, law: "사할린동포 지원에 관한 특별법", brackets: [["귀국", "항공료 등 귀국비용"], ["주거", "임대주택 입주 지원"], ["생활", "정착금·생활안정 지원"]] },
  { id: 181, name: "고려인 등 역사적 특수동포 지원", ministry: "재외동포청", ageMin: 0, ageMax: 100, incomeCap: 5, reqTags: ["재외동포"], vtype: "service", valMin: 0, valMax: 0, amount: "국내 정착·한국어·취업 연계", desc: "고려인·사할린 동포 등 역사적 특수동포의 국내 체류·정착 지원", channel: "재외동포청·지역 지원센터", portal: "정부24", budget: "111억원 ('26 열린재정)", src: true, law: "재외동포기본법", brackets: [["정착", "한국어 교육·생활 안내"], ["취업", "직업훈련·일자리 연계"], ["자녀", "학교 편입 지원"]] },
  { id: 182, name: "재외동포 자녀 교육 지원(한글학교)", ministry: "재외동포청", ageMin: 0, ageMax: 24, incomeCap: 5, reqTags: ["재외동포"], vtype: "service", valMin: 0, valMax: 0, amount: "한글학교·모국 연수", desc: "해외 거주 동포 자녀의 한글학교 교육과 모국 초청 연수 지원", channel: "재외공관·한글학교", portal: "정부24", budget: "재외동포 교육문화 지원 232억원 ('26 열린재정)", src: true, law: "재외동포기본법", brackets: [["한글학교", "전 세계 운영비·교사 지원"], ["차세대", "모국 초청연수·장학 ('26 예산 14억원)"]] },
  { id: 183, name: "재외동포 원스톱 민원·국내 정착", ministry: "재외동포청", ageMin: 0, ageMax: 100, incomeCap: 5, reqTags: ["재외동포"], vtype: "service", valMin: 0, valMax: 0, amount: "민원·비자·정착 상담", desc: "국내 체류·귀국 동포를 위한 통합 민원 서비스와 정착 상담", channel: "재외동포서비스지원센터(1588-0100)", portal: "정부24", budget: "원스톱 민원 16억 + 국내 정착지원 13억원 ('26 열린재정)", src: true, law: "재외동포기본법", brackets: [["민원", "체류·국적·병역 등 통합 안내"], ["정착", "국내 생활 초기 상담"]] },
  { id: 185, name: "농업기술센터 지도·신기술 시범 지원", ministry: "농촌진흥청", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["농업인"], vtype: "service", valMin: 0, valMax: 0, amount: "기술상담·교육 무료 + 시범농가 보조", desc: "시·군 농업기술센터의 영농 기술지도, 신기술 시범농가 선정 시 시설·장비 보조", channel: "시·군 농업기술센터", portal: "정부24", budget: "지역농촌지도 634억 + 신기술보급 389억 + 교육훈련 69억원 ('26 열린재정)", src: true, law: "농촌진흥법", brackets: [["기술지도·상담", "작목별 영농 상담·교육 무료"], ["신기술 시범농가", "선정 시 시설·장비 보조 50% 내외(예시)"], ["농기계 안전교육", "무료 ('26 예산 28억원)"], ["치유농업·가공 체험", "센터별 프로그램 운영"]] },
  { id: 190, name: "여성기업 지원(여성기업확인·공공구매 등)", ministry: "중소벤처기업부", audience: "biz", gender: "F", sizes: ["예비창업자", "소상공인", "중소기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 100, valMax: 3000, amount: "공공판로·자금·보증 우대", desc: "여성이 소유·경영하는 기업에 대한 판로·자금·창업 종합 지원", channel: "여성기업종합지원센터·한국여성경제인협회", portal: "정부24", budget: "여성기업육성 117억원 ('26 열린재정)", src: true, law: "여성기업지원법", brackets: [["여성기업 확인서", "공공기관 여성기업제품 의무구매(구매목표제) 판로 우대"], ["정책자금·보증", "여성 특화 자금·보증료 우대(예시)"], ["여성창업보육센터", "입주·멘토링"], ["여성가장 창업자금", "저리 융자 별도(예시)"]] },
  { id: 191, name: "장애인기업 지원(장애인기업확인 등)", ministry: "중소벤처기업부", audience: "biz", disability: "any", sizes: ["예비창업자", "소상공인", "중소기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 100, valMax: 3000, amount: "공공판로·창업·자금 우대", desc: "장애인이 소유·경영하는 기업의 창업·판로·경영 종합 지원", channel: "장애인기업종합지원센터", portal: "정부24", budget: "장애인기업육성 138억원 ('26 열린재정)", src: true, law: "장애인기업활동촉진법", brackets: [["장애인기업 확인서", "공공기관 의무구매 1% 판로 우대"], ["창업 지원", "창업점포·사업화 자금(예시)"], ["경영 지원", "자금·기술 컨설팅"]] },
  { id: 192, name: "중소기업협동조합 육성", ministry: "중소벤처기업부", audience: "biz", sizes: ["소상공인", "중소기업"], ageMin: 19, ageMax: 100, incomeCap: 5, vtype: "grant", valMin: 0, valMax: 0, amount: "공동사업 지원", desc: "동종 업종 협동조합 결성 시 공동구매·공동판매 등 공동사업 지원", channel: "중소기업중앙회", portal: "정부24", budget: "175억원 ('26 열린재정)", src: true, law: "중소기업협동조합법", brackets: [["공동사업", "공동구매·물류·판로 지원"], ["조합 결성", "설립 컨설팅"]] },
  { id: 200, name: "주거안정장학금", ministry: "교육부", ageMin: 19, ageMax: 39, incomeCap: 1, reqTags: ["대학(원) 재학"], vtype: "cash", valMin: 240, valMax: 240, amount: "월 20만원", desc: "원거리 대학 진학 기초·차상위 대학생의 주거비 부담 경감", channel: "한국장학재단", portal: "한국장학재단", budget: "175억원 ('26 사업설명자료 검증)", src: true, law: "한국장학재단 설립 등에 관한 법률", brackets: [["대상", "원거리 진학 기초·차상위 대학생"], ["지원", "월 20만원 주거비"]] },
  { id: 210, name: "임업직불금", ministry: "산림청", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["임업인"], vtype: "cash", valMin: 130, valMax: 500, amount: "소규모임가 130만원 등", desc: "임야 대상 임업·산림 공익직불 (농업 공익직불의 산림판)", channel: "지자체 산림부서·산림청", portal: "정부24", budget: "산림청 파일 반영 대기 (예시, 약 600억원 규모)", law: "임업·산림 공익직불법", brackets: [["소규모임가 직불", "가구당 연 130만원(예시)"], ["면적직불", "임야 면적 구간별 단가(예시)"], ["요건", "임야 소재 임업경영체 등록"]] },
  { id: 220, name: "전세사기 피해자 지원", ministry: "국토교통부", ageMin: 19, ageMax: 100, incomeCap: 5, reqTags: ["전세사기 피해"], vtype: "service", valMin: 0, valMax: 0, amount: "긴급주거·저리대출·경공매 지원", desc: "전세사기피해자 결정을 받은 임차인의 주거·금융·법률 종합 지원", channel: "전세피해지원센터(1533-8119)·지자체", portal: "정부24", budget: "피해방지·지원 718억원 ('26 2-1, 전년비 +34%) + LH 피해주택 매입 별도", src: true, law: "전세사기피해자 지원 특별법", brackets: [["긴급 주거", "LH 임시거처 제공"], ["금융", "버팀목 특례 저리 대출·기존 대출 대환"], ["경·공매", "대행 지원, 우선매수권"], ["LH 매입", "피해주택 매입 후 공공임대로 재임대"]] },
  { id: 33, name: "해산·장제급여", ministry: "보건복지부", ageMin: 0, ageMax: 100, incomeCap: 0, vtype: "cash", valMin: 70, valMax: 80, valNote: "일시금", amount: "해산 70만·장제 80만원", desc: "수급자 출산 시 해산급여, 사망 시 장제급여 — 탄생부터 삶의 마지막까지", channel: "행정복지센터", portal: "복지로", budget: "519억원 ('26 열린재정·사업설명자료 검증)", src: true, law: "국민기초생활보장법", brackets: [["해산급여 (출산 시)", "70만원 ('26 2-1 검증)"], ["장제급여 (사망 시)", "1구당 80만원 ('26 2-1 검증)"]] },
];

const N_PERSONAL = BENEFITS.filter((b) => (b.audience || "personal") === "personal").length;
const N_BIZ = BENEFITS.filter((b) => b.audience === "biz").length;

const stageOf = (age) => STAGES.find((s) => age >= s.min && age <= s.max) || STAGES[4];
const VBADGE = { cash: ["현금", "#3E9E74"], voucher: ["바우처", "#DBA53A"], service: ["서비스", "#4E8FD1"], loan: ["융자", "#96588B"], grant: ["장려금", "#CE6B47"] };
/* 중복수급 배타 그룹: 같은 그룹은 동시 수급 불가(또는 상계) → 합산 시 유리한 1개만 반영 */
const EXCL_INFO = {
  youthAsset: "청년도약계좌와 청년미래적금은 중복 가입할 수 없습니다 (도약계좌 → 미래적금 갈아타기만 가능).",
  housing: "주거급여 수급 가구는 청년월세 특별지원을 중복 수급할 수 없습니다.",
  jobIncome: "구직급여·국민취업지원·자활급여는 동시에 받을 수 없습니다 (기간을 달리한 순차 이용은 가능).",
  infantCare: "부모급여와 보육료 지원은 중복 시 보육료를 차감한 차액만 지급됩니다.",
  scholarship: "국가장학금과 대통령과학장학금 등 이공계 우수장학은 중복 수혜가 제한됩니다 (국가근로장학금은 병행 가능).",
  basicOffset: "기초연금은 생계급여의 소득인정액에 산입되어 사실상 상계됩니다 ('26년 개편 논의 중).",
};

const gateOf = (b) => {
  if (b.incomeCap < 5) return ["소득심사형", "#CE6B47"];
  if (b.reqTags || b.anyTags || b.vet || b.mil || b.disability || b.gender || b.regionReq) return ["요건형", "#4E8FD1"];
  return ["보편형", "#3E9E74"];
};
const fmt = (v) => (v >= 10000 ? `${(v / 10000).toFixed(1).replace(/\.0$/, "")}억` : `${v.toLocaleString()}만`);

const DEFAULT_PROFILE = {
  age: 25, gender: "F", income: "mid100", household: 1, childCount: 0, childAge: 0, job: "none",
  tags: [], vet: "none", mil: "none", disability: "none", region: "metro",
  audience: "personal", bizSize: "소상공인", bizTags: [],
};

const PRESETS = [
  { label: "👶 신생아 가정", set: { age: 32, gender: "F", income: "mid100", household: 3, childCount: 1, childAge: 0, tags: [], vet: "none", mil: "none", disability: "none", region: "metro", audience: "personal" } },
  { label: "🎓 대학생(25)", set: { age: 25, gender: "F", income: "mid100", household: 1, tags: ["대학(원) 재학"], vet: "none", mil: "none", disability: "none", region: "nonmetro", audience: "personal" } },
  { label: "🤰 출산 앞둔 직장인(32)", set: { age: 32, gender: "F", income: "mid150", household: 2, tags: ["임신 중", "재직 중"], vet: "none", mil: "none", disability: "none", region: "metro", audience: "personal" } },
  { label: "💼 실직한 40대 가장", set: { age: 45, gender: "M", income: "mid50", household: 4, tags: ["구직 중", "자녀 양육", "무주택"], vet: "none", mil: "none", disability: "none", region: "nonmetro", audience: "personal" } },
  { label: "🏪 소상공인 사장님", set: { age: 48, audience: "biz", bizSize: "소상공인", bizTags: [] } },
  { label: "🌾 인구감소지역 어르신(68)", set: { age: 68, gender: "F", income: "mid50", household: 2, tags: [], vet: "none", mil: "none", disability: "none", region: "shrink", audience: "personal" } },
  { label: "🎖️ 참전유공자(75)", set: { age: 75, gender: "M", income: "mid100", household: 2, tags: [], vet: "self", mil: "none", disability: "none", region: "nonmetro", audience: "personal" } },
];

export default function LifecycleBenefitNavigator({ liveBudgets = {} }) {
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState("F");
  const [income, setIncome] = useState("mid100");
  const [household, setHousehold] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [childAge, setChildAge] = useState(0);
  const [job, setJob] = useState("none");
  const [disability, setDisability] = useState("none");
  const [vet, setVet] = useState("none");
  const [mil, setMil] = useState("none");
  const [region, setRegion] = useState("metro");
  const [query, setQuery] = useState("");
  const [bigText, setBigText] = useState(false);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const [tags, setTags] = useState(["대학(원) 재학"]);
  const [selected, setSelected] = useState(null);
  const [audience, setAudience] = useState("personal");
  const [bizSize, setBizSize] = useState("소상공인");
  const [bizTags, setBizTags] = useState([]);

  const incomeRank = INCOME_LEVELS.find((l) => l.id === income).rank;
  const base = MEDIAN_BASE[household - 1];

  const incomeLabel = (l) => {
    if (l.id === "above" || l.id === "basic" || l.id === "unknown") return l.label;
    return `${l.label} (월 세전 ~${Math.round(base * l.ratio).toLocaleString()}만원)`;
  };

  const applyPreset = (ps) => {
    /* 이전 선택이 남지 않도록 기본 프로필로 전체 초기화 후 프리셋 적용 */
    const f = { ...DEFAULT_PROFILE, ...ps };
    setAge(f.age); setGender(f.gender); setIncome(f.income); setHousehold(f.household);
    setChildCount(f.childCount); setChildAge(f.childAge); setJob(f.job); setTags(f.tags);
    setVet(f.vet); setMil(f.mil); setDisability(f.disability); setRegion(f.region);
    setAudience(f.audience); setBizSize(f.bizSize); setBizTags(f.bizTags);
  };

  const toggleBizTag = (t) =>
    setBizTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const toggleTag = (t) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  /* 자녀 수 → 자녀 양육·다자녀 태그 자동 파생 (다자녀 기준은 사업별 2 또는 3자녀) */
  const tagsEff = [...tags];
  if (childCount >= 1 && !tagsEff.includes("자녀 양육")) tagsEff.push("자녀 양육");
  if (childCount >= 2 && !tagsEff.includes("다자녀")) tagsEff.push("다자녀");
  if (JOB_TAG[job] && !tagsEff.includes(JOB_TAG[job])) tagsEff.push(JOB_TAG[job]);

  const matchesProfile = (b) => {
    if ((b.audience || "personal") !== audience) return false;
    if (audience === "biz") {
      if (b.gender && b.gender !== gender) return false;
      if (b.disability) {
        if (disability === "none") return false;
        if (b.disability !== "any" && b.disability !== disability) return false;
      }
      if (b.sizes && !b.sizes.includes(bizSize)) return false;
      if (b.bizTags && !b.bizTags.some((t) => bizTags.includes(t))) return false;
      return true;
    }
    if (income !== "unknown" && incomeRank > b.incomeCap) return false;
    if (b.gender && b.gender !== gender) return false;
    if (b.disability) {
      if (disability === "none") return false;
      if (b.disability !== "any" && b.disability !== disability) return false;
    }
    if (b.regionReq === "shrink" && region !== "shrink") return false;
    if (b.regionReq === "nonmetro" && region === "metro") return false;
    if (b.mil) {
      if (mil === "none") return false;
      if (b.mil === "any") { if (mil === "reserve") return false; }
      else if (b.mil !== mil) return false;
    }
    if (b.vet) {
      if (vet === "none") return false;
      if (b.vet !== "any" && b.vet !== vet) return false;
    }
    if (b.reqTags && !b.reqTags.every((t) => tagsEff.includes(t))) return false;
    if (b.anyTags && !b.anyTags.some((t) => tagsEff.includes(t))) return false;
    return true;
  };

  const profileMatched = useMemo(() => BENEFITS.filter(matchesProfile), [income, tags, childCount, job, gender, disability, vet, mil, region, audience, bizSize, bizTags]);
  /* ageTarget:"child" 사업(아동수당 등)은 신청자 나이가 아니라 막내 자녀 나이로 판정 */
  const ageFor = (b) => (b.ageTarget === "child" ? childAge : age);
  const nowEligibleAll = profileMatched.filter((b) => ageFor(b) >= b.ageMin && ageFor(b) <= b.ageMax);
  /* 잠재 혜택: 소득 미상×소득요건 / 자녀 정보 미입력×자녀 기준 사업 → 확정 합계에서 제외 */
  const reviewNeeded = nowEligibleAll.filter((b) =>
    (income === "unknown" && b.incomeCap < 5) ||
    (b.perChild && childCount === 0) ||
    (b.ageTarget === "child" && childCount === 0)
  );
  const nowEligible = nowEligibleAll.filter((b) => !reviewNeeded.includes(b));
  const rvMult = (b) => (b.perChild ? Math.max(childCount, 1) : 1);
  const reviewCashes = reviewNeeded.filter((b) => (b.vtype === "cash" || b.vtype === "voucher") && !b.conditional);
  const reviewMax = reviewCashes.reduce((t, b) => t + b.valMax * rvMult(b), 0);
  const upcoming = profileMatched
    .filter((b) => (b.ageTarget === "child" ? childCount > 0 && b.ageMin > childAge : b.ageMin > age))
    .sort((a, b) => a.ageMin - b.ageMin);
  const ministries = new Set(nowEligible.map((b) => b.ministry));
  const curStage = stageOf(age);

  const sumable = nowEligible.filter((b) => (b.vtype === "cash" || b.vtype === "voucher") && !b.conditional);
  const condCount = nowEligible.filter((b) => b.conditional).length;
  /* 배타 그룹은 valMax가 가장 큰 사업 1개만 합산 */
  const exclGroups = {};
  const exclCounts = {};
  const sumSingles = [];
  sumable.forEach((b) => {
    if (b.excl) {
      (exclGroups[b.excl] = exclGroups[b.excl] || []).push(b);
      exclCounts[b.excl] = (exclCounts[b.excl] || 0) + 1;
    } else sumSingles.push(b);
  });
  const sumPicks = [...sumSingles, ...Object.values(exclGroups).map((g) => g.reduce((a, b) => (b.valMax > a.valMax ? b : a)))];
  const kMult = (b) => (b.perChild ? childCount : 1);
  const totalMin = sumPicks.reduce((s, b) => s + b.valMin * kMult(b), 0);
  const totalMax = sumPicks.reduce((s, b) => s + b.valMax * kMult(b), 0);
  const cashN = sumPicks.filter((b) => b.vtype === "cash").length;
  const vouchN = sumPicks.filter((b) => b.vtype === "voucher").length;
  const dedupCount = sumable.length - sumPicks.length;
  const dedupNames = sumable.filter((b) => !sumPicks.includes(b)).map((b) => b.name);
  const etcCount = nowEligible.length - sumable.length;

  /* 기업 모드: 장려금·바우처(grant) 합산, 융자는 건수 별도 */
  const bizSumable = nowEligible.filter((b) => b.vtype === "grant" && b.valMax > 0);
  const bizMin = bizSumable.reduce((t, b) => t + b.valMin, 0);
  const bizMax = bizSumable.reduce((t, b) => t + b.valMax, 0);
  const bizLoanCount = nowEligible.filter((b) => b.vtype === "loan").length;

  const searchHits = query.trim()
    ? BENEFITS.filter((b) => (b.name + b.ministry + (b.desc || "")).includes(query.trim())).slice(0, 10)
    : [];

  const spectrum = `linear-gradient(90deg, ${STAGES.map(
    (s) => `${s.color} ${s.min}% ${Math.min(s.max + 1, 100)}%`
  ).join(", ")})`;

  return (
    <div style={{ zoom: bigText ? 1.18 : 1, minHeight: "100vh", background: "#F4F6F5", color: "#22303C", fontFamily: "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;800&display=swap');
        .serif { font-family: 'Noto Serif KR', serif; }
        .chip { border:1px solid #C9D2CE; border-radius:999px; padding:6px 12px; font-size:12.5px; background:#fff; cursor:pointer; transition:all .15s; }
        .chip.on { background:#22303C; color:#fff; border-color:#22303C; }
        input[type=range]{ -webkit-appearance:none; width:100%; height:14px; border-radius:7px; outline:none; }
        input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:26px; height:26px; border-radius:50%; background:#fff; border:3px solid #22303C; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.25); }
        .card { background:#fff; border-radius:12px; padding:14px 16px; box-shadow:0 1px 3px rgba(34,48,60,.08); }
        .clickable { cursor:pointer; transition:transform .1s, box-shadow .15s; }
        .clickable:hover { transform:translateY(-1px); box-shadow:0 4px 10px rgba(34,48,60,.14); }
        .dtbl td { padding:7px 10px; font-size:13px; border-bottom:1px solid #EEF2F0; vertical-align:top; }
        .dtbl td:first-child { color:#5B6A63; width:42%; }
        .dtbl td:last-child { font-weight:600; }
        .vbadge { font-size:10.5px; font-weight:800; padding:2px 7px; border-radius:999px; color:#fff; }
        .flabel { font-size:13px; font-weight:700; margin-bottom:8px; }
      `}</style>

      <header style={{ padding: "28px 20px 18px", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, letterSpacing: 2, background: "#22303C", color: "#fff", padding: "3px 8px", borderRadius: 4 }}>DEMO v4.0</span>
          <span style={{ fontSize: 12, color: "#7A8880" }}>예시 데이터 · 실제 요건과 다를 수 있음</span>
          <button onClick={() => setBigText(!bigText)}
            style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999, border: "1px solid #C9D2CE", background: bigText ? "#22303C" : "#fff", color: bigText ? "#fff" : "#5B6A63", cursor: "pointer" }}>
            가 큰글씨
          </button>
        </div>
        <h1 className="serif" style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.3 }}>
          국민 생애주기 혜택 내비게이터
        </h1>
        <p style={{ margin: "6px 0 4px", fontSize: 14, color: "#5B6A63" }}>
          태어나는 순간부터 노년까지 — 나의 정부 혜택을 한 화면에서
        </p>
        <div style={{ fontSize: 11.5, color: "#8B968F", margin: "0 0 14px" }}>
          {`21개 부처·청 · '26년 세부사업 6,400여 개 분석 · 개인 ${N_PERSONAL} + 기업 ${N_BIZ} = 총 ${N_PERSONAL + N_BIZ}개 사업 수록 · 지자체 추가지원 별도`}
        </div>
        <div style={{ height: 8, borderRadius: 4, background: spectrum }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7A8880", marginTop: 4 }}>
          {STAGES.map((s) => (<span key={s.id} style={{ color: s.color, fontWeight: 700 }}>{s.name}</span>))}
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px 60px" }}>
        {/* 모드 탭 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["personal", "국민 개인·가구"], ["biz", "사업주·창업·기업"]].map(([v, l]) => (
            <button key={v} onClick={() => setAudience(v)} style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: audience === v ? "2px solid #22303C" : "1px solid #C9D2CE", background: audience === v ? "#22303C" : "#fff", color: audience === v ? "#fff" : "#5B6A63", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>{l}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 10 }}>
          {PRESETS.map((ps) => (
            <button key={ps.label} onClick={() => applyPreset(ps.set)}
              style={{ flexShrink: 0, fontSize: 12, padding: "7px 11px", borderRadius: 999, border: "1px solid #C9D2CE", background: "#fff", color: "#5B6A63", cursor: "pointer" }}>
              {ps.label}
            </button>
          ))}
        </div>

        {audience === "personal" && (<>
        {/* 프로필 */}
        <section className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <strong style={{ fontSize: 15 }}>내 프로필</strong>
            <span className="serif" style={{ fontSize: 22, fontWeight: 800, color: curStage.color }}>
              {age}세 · {curStage.name}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: "#7A8880", margin: "6px 0 2px" }}>
            🔒 선택하신 정보는 이 화면의 계산에만 쓰이며 저장·전송되지 않습니다.
            <br />✓ 아래 항목은 모두 선택사항입니다 — 건너뛴 항목은 자동으로 '해당 없음'으로 계산됩니다.
          </div>
          <div style={{ margin: "12px 0 18px" }}>
            <input type="range" min={0} max={100} value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              style={{ background: spectrum }} />
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div className="flabel">성별</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["F", "여성"], ["M", "남성"]].map(([v, l]) => (
                  <button key={v} className={`chip ${gender === v ? "on" : ""}`} onClick={() => setGender(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flabel">가구원 수</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`chip ${household === n ? "on" : ""}`} onClick={() => setHousehold(n)}>{n}인</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flabel">자녀 수</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["0", 0], ["1명", 1], ["2명", 2], ["3명+", 3]].map(([l, n]) => (
                  <button key={l} className={`chip ${childCount === n ? "on" : ""}`} onClick={() => setChildCount(n)}>{l}</button>
                ))}
              </div>
              {childCount >= 2 && (
                <div style={{ fontSize: 11, color: "#8B968F", marginTop: 5 }}>다자녀 자동 적용 — 인정 기준(2 또는 3자녀)은 사업별 상이</div>
              )}
              {childCount > 0 && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#5B6A63", fontWeight: 700 }}>막내 자녀 나이</span>
                  <input type="number" min={0} max={18} value={childAge} aria-label="막내 자녀 나이"
                    onChange={(e) => setChildAge(Math.max(0, Math.min(18, Number(e.target.value) || 0)))}
                    style={{ width: 64, border: "1px solid #C9D2CE", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit" }} />
                  <span style={{ fontSize: 11.5, color: "#8B968F" }}>세 · 아동수당·부모급여 등은 자녀 나이로 판정합니다</span>
                </div>
              )}
            </div>
            <div>
              <div className="flabel">거주 지역</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {REGIONS.map((r) => (
                  <button key={r.id} className={`chip ${region === r.id ? "on" : ""}`} onClick={() => setRegion(r.id)}>{r.label}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#8B968F", marginTop: 5 }}>
                인구감소지역: 행안부 지정 89곳 (부산 동·서·영도구, 대구 남·서구 등 광역시 일부 포함)
              </div>
            </div>
          </div>

          <div className="flabel" style={{ marginBottom: 2 }}>가구 소득 수준</div>
          <div style={{ fontSize: 11.5, color: "#7A8880", marginBottom: 8 }}>
            {household}인 가구 기준중위소득 100% = 월 세전 약 {base.toLocaleString()}만원 ('26년 복지부 고시)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {INCOME_LEVELS.map((l) => (
              <button key={l.id} className={`chip ${income === l.id ? "on" : ""}`} onClick={() => setIncome(l.id)}>
                {incomeLabel(l)}
              </button>
            ))}
          </div>

          {income === "unknown" && (
            <div style={{ fontSize: 12, color: "#8A6D3B", background: "#FBF6E9", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
              소득을 확인하기 전에는 소득요건이 있는 사업을 아래 '추가 확인 후 가능한 잠재 혜택'에 따로 모아 보여드립니다. 복지로 모의계산으로 소득인정액을 확인하면 정확한 결과를 볼 수 있어요.
            </div>
          )}

          <div style={{ borderTop: "1px dashed #D6DDD9", margin: "4px 0 12px" }} />
          <div style={{ fontSize: 11, color: "#8B968F", fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>특수 요건 — 해당하는 경우만 선택</div>

          <div className="flabel" style={{ marginBottom: 2 }}>장애 여부</div>
          <div style={{ fontSize: 11.5, color: "#7A8880", marginBottom: 8 }}>
            '19년 등급제(1~6급) 폐지 이후 현행 법정 구분은 '심한 장애 / 심하지 않은 장애' 2단계입니다
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {DISABILITY_LEVELS.map((d) => (
              <button key={d.id} className={`chip ${disability === d.id ? "on" : ""}`} onClick={() => setDisability(d.id)}>
                {d.label}
              </button>
            ))}
          </div>

          <div className="flabel" style={{ marginBottom: 8 }}>보훈대상 여부</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {VET_LEVELS.map((v) => (
              <button key={v.id} className={`chip ${vet === v.id ? "on" : ""}`} onClick={() => setVet(v.id)}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="flabel" style={{ marginBottom: 8 }}>병역·군복무</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {MIL_LEVELS.map((m) => (
              <button key={m.id} className={`chip ${mil === m.id ? "on" : ""}`} onClick={() => setMil(m.id)}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flabel" style={{ marginBottom: 2 }}>직업 (해당하는 경우만)</div>
          <div style={{ fontSize: 11.5, color: "#7A8880", marginBottom: 8 }}>
            별도 지원 체계가 있는 직업만 표시됩니다 — 회사원·공무원 등은 '해당 없음'을 선택하세요 (재직·구직은 아래 상황에서)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            {JOBS.map((j) => (
              <button key={j.id} className={`chip ${job === j.id ? "on" : ""}`} onClick={() => setJob(j.id)}>{j.label}</button>
            ))}
          </div>
          {job === "biz" && (
            <div style={{ fontSize: 12, color: "#3C4A44", background: "#F2F7F4", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              자영업·소상공인 대상 지원(정책자금·희망리턴 등)은 상단
              <button onClick={() => setAudience("biz")} style={{ margin: "0 4px", padding: "2px 8px", borderRadius: 999, border: "none", background: "#22303C", color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>사업주·창업·기업</button>
              탭에 모여 있습니다. 개인 자격 혜택(근로장려금 등)은 이 탭에서 계속 확인하세요.
            </div>
          )}
          <div style={{ marginBottom: 10 }} />

          <div className="flabel">해당되는 상황 (해당하는 것만 · 복수 선택 가능){tags.length > 0 && <span style={{ color: "#3E9E74" }}> · {tags.length}개 선택</span>}</div>
          {tags.includes("다자녀") && childCount < 2 && (
            <div style={{ fontSize: 12, color: "#8A6D3B", background: "#FBF6E9", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              '다자녀'를 선택하셨어요 — 위의 자녀 수를 2명 이상으로 맞춰야 다자녀 혜택이 정확히 계산됩니다.
            </div>
          )}
          {childCount === 0 && tags.includes("자녀 양육") && (
            <div style={{ fontSize: 12, color: "#8A6D3B", background: "#FBF6E9", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              '자녀 양육'을 선택하셨어요 — 위의 자녀 수도 함께 선택하면 자녀 1인당 사업(자녀장려금 등)이 정확히 계산됩니다.
            </div>
          )}
          {tags.includes("재직 중") && tags.includes("구직 중") && (
            <div style={{ fontSize: 12, color: "#8A6D3B", background: "#FBF6E9", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              '재직 중'과 '구직 중'을 함께 선택하셨어요. 실제로는 한 상태만 해당되므로 결과가 실제보다 넓게 잡힐 수 있습니다.
            </div>
          )}
          {TAG_GROUPS.map((g) => {
            const noneOn = !g.items.some((t) => tags.includes(t));
            return (
              <div key={g.group} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#8B968F", fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>{g.group}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button className="chip" onClick={() => setTags(tags.filter((t) => !g.items.includes(t)))}
                    style={noneOn ? { background: "#8B968F", borderColor: "#8B968F", color: "#fff" } : { color: "#AEB8B2" }}>
                    해당 없음
                  </button>
                  {g.items.map((t) => (
                    <button key={t} className={`chip ${tags.includes(t) ? "on" : ""}`} onClick={() => toggleTag(t)}>{t}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* 연간 수혜범위 히어로 */}
        <section className="card" style={{ marginBottom: 16, background: "#22303C", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: spectrum }} />
          <div style={{ fontSize: 12.5, color: "#AEBBB4", marginTop: 4 }}>
            지금 조건에서 신청 가능성이 있는 연간 수혜 범위 (현금 {cashN} + 바우처 {vouchN}건 합산{dedupCount > 0 && <> · 중복불가 {dedupCount}건 제외</>})
          </div>
          <div className="serif" style={{ fontSize: 32, fontWeight: 800, margin: "4px 0 2px", lineHeight: 1.2 }}>
            {sumable.length > 0 ? <>약 {fmt(totalMin)} ~ {fmt(totalMax)}원</> : <>해당 없음</>}
          </div>
          {dedupCount > 0 && (
            <div style={{ fontSize: 11.5, color: "#8FA098", marginBottom: 2 }}>
              택1 제외: {dedupNames.join(" · ")}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#8FA098" }}>
            일시금 포함 · 사업별 상한 기준 · 중복불가 그룹은 유리한 1개만 합산{etcCount > 0 && <> · 서비스·융자형 {etcCount}건 별도</>}{condCount > 0 && <> · 사건·사용 조건부 {condCount}건 별도</>} · 예시 수치
          </div>
          {reviewNeeded.length > 0 && (
            <div style={{ fontSize: 11.5, color: "#D9C58A", marginTop: 4 }}>
              추가 확인 시 잠재 혜택 {reviewNeeded.length}건{reviewMax > 0 && <> · 최대 +{fmt(reviewMax)}원 가능</>}
            </div>
          )}
        </section>
        </>)}

        {audience === "biz" && (
          <section className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong style={{ fontSize: 15 }}>사업자 프로필</strong>
              <span className="serif" style={{ fontSize: 22, fontWeight: 800, color: curStage.color }}>대표자 {age}세</span>
            </div>
            <div style={{ margin: "12px 0 18px" }}>
              <input type="range" min={0} max={100} value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                style={{ background: spectrum }} />
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <div className="flabel">대표자 성별</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["F", "여성"], ["M", "남성"]].map(([v, l]) => (
                    <button key={v} className={`chip ${gender === v ? "on" : ""}`} onClick={() => setGender(v)}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flabel">대표자 장애 여부</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DISABILITY_LEVELS.map((d) => (
                    <button key={d.id} className={`chip ${disability === d.id ? "on" : ""}`} onClick={() => setDisability(d.id)}>{d.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flabel" style={{ marginBottom: 2 }}>기업 규모 (요건 기준)</div>
            <div style={{ fontSize: 11.5, color: "#7A8880", marginBottom: 8 }}>
              소상공인: 상시근로자 5인 미만(제조·건설·운수 등은 10인 미만) + 업종별 매출 기준 · 중소/중견: 매출·자산 기준(업종별 상이)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {BIZ_SIZES.map((z) => (
                <button key={z} className={`chip ${bizSize === z ? "on" : ""}`} onClick={() => setBizSize(z)}>{z}</button>
              ))}
            </div>
            <div className="flabel">사업 상황 (복수 선택)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {BIZ_TAGS.map((t) => (
                <button key={t} className={`chip ${bizTags.includes(t) ? "on" : ""}`} onClick={() => toggleBizTag(t)}>{t}</button>
              ))}
            </div>
          </section>
        )}

        {audience === "biz" && (
          <section className="card" style={{ marginBottom: 16, background: "#22303C", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: spectrum }} />
            <div style={{ fontSize: 12.5, color: "#AEBBB4", marginTop: 4 }}>
              지금 조건에서 신청 가능성이 있는 연간 지원 예상 범위 (장려금·바우처 {bizSumable.length}건 합산)
            </div>
            <div className="serif" style={{ fontSize: 32, fontWeight: 800, margin: "4px 0 2px", lineHeight: 1.2 }}>
              {bizSumable.length > 0 ? <>약 {fmt(bizMin)} ~ {fmt(bizMax)}원</> : <>해당 없음</>}
            </div>
            <div style={{ fontSize: 11.5, color: "#8FA098" }}>
              사업별 상한·1인/1건 기준 예시 수치 · 실제는 공모 선정에 따라 결정
              {bizLoanCount > 0 && <> · 정책융자 {bizLoanCount}건 별도(한도 수천만~수십억원)</>}
            </div>
          </section>
        )}

        {/* 요약 */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            ["신청 가능성 있는 혜택", `${nowEligible.length}건`],
            ["관련 부처·기관", `${ministries.size}곳`],
            ["연령 도달 시 검토", `${upcoming.length}건`],
          ].map(([k, v]) => (
            <div key={k} className="card" style={{ textAlign: "center", padding: "12px 8px" }}>
              <div className="serif" style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 11.5, color: "#7A8880", marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </section>

        {/* 사업명 검색 */}
        <section className="card" style={{ marginBottom: 16 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 사업명으로 찾기 (예: 재난적 의료비, 국가장학금)"
            style={{ width: "100%", border: "1px solid #C9D2CE", borderRadius: 10, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          {searchHits.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11.5, color: "#7A8880" }}>검색 결과 {searchHits.length}건 — 내 자격과 무관하게 사업 정보를 보여드립니다</div>
              {searchHits.map((b) => (
                <div key={b.id} onClick={() => setSelected(b)}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 12px", background: "#FAFBFA", borderRadius: 8, cursor: "pointer" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{b.name}</span>
                  <span style={{ fontSize: 11.5, color: "#7A8880", flexShrink: 0 }}>{b.ministry}</span>
                </div>
              ))}
            </div>
          )}
          {query.trim() && searchHits.length === 0 && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "#7A8880" }}>
              검색 결과가 없습니다 — 지자체 사업이거나 아직 수록되지 않은 사업일 수 있어요.
            </div>
          )}
        </section>

        {audience === "personal" && (<>
        {reviewNeeded.length > 0 && (
          <section className="card" style={{ marginBottom: 16, background: "#FBF8EF" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 4 }}>
              추가 확인 후 가능한 잠재 혜택 <span style={{ color: "#B8860B" }}>{reviewNeeded.length}건</span>
            </div>
            <div style={{ fontSize: 11.5, color: "#8A6D3B", marginBottom: 8 }}>
              소득·자녀 정보를 확인하면 신청 가능성을 판단할 수 있는 사업들입니다 — 아래 예상액 합계에는 포함하지 않았습니다.
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {reviewNeeded.map((b) => (
                <div key={b.id} role="button" tabIndex={0} onClick={() => setSelected(b)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(b); } }}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 12px", background: "#fff", borderRadius: 8, cursor: "pointer" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{b.name}</span>
                  <span style={{ fontSize: 11.5, color: "#B8860B", flexShrink: 0 }}>
                    {income === "unknown" && b.incomeCap < 5 ? "소득 확인 필요" : "자녀 정보 확인 필요"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        {/* 생애 지도 */}
        <section className="card" style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 15 }}>나의 생애 혜택 지도</strong>
          <p style={{ fontSize: 12, color: "#7A8880", margin: "4px 0 12px" }}>
            현재 조건이 평생 유지된다고 가정했을 때 0세~100세에 열려 있는 혜택의 구간입니다(미래 예측 아님). 항목을 누르면 상세가 열립니다.
          </p>
          <div style={{ maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
            {profileMatched.slice().sort((a, b) => a.ageMin - b.ageMin).map((b) => {
              const sc = stageOf(b.ageMin).color;
              const active = age >= b.ageMin && age <= b.ageMax;
              return (
                <div key={b.id} onClick={() => setSelected(b)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, cursor: "pointer" }}>
                  <div style={{ width: 130, fontSize: 11.5, color: active ? "#22303C" : "#8B968F", fontWeight: active ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {b.name}
                  </div>
                  <div style={{ flex: 1, position: "relative", height: 14, background: "#EBEFED", borderRadius: 7 }}>
                    <div style={{
                      position: "absolute", left: `${b.ageMin}%`,
                      width: `${Math.max(b.ageMax - b.ageMin, 1)}%`,
                      top: 0, bottom: 0, borderRadius: 7,
                      background: sc, opacity: active ? 1 : 0.35,
                    }} />
                    <div style={{ position: "absolute", left: `${age}%`, top: -2, bottom: -2, width: 2, background: "#22303C" }} />
                  </div>
                </div>
              );
            })}
            {profileMatched.length === 0 && (
              <div style={{ fontSize: 13, color: "#7A8880", padding: "12px 0" }}>
                현재 조건에 해당하는 혜택이 없습니다. 조건을 조정해 보세요.
              </div>
            )}
          </div>
        </section>

        </>)}

        {/* 지금 받을 수 있는 혜택 */}
        <section style={{ marginBottom: 20 }}>
          <h2 className="serif" style={{ fontSize: 18, fontWeight: 800, margin: "0 0 10px" }}>
            {audience === "personal" ? "지금 신청 가능성이 있는 혜택 " : "기업·사업주 지원 사업 "}<span style={{ color: curStage.color }}>{nowEligible.length}건</span>
          </h2>
          <div style={{ display: "grid", gap: 10 }}>
            {nowEligible.map((b) => {
              const [vl, vc] = VBADGE[b.vtype];
              const [gl, gc] = gateOf(b);
              return (
                <div key={b.id} className="card clickable" role="button" tabIndex={0} onClick={() => setSelected(b)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(b); } }} style={{ borderLeft: `4px solid ${stageOf(b.ageMin).color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="vbadge" style={{ background: vc }}>{vl}</span>
                      <span className="vbadge" style={{ background: "#fff", color: gc, border: `1px solid ${gc}` }}>{gl}</span>
                      {b.excl && exclCounts[b.excl] > 1 && (
                        <span className="vbadge" style={{ background: "#fff", color: "#B8860B", border: "1px solid #B8860B" }}>택1</span>
                      )}
                      <strong style={{ fontSize: 14.5 }}>{b.name}</strong>
                    </div>
                    <span style={{ fontSize: 11, background: "#EEF2F0", padding: "3px 8px", borderRadius: 999, color: "#5B6A63", alignSelf: "center" }}>{b.ministry}{b.src && <span style={{ color: "#3E9E74", fontWeight: 800 }}> · '26예산</span>}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>
                    {b.vtype === "loan" || b.vtype === "service" || b.vtype === "grant" ? b.amount :
                      b.valMin === b.valMax ? `연 ${b.valMin.toLocaleString()}만원${b.valNote ? ` (${b.valNote})` : ""}` :
                        `연 ${b.valMin.toLocaleString()}~${b.valMax.toLocaleString()}만원${b.valNote ? ` (${b.valNote})` : ""}`}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#5B6A63", marginTop: 3 }}>{b.desc}</div>
                  <div style={{ fontSize: 11.5, color: "#8B968F", marginTop: 6 }}>
                    {income === "unknown" && b.incomeCap < 5 && <span style={{ color: "#B8860B", fontWeight: 700 }}>소득 확인 필요 · </span>}신청: {b.channel} · <span style={{ color: stageOf(b.ageMin).color, fontWeight: 700 }}>자세히 보기 →</span>
                  </div>
                </div>
              );
            })}
            {nowEligible.length === 0 && (
              <div className="card" style={{ fontSize: 13, color: "#7A8880" }}>
                지금 연령·조건에서 받을 수 있는 혜택이 없습니다.
              </div>
            )}
          </div>
        </section>

        {audience === "personal" && (<>
        {/* 앞으로 열릴 혜택 */}
        <section>
          <h2 className="serif" style={{ fontSize: 18, fontWeight: 800, margin: "0 0 10px" }}>
            연령 도달 시 검토할 혜택 <span style={{ fontSize: 12, color: "#8B968F", fontWeight: 400 }}>(현 제도·현 조건 유지 가정)</span>
          </h2>
          <div style={{ display: "grid", gap: 8 }}>
            {upcoming.slice(0, 6).map((b) => (
              <div key={b.id} className="card clickable" onClick={() => setSelected(b)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: "#7A8880" }}>{b.amount}</div>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div className="serif" style={{ fontSize: 16, fontWeight: 800, color: stageOf(b.ageMin).color }}>
                    {b.ageMin - age}년 후
                  </div>
                  <div style={{ fontSize: 11, color: "#8B968F" }}>{b.ageMin}세부터</div>
                </div>
              </div>
            ))}
            {upcoming.length === 0 && (
              <div className="card" style={{ fontSize: 13, color: "#7A8880" }}>예정된 신규 혜택이 없습니다.</div>
            )}
          </div>
        </section>
        </>)}

        <footer style={{ marginTop: 28, fontSize: 11.5, color: "#8B968F", lineHeight: 1.6 }}>
          본 화면은 정책 구상용 데모입니다. 수록된 예산액은 '26 열린재정, 기준중위소득·기초연금·생계급여는 '26년 확정 고시 기준(반올림)이며 일부 단가는 예시로,
          실제 수급 가능 여부는 소득인정액 산정 등 세부 심사에 따라 달라집니다.
        </footer>
      </main>

      {/* 상세창 */}
      {selected && (
        <div onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(20,28,35,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={selected.name}
            style={{ background: "#fff", width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "20px 20px 32px" }}>
            <div style={{ width: 40, height: 4, background: "#D6DDD9", borderRadius: 2, margin: "0 auto 14px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: stageOf(selected.ageMin).color, fontWeight: 800, letterSpacing: 1 }}>
                  {stageOf(selected.ageMin).name} · {selected.ageMin}–{selected.ageMax}세 · {VBADGE[selected.vtype][0]}형
                  {selected.gender && (selected.gender === "F" ? " · 여성" : " · 남성")}
                  {selected.disability && (selected.disability === "severe" ? " · 중증장애" : selected.disability === "mild" ? " · 경증장애" : " · 장애인")}
                </div>
                <h3 className="serif" style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 2px" }}>{selected.name}</h3>
                <div style={{ fontSize: 12.5, color: "#5B6A63" }}>{selected.desc}</div>
              </div>
              <button aria-label="닫기" onClick={() => setSelected(null)}
                style={{ border: "none", background: "#EEF2F0", borderRadius: "50%", width: 32, height: 32, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>조건별 지원 내용</div>
              <table className="dtbl" style={{ width: "100%", borderCollapse: "collapse", background: "#FAFBFA", borderRadius: 10, overflow: "hidden" }}>
                <tbody>
                  {selected.brackets.map(([c, v], i) => (
                    <tr key={i}><td>{c}</td><td>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              <div style={{ background: "#FAFBFA", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: selected.src ? "#3E9E74" : "#7A8880", fontWeight: selected.src ? 800 : 400 }}>{selected.src ? "소관 / 재정 규모 · '26 열린재정 실데이터" : "소관 / 재정 규모(예시)"}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{selected.ministry}</div>
                <div style={{ fontSize: 12.5, marginTop: 1 }}>{selected.budget}</div>
                {liveBudgets[String(selected.id)] && (
                  <div style={{ fontSize: 11.5, color: "#3E9E74", marginTop: 4, fontWeight: 700 }}>
                    ⟳ 자동 갱신: {liveBudgets[String(selected.id)].label} ({liveBudgets[String(selected.id)].asOf} 열린재정 기준)
                  </div>
                )}
              </div>
              <div style={{ background: "#FAFBFA", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#7A8880" }}>근거 법령</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{selected.law}</div>
              </div>
            </div>

            <div style={{ marginTop: 14, background: "#FAFBFA", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#7A8880" }}>신청 방법</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{selected.channel}</div>
              {selected.applicationUrl && (
                <a href={selected.applicationUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8, marginRight: 8, fontSize: 13, fontWeight: 700, color: "#fff", background: "#3E9E74", padding: "8px 14px", borderRadius: 8, textDecoration: "none" }}>
                  바로 신청하기 →
                </a>
              )}
              {selected.officialDetailUrl && (
                <a href={selected.officialDetailUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8, marginRight: 8, fontSize: 13, fontWeight: 700, color: "#22303C", background: "#EEF2F0", padding: "8px 14px", borderRadius: 8, textDecoration: "none" }}>
                  공식 상세정보
                </a>
              )}
              {!selected.applicationUrl && PORTAL[selected.portal] && (
                <a href={PORTAL[selected.portal]} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700, color: "#fff", background: "#22303C", padding: "8px 14px", borderRadius: 8, textDecoration: "none" }}>
                  {selected.portal}에서 신청하기 →
                </a>
              )}
            </div>

            {selected.excl && (
              <div style={{ marginTop: 14, background: "#FBF6E9", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6, color: "#8A6D3B" }}>⚠ 함께 받을 수 없는 사업</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#6B5A2E" }}>
                  {BENEFITS.filter((x) => x.excl === selected.excl && x.id !== selected.id).map((x) => x.name).join(" · ")}
                  <br />{EXCL_INFO[selected.excl]}
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, background: "#F2F7F4", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>받기까지 다음 단계</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#3C4A44" }}>
                ① {gateOf(selected)[0] === "소득심사형"
                  ? "소득인정액(소득+재산 환산) 정밀 심사가 있는 사업입니다. 신청 전 복지로 모의계산으로 가능성을 먼저 확인하세요."
                  : "연령·상황 요건을 충족하면 별도 소득심사 없이 신청으로 받을 수 있는 사업입니다."}<br />
                ② {selected.channel}에서 신청 — 최종 수급 여부는 기관 심사로 확정됩니다<br />
                ③ 거주 시·군·구의 추가 지원(출산장려금, 지역 수당 등)이 별도로 있을 수 있으니 지자체 누리집도 함께 확인하세요.
              </div>
            </div>

            {(selected.lastVerifiedAt || selected.sourceStatus) && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: "#7A8880" }}>
                {selected.lastVerifiedAt && <>최종 확인일: {selected.lastVerifiedAt}</>}
                {selected.sourceStatus && <> · 출처 상태: {selected.sourceStatus}</>}
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 11, color: "#8B968F", lineHeight: 1.6 }}>
              ※ 금액·예산·요건은 데모용 예시입니다. 예상액은 중복수급·실지출·근로시간·사건 발생 여부에 따라 달라질 수 있으며, 최종 수급 여부와 지급액은 관계기관 심사로 확정됩니다. 실제 시스템에서는 국회 제출 예산안 사업설명자료(2-1)와
              열린재정 세부사업 데이터를 연계해 이 화면이 자동 생성됩니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
