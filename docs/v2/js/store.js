// v2 저장소: 쓰기 = 구글 설문지에 제출, 읽기 = 시트 "공개" 탭(웹에 게시 CSV)
// 외부에 열린 구글 스크립트 주소가 없어서 이번 같은 차단 구조를 피한다.
let cfgP = null;
export const config = () => cfgP || (cfgP = fetch(new URL('../config.json', import.meta.url), { cache: 'no-store' }).then(r => r.json()));

export async function submit(fields) {
  const c = await config();
  if (!c.formAction) return false;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (c.entries[k]) p.append(c.entries[k], String(v ?? ''));
  const blob = new Blob([p.toString()], { type: 'application/x-www-form-urlencoded' });
  if (navigator.sendBeacon && navigator.sendBeacon(c.formAction, blob)) return true;
  fetch(c.formAction, { method: 'POST', mode: 'no-cors', body: p, keepalive: true }).catch(() => {});
  return true;
}

// 기기 표시 + 이 폰만의 짧은 번호(같은 링크를 다른 사람이 열어도 구분하려고). 개인정보 아님
function devId() {
  try {
    let d = localStorage.getItem('nc2_dev');
    if (!d) { d = Math.random().toString(36).slice(2, 6); localStorage.setItem('nc2_dev', d); }
    return d;
  } catch (e) { return 'x'; }
}
export function device() { return deviceName() + '#' + devId(); }
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/SamsungBrowser/.test(ua)) return 'Galaxy(삼성인터넷)';
  if (/Android/.test(ua)) return 'Android';
  return 'PC';
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// 공개 탭 → { staff: [이름], jobs: [{name, token, amount, stage, clicks[], type, clean, good, edits, created, staff}] }
export async function loadPublic() {
  const c = await config();
  if (!c.publicCsv) return { staff: [], jobs: [], ok: false };
  const url = c.publicCsv + (c.publicCsv.includes('?') ? '&' : '?') + 'nc=' + Date.now();
  const rows = parseCsv(await (await fetch(url, { cache: 'no-store' })).text()).slice(1);
  return {
    ok: true,
    staff: rows.filter(r => r[0] === '직원').map(r => r[1]),
    jobs: rows.filter(r => r[0] === '작업').map(r => ({
      name: r[1], token: r[2], amount: Number(r[3]) || 0, stage: r[4], clicks: (r[5] || '').split(',').filter(Boolean),
      type: r[6], clean: r[7], good: r[8], edits: Number(r[9]) || 0, created: Number(r[10]) || 0, staff: r[11],
    })).reverse(),
  };
}
