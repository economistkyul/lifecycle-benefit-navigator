/* 열린재정 예산액 자동 갱신 v3.9
   모드: ① data/raw/*.{xlsx,tsv,csv,json} 파일  ② OPENFISCAL_KEY 설정 시 OpenAPI(HTTPS)
   산출: src/live-budgets.json (병합·보존), data/budget-update-report.json (실행 보고서) */
import fs from "fs";
import path from "path";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

if (process.env.OPENFISCAL_IP) {
  try {
    const { Agent, setGlobalDispatcher } = await import("undici");
    const PIN = process.env.OPENFISCAL_IP;
    setGlobalDispatcher(new Agent({ connect: { lookup: (h, o, cb) => cb(null, [{ address: PIN, family: 4 }]) } }));
    console.log("IP 고정 모드 사용");
  } catch { console.log("undici 미설치 — IP 고정 생략"); }
}

let XLSX; try { XLSX = await import("xlsx"); } catch { XLSX = null; }

const MAP = JSON.parse(fs.readFileSync("data/budget-map.json", "utf8"));
const OUT = "src/live-budgets.json";
const REPORT = "data/budget-update-report.json";
const now = new Date().toISOString();
const today = now.slice(0, 10);
const FY = Number(process.env.FY || 2026);

const report = { runAt: now, fiscalYear: FY, mode: "file", runStatus: "no_data", didUpdateLiveBudgets: false,
  previousLiveCount: 0, newLiveCount: 0, apiError: null, sourceRowCount: 0,
  matchedBenefitCount: 0, unmatchedMapIds: [], invalidAmountRows: [], zeroAmountMatches: [] };

/* 3-1. 금액 파싱: 쉼표·공백·단위 허용, 실패 시 NaN */
/* 단위 환산: 결과는 항상 백만원. "2억원"→200, "2.5조원"→2,500,000, "411,100 백만원"→411100 */
const parseAmount = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  const m = String(v).replace(/[,\s]/g, "").match(/^(-?\d+(?:\.\d+)?)(조원|억원|백만원|천원|원)?$/);
  if (!m) return NaN;
  const MUL = { "조원": 1_000_000, "억원": 100, "백만원": 1, "천원": 1 / 1000, "원": 1 / 1_000_000 };
  return Number(m[1]) * MUL[m[2] || "백만원"];
};

/* 3-2. 헤더 별칭 */
const ALIAS = {
  ministry: ["소관명", "소관", "부처명", "기관명"],
  name: ["세부사업명", "사업명", "단위사업명"],
  amt: ["예산액", "정부안", "본예산", "확정예산", "예산현액"],
};
const pickHeader = (H) => {
  const idx = {};
  for (const [k, names] of Object.entries(ALIAS)) {
    idx[k] = names.map((n) => H.indexOf(n)).find((i) => i >= 0);
    if (idx[k] === undefined) return null;
    console.log(`헤더 선택: ${k} ← "${H[idx[k]]}"`);
  }
  return idx;
};

const fmt = (mn) =>
  mn >= 1_000_000 ? `${(mn / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}조원`
  : mn >= 100 ? `${Math.round(mn / 100).toLocaleString()}억원`
  : `${Math.round(mn).toLocaleString()}백만원`;

let rows = [];

if (process.env.OPENFISCAL_KEY) {
  report.mode = "api";
  const KEY = process.env.OPENFISCAL_KEY;
  const BASE = "https://openapi.openfiscaldata.go.kr"; /* HTTPS 전용 */
  try {
    for (let page = 1; page <= 50; page++) {
      const qs = new URLSearchParams({ Key: KEY, Type: "json", pIndex: String(page), pSize: "1000", FSCL_YY: String(FY) });
      const res = await fetch(`${BASE}/ExpenditureBudgetInit5?${qs}`, { signal: AbortSignal.timeout(25000) });
      const j = await res.json();
      const list = j?.ExpenditureBudgetInit5?.[1]?.row || [];
      if (!list.length) break;
      for (const r of list)
        rows.push({ ministry: r.OFFC_NM, name: r.SACTV_NM, amt: parseAmount(r.Y_YY_DFN_MEDI_KCUR_AMT ?? r.Y_YY_MEDI_KCUR_AMT) / 1000 });
    }
    console.log(`API 수신: ${rows.length}행`); /* 키는 로그에 출력하지 않음 */
  } catch (e) {
    report.apiError = String(e.cause?.code || e.name);
    console.log(`API 접속 실패(${report.apiError}) — 해외 IP 차단 가능성. 파일 모드 데이터로 계속.`);
  }
}

