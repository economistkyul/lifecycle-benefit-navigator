/* 열린재정 예산액 자동 갱신 스크립트
   모드 1 (기본): data/raw/ 폴더의 열린재정 엑셀(.xlsx)을 읽어 갱신
   모드 2 (OPENFISCAL_KEY 환경변수 설정 시): 열린재정 OpenAPI 호출
   결과: src/live-budgets.json (사업 id → 최신 예산액 라벨) */
import fs from "fs";
import path from "path";
let XLSX; try { XLSX = await import("xlsx"); } catch { XLSX = null; }

const MAP = JSON.parse(fs.readFileSync("data/budget-map.json", "utf8"));
const OUT = "src/live-budgets.json";
const today = new Date().toISOString().slice(0, 10);

const fmt = (mn) =>
  mn >= 1_000_000 ? `${(mn / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}조원`
  : mn >= 100 ? `${Math.round(mn / 100).toLocaleString()}억원`
  : `${Math.round(mn).toLocaleString()}백만원`;

let rows = [];

if (process.env.OPENFISCAL_KEY) {
  /* ── API 모드: 열린재정 세출예산 OpenAPI ──
     ⚠ 정부 API는 해외 IP를 차단하는 경우가 많음 (GitHub 로봇은 미국 서버)
     → 접속 실패 시 오류 없이 종료하고 엑셀 모드 데이터를 유지 */
  const KEY = process.env.OPENFISCAL_KEY;
  const YEAR = process.env.FY || new Date().getFullYear();
  const BASES = [
    "https://openapi.openfiscaldata.go.kr",
    "http://openapi.openfiscaldata.go.kr",
  ];
  let ok = false;
  for (const base of BASES) {
    try {
      let page = 1;
      while (true) {
        const url = `${base}/ExpenditureBudgetInit5?Key=${KEY}&Type=json&pIndex=${page}&pSize=1000&FSCL_YY=${YEAR}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
        const j = await res.json();
        const list = j?.ExpenditureBudgetInit5?.[1]?.row || [];
        if (!list.length) break;
        for (const r of list)
          rows.push({ ministry: r.OFFC_NM, name: r.SACTV_NM, amt: Number(r.Y_YY_DFN_MEDI_KCUR_AMT || r.BDG_AMT || 0) });
        page += 1;
        if (page > 50) break;
      }
      ok = rows.length > 0;
      if (ok) { console.log(`API 성공(${base}): ${rows.length}행`); break; }
    } catch (e) {
      console.log(`API 접속 실패(${base}): ${e.cause?.code || e.name} — 다음 경로 시도`);
    }
  }
  if (!ok) {
    console.log("※ API 접속 불가 — 해외 IP 차단 가능성. 엑셀 모드(data/raw)로 계속 운영됩니다.");
    process.exit(0);
  }
} else {
  /* ── 엑셀 모드: data/raw/*.xlsx (열린재정 '재정사업 설명자료' 다운로드 형식) ── */
  const files = fs.readdirSync("data/raw").filter((f) => /\.(xlsx|tsv|csv)$/.test(f));
  for (const f of files) {
    let arr;
    if (f.endsWith(".xlsx")) {
      if (!XLSX) { console.log(`xlsx 모듈 없음 — ${f} 건너뜀`); continue; }
      const wb = XLSX.read(fs.readFileSync(path.join("data/raw", f)));
      arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    } else {
      const sep = f.endsWith(".tsv") ? "\t" : ",";
      arr = fs.readFileSync(path.join("data/raw", f), "utf8").split(/\r?\n/).map((l) => l.split(sep));
    }
    const hi = arr.findIndex((r) => r?.includes?.("세부사업명"));
    if (hi < 0) continue;
    const H = arr[hi];
    const iMin = H.indexOf("소관명"), iName = H.indexOf("세부사업명"), iAmt = H.indexOf("예산액");
    for (const r of arr.slice(hi + 1))
      if (r?.[iName]) rows.push({ ministry: r[iMin], name: String(r[iName]), amt: Number(r[iAmt]) || 0 });
  }
  console.log(`엑셀 모드: ${files.length}개 파일, ${rows.length}행`);
}

if (!rows.length) { console.log("데이터 없음 — 종료(기존 파일 유지)"); process.exit(0); }

const seen = new Set();
rows = rows.filter((r) => { const k = r.ministry + "|" + r.name + "|" + r.amt; if (seen.has(k)) return false; seen.add(k); return true; });

const live = {};
for (const [id, rule] of Object.entries(MAP)) {
  let hit = rows;
  if (rule.ministry) hit = hit.filter((r) => r.ministry === rule.ministry);
  hit = rule.exact
    ? hit.filter((r) => rule.names.includes(r.name))
    : hit.filter((r) => rule.names.some((n) => r.name.includes(n)));
  if (hit.length) {
    const total = hit.reduce((s, r) => s + r.amt, 0);
    live[id] = { label: fmt(total), asOf: today, names: [...new Set(hit.map((r) => r.name))].slice(0, 4) };
  }
}

const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
/* 데이터가 일부 부처만 있을 때 기존 값 보존 (덮어쓰기 아닌 병합) */
const merged = { ...(prev ? JSON.parse(prev) : {}), ...live };
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log(`갱신 ${Object.keys(live).length}건 / 총 ${Object.keys(merged).length}건 → ${OUT}`);
