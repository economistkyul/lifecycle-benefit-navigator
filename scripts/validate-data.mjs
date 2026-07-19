/* 데이터 무결성 검증 v3.9 — npm run validate:data
   BENEFITS(JSX 내 정의)·budget-map·live-budgets 교차 검사 */
import fs from "fs";

const jsx = fs.readFileSync("src/LifecycleBenefitNavigator.jsx", "utf8");
const map = JSON.parse(fs.readFileSync("data/budget-map.json", "utf8"));
const live = fs.existsSync("src/live-budgets.json") ? JSON.parse(fs.readFileSync("src/live-budgets.json", "utf8")) : {};

const errors = [], warns = [];

/* BENEFITS 항목 추출 (경량 파서: "{ id: N, name: ..." 블록 단위) */
const chunks = jsx.split(/\n  \{ /).slice(1).map((c) => c.split("\n")[0]).filter((c) => /^id: \d+, name:/.test(c)); /* 숫자 id를 가진 BENEFITS 항목만 (STAGES 등 상수 제외) */
const entries = [];
for (const c of chunks) {
  const g = (re) => { const m = c.match(re); return m ? m[1] : undefined; };
  entries.push({
    id: Number(g(/id: (\d+)/)), name: g(/name: "([^"]+)"/),
    ageMin: Number(g(/ageMin: (\d+)/)), ageMax: Number(g(/ageMax: (\d+)/)),
    valMin: Number(g(/valMin: (\d+)/)), valMax: Number(g(/valMax: (\d+)/)),
    vtype: g(/vtype: "(\w+)"/), portal: g(/portal: "([^"]+)"/),
    hasBudget: /budget: "/.test(c), hasBrackets: /brackets: \[\[/.test(c),
    src: /src: true/.test(c),
    audience: g(/audience: "(\w+)"/), ageTarget: g(/ageTarget: "(\w+)"/),
    perChild: /perChild: true/.test(c),
    appUrl: g(/applicationUrl: "([^"]+)"/), offUrl: g(/officialDetailUrl: "([^"]+)"/),
    raw: c,
  });
}
console.log(`BENEFITS 파싱: ${entries.length}건`);

/* 1. id 중복 */
const ids = entries.map((e) => e.id);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dup.length) errors.push(`id 중복: ${[...new Set(dup)].join(", ")}`);

/* 2~4. 필수 필드·범위 역전 */
for (const e of entries) {
  if (!e.name || Number.isNaN(e.id)) errors.push(`필수 필드 누락: id=${e.id}`);
  if (e.ageMin > e.ageMax) errors.push(`ageMin>ageMax: [${e.id}] ${e.name}`);
  if (e.valMin > e.valMax) errors.push(`valMin>valMax: [${e.id}] ${e.name}`);
  if (!e.hasBudget) warns.push(`budget 없음: [${e.id}] ${e.name}`);
  if (!e.hasBrackets) warns.push(`brackets 비어있음: [${e.id}] ${e.name}`);
  if (!["cash", "voucher", "service", "loan", "grant"].includes(e.vtype)) errors.push(`미등록 vtype "${e.vtype}": [${e.id}] ${e.name}`);
  if (e.audience && e.audience !== "biz" && e.audience !== "personal") errors.push(`잘못된 audience "${e.audience}": [${e.id}]`);
  if (e.ageTarget && !["applicant", "child", "any_household_member"].includes(e.ageTarget)) errors.push(`잘못된 ageTarget "${e.ageTarget}": [${e.id}]`);
  for (const u of [e.appUrl, e.offUrl]) if (u && !/^https?:\/\//.test(u)) errors.push(`URL 형식 오류: [${e.id}] ${u}`);
  if (e.perChild && !/자녀|아동/.test(e.raw)) warns.push(`perChild인데 자녀 조건 불명확: [${e.id}] ${e.name}`);
}

/* 5~6. 참조 무결성 */
const idSet = new Set(ids);
for (const k of Object.keys(map)) if (!idSet.has(Number(k))) errors.push(`budget-map에만 존재하는 id: ${k}`);
for (const k of Object.keys(live)) if (!idSet.has(Number(k))) errors.push(`live-budgets에만 존재하는 id: ${k}`);

/* 7~8. 매핑 커버리지 (정보성) */
const srcTrue = entries.filter((e) => e.src).length;
const mapped = Object.keys(map).length;
const liveOk = Object.keys(map).filter((k) => live[k]).length;
console.log(`src:true ${srcTrue}건 / budget-map 매핑 ${mapped}건 / live 값 보유 ${liveOk}건`);
if (mapped - liveOk > 0) warns.push(`매핑은 있으나 live 값 없는 사업 ${mapped - liveOk}건`);

for (const w of warns.slice(0, 10)) console.log("⚠", w);
if (warns.length > 10) console.log(`⚠ ... 외 경고 ${warns.length - 10}건`);
if (errors.length) { for (const e of errors) console.error("✗", e); process.exit(1); }
console.log(`✓ 검증 통과 (오류 0 · 경고 ${warns.length})`);