if (!rows.length) {
  report.mode = "file";
  const files = fs.existsSync("data/raw") ? fs.readdirSync("data/raw").filter((f) => /\.(xlsx|tsv|json)$/.test(f)) : [];
  for (const f of files) {
    const fp = path.join("data/raw", f);
    if (f.endsWith(".json")) {
      const j = JSON.parse(fs.readFileSync(fp, "utf8"));
      const list = j?.ExpenditureBudgetInit5?.[1]?.row || [];
      for (const r of list)
        rows.push({ ministry: r.OFFC_NM, name: r.SACTV_NM, amt: parseAmount(r.Y_YY_DFN_MEDI_KCUR_AMT ?? r.Y_YY_MEDI_KCUR_AMT) / 1000, src: f });
      continue;
    }
    let arr;
    if (f.endsWith(".xlsx")) {
      if (!XLSX) { console.log(`xlsx 모듈 없음 — ${f} 건너뜀`); continue; }
      arr = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(fp)).Sheets[XLSX.read(fs.readFileSync(fp)).SheetNames[0]], { header: 1 });
    } else {
      const sep = "\t"; /* CSV는 필드 내 쉼표 오판 위험으로 미지원 — TSV·XLSX·JSON 사용 */
      arr = fs.readFileSync(fp, "utf8").split(/\r?\n/).map((l) => l.split(sep));
    }
    const hi = arr.findIndex((r) => r?.some?.((c) => ALIAS.name.includes(c)));
    if (hi < 0) { console.log(`${f}: 헤더 미발견 — 건너뜀`); continue; }
    const idx = pickHeader(arr[hi]);
    if (!idx) { console.log(`${f}: 필수 헤더 부족 — 건너뜀`); continue; }
    for (let ri = hi + 1; ri < arr.length; ri++) {
      const r = arr[ri];
      if (!r?.[idx.name]) continue;
      const amt = parseAmount(r[idx.amt]);
      if (Number.isNaN(amt)) { report.invalidAmountRows.push({ file: f, row: ri + 1, name: String(r[idx.name]).slice(0, 30), value: String(r[idx.amt]).slice(0, 20) }); continue; }
      rows.push({ ministry: r[idx.ministry], name: String(r[idx.name]), amt, src: f });
    }
  }
  console.log(`파일 모드: ${files.length}개 파일, ${rows.length}행 (금액 파싱 실패 ${report.invalidAmountRows.length}건)`);
}

report.sourceRowCount = rows.length;

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
report.previousLiveCount = Object.keys(prev).length;
report.newLiveCount = report.previousLiveCount;

if (!rows.length) {
  report.runStatus = report.apiError ? "api_failed" : "no_data";
  console.log("신규 데이터 없음 — 기존 live-budgets.json 보존 (asOf 미변경)");
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  process.exit(0);
}

const seen = new Set();
rows = rows.filter((r) => { const k = r.ministry + "|" + r.name + "|" + r.amt; if (seen.has(k)) return false; seen.add(k); return true; });

const live = {};
for (const [id, rule] of Object.entries(MAP)) {
  let hit = rows;
  if (rule.ministry) hit = hit.filter((r) => r.ministry === rule.ministry);
  hit = rule.exact ? hit.filter((r) => rule.names.includes(r.name))
                   : hit.filter((r) => rule.names.some((n) => r.name.includes(n)));
  if (!hit.length) { report.unmatchedMapIds.push(id); continue; }
  const total = hit.reduce((s, r) => s + r.amt, 0);
  if (total === 0) { report.zeroAmountMatches.push(id); continue; } /* 0원은 확정하지 않음 */
  live[id] = { label: fmt(total), asOf: today, names: [...new Set(hit.map((r) => r.name))].slice(0, 4),
               fiscalYear: FY, pipelineRunAt: now, status: "ok" };
}
report.matchedBenefitCount = Object.keys(live).length;

if (report.matchedBenefitCount === 0) {
  report.runStatus = "no_data";
  console.log("매칭 0건 — 기존 데이터 보존, 보고서만 기록");
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  process.exit(0);
}

const merged = { ...prev, ...live };
report.runStatus = report.apiError ? "partial" : "success";
report.didUpdateLiveBudgets = true;
report.newLiveCount = Object.keys(merged).length;
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(`갱신 ${report.matchedBenefitCount}건 / 보존 포함 총 ${Object.keys(merged).length}건`);
