// v2 관리자: ① 사진 → ② 잔금·계좌 문자 → ③ 리뷰 문자 → 작업 목록
// 쓰기 = 구글 설문지 제출(웹앱 없음), 읽기 = 시트 "공개" 탭 CSV (몇 분 늦게 반영 → 이 폰에서 만든 건 바로 보여줌)
// 직원 이름 기록은 쓰지 않음(9/26 사용자 결정) — 작업 이름 = 시각만
import { loadJson } from '../../assets/js/core/api.js';
import { copyText, toast } from '../../assets/js/core/clipboard.js';
import { submit, loadPublic, config } from './store.js';

const $ = id => document.getElementById(id);
const CUR = 'nc2_current', MINE = 'nc2_mine', GONE = 'nc2_deleted';
let cfg = null, messages = null, cur = null;

const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const writeJson = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const saveCur = () => writeJson(CUR, cur);
const amountValue = () => Number(($('amount').value || '').replace(/[^0-9]/g, '')) || 0;
const fmt = n => n.toLocaleString('ko-KR');
const fill = (tpl, map) => tpl.replace(/\{([^}]+)\}/g, (_, k) => map[k] ?? '');
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const admin = fields => submit(Object.assign({ 키: cfg.key }, fields));   // 관리자 동작은 키를 붙여 보냄

function newToken() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint8Array(7))].map(x => a[x % a.length]).join('');
}
// 작업 이름 = "9/26(토) 오후 5:42"
function jobName(d) {
  const w = '일월화수목금토'[d.getDay()], h = d.getHours();
  return `${d.getMonth() + 1}/${d.getDate()}(${w}) ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// 예전에 이름을 붙여 만든 작업("김수영·김팀장 · 9/26(토) …")도 시각만 보여줌
const showName = n => { const t = String(n || '').split(' · ').pop(); return /^\d+\/\d+\(/.test(t) ? t : String(n || ''); };
const reviewLink = () => cfg.siteBase + 'a/?j=' + cur.token + '&t=' + cur.created.toString(36);

function accountDefault() {
  const s = cfg.settings || {};
  return fill(messages.account, {
    '계좌번호': s.account || '[계좌번호를 입력해 주세요]', '은행': s.bank || '[은행]', '예금주': s.holder || '[예금주]',
    '금액': amountValue() ? fmt(amountValue()) : '[금액]',
  });
}

function freshJob() {
  cur = { token: newToken(), created: Date.now(), saved: false, name: '', amount: 0, steps: {}, accountEdited: false, reviewEdited: false };
  saveCur();
}

/* ---------- 지금 고객 ---------- */

function renderCard() {
  const min = Math.max(0, Math.round((Date.now() - cur.created) / 60000));
  $('jobname').textContent = cur.saved ? cur.name : '';
  $('jobhint').textContent = cur.saved
    ? `지금 고객: ${cur.name} 시작 (${min}분 전) · 끝나면 맨 아래 "이 고객 끝"`
    : '위에서부터 차례로 누르면 끝나요';
  ['s1', 's2', 's3'].forEach(id => $(id).classList.toggle('done', !!(cur.steps || {})[id]));
}
const markStep = id => { cur.steps = Object.assign({}, cur.steps, { [id]: true }); saveCur(); renderCard(); };

function render() {
  $('amount').value = cur.amount ? fmt(cur.amount) : '';
  renderCard();
  $('accountText').value = cur.accountEdited ? (cur.accountText || accountDefault()) : accountDefault();
  $('reviewText').value = cur.reviewEdited ? (cur.reviewText || fill(messages.review, { '링크': reviewLink() })) : fill(messages.review, { '링크': reviewLink() });
  $('acctNote').textContent = (cfg.settings || {}).account ? '' : '계좌가 아직 없어요 — 알려주시면 설정에 넣어둘게요';
}

// 저장된 고객 링크를 오래 지나서 또 복사하면 = 다음 고객에게 같은 링크를 보낼 위험 → 한 번 묻기
const OLD_MIN = 90;
function okToReuse() {
  if (!cur.saved) return true;
  const min = Math.round((Date.now() - cur.created) / 60000);
  if (min < OLD_MIN) return true;
  const ago = min < 120 ? min + '분' : Math.round(min / 60) + '시간';
  if (confirm(`이 문자는 ${ago} 전(${cur.name})에 시작한 고객 거예요.\n\n같은 고객에게 다시 보내는 거면 [확인]\n새 고객이면 [취소] → "이번 고객 리뷰 요청 시작"을 눌러주세요.`)) return true;
  showStart(); $('startNew').classList.add('pulse');
  return false;
}

function ensureSaved() {
  const amount = amountValue();
  if (cur.saved) {
    if (amount !== cur.amount) { cur.amount = amount; saveCur(); admin({ 종류: '수정', 토큰: cur.token, 금액: amount }); }
    return;
  }
  cur.saved = true; cur.amount = amount; cur.name = jobName(new Date(cur.created)); saveCur();
  admin({ 종류: '작업', 토큰: cur.token, 작업이름: cur.name, 금액: amount, 담당직원: '' });
  const mine = readJson(MINE, []); mine.push({ token: cur.token, name: cur.name, amount, created: cur.created }); writeJson(MINE, mine.slice(-40));
  render(); loadList();
}

/* ---------- 최근 작업 (공개 탭 + 이 폰에서 만든 것) ---------- */

async function loadList() {
  const box = $('list');
  let pub = { jobs: [], ok: false };
  try { pub = await loadPublic(); } catch (e) {}
  const gone = new Set(readJson(GONE, []));
  const known = new Set(pub.jobs.map(j => j.token));
  const pending = readJson(MINE, []).filter(m => !known.has(m.token)).reverse()
    .map(m => ({ ...m, stage: '반영 중(몇 분 걸려요)', clicks: [], pending: true }));
  const jobs = [...pending, ...pub.jobs].filter(j => !gone.has(j.token));

  const sum = { opened: 0, survey: 0, daangn: 0, insta: 0 };
  jobs.forEach(j => { if (j.stage && j.stage !== '작업 생성' && !j.pending) sum.opened++; if (j.type || j.clean) sum.survey++; if (j.clicks.includes('daangn')) sum.daangn++; if (j.clicks.includes('insta')) sum.insta++; });
  $('sumbar').textContent = `작업 ${jobs.length} · 링크 열람 ${sum.opened} · 설문 ${sum.survey} · 🥕 당근 ${sum.daangn} · 📷 인스타 ${sum.insta}`;
  if (!jobs.length) { box.innerHTML = '<p class="sub">아직 작업이 없어요</p>'; return; }

  const days = Number(cfg.linkDays) || 1;
  const icons = { daangn: '🥕 후기', daangn_follow: '🥕 단골', kakao: '💬', insta: '📷' };
  box.replaceChildren(...jobs.map(j => {
    const d = document.createElement('div');
    const isNow = cur && j.token === cur.token;
    d.className = 'job' + (isNow ? ' now' : '');
    const clicks = j.clicks.map(c => ' · ' + (icons[c] || c)).join('');
    const closed = j.created && Date.now() - j.created > days * 86400000 ? ' <span class="sub">(링크 마감)</span>' : '';
    const sv = (j.type || j.clean || j.good)
      ? `<div class="ans">${esc(j.type)}${j.clean ? ' · <b>깨끗</b> ' + esc(j.clean) : ''}${j.good ? ' · <b>좋았던 점</b> ' + esc(j.good) : ''}${j.edits ? ' (수정 ' + j.edits + '회)' : ''}</div>` : '';
    d.innerHTML = `<div><b>${esc(showName(j.name))}</b>${j.amount ? ' · ' + fmt(j.amount) + '원' : ''}${isNow ? ' <span class="nowtag">지금 고객</span>' : ''}${closed}<br><span class="sub">지금까지: ${esc(j.stage)}${clicks}</span>${sv}</div>`;
    const del = document.createElement('button');
    del.className = 'link'; del.type = 'button'; del.textContent = '🗑';
    del.addEventListener('click', () => {
      if (!confirm(`${showName(j.name)} 작업을 지울까요?\n(테스트·실수로 만든 작업만 지우세요)`)) return;
      admin({ 종류: '삭제', 토큰: j.token });
      const g = readJson(GONE, []); g.push(j.token); writeJson(GONE, g.slice(-100));
      if (isNow) { freshJob(); render(); }
      toast('🗑 지웠어요'); loadList();
    });
    d.append(del);
    return d;
  }));
}

/* ---------- 시작 ---------- */

// 열 때마다 시작 화면. 30분 안에 시작한 고객이 있으면 '이어서' 링크만 작게
const RESUME_MIN = 30;
function showStart() {
  $('start').hidden = false; $('flow').hidden = true;
  const min = cur && cur.saved && !cur.done ? Math.round((Date.now() - cur.created) / 60000) : 999;
  const r = $('resume');
  r.hidden = !(min < RESUME_MIN);
  if (!r.hidden) r.textContent = '↩ 방금 하던 고객 이어서 (' + cur.name + ' · ' + min + '분 전)';
  window.scrollTo(0, 0);
}
function showFlow() { $('start').hidden = true; $('flow').hidden = false; render(); window.scrollTo(0, 0); }

function enter() {
  $('login').hidden = true; $('main').hidden = false;
  // 예전 버전이 폰에 남긴 직원 이름 기록은 지움
  ['nc2_staff', 'nc2_extra_staff'].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  cur = readJson(CUR, null);
  if (!cur || !cur.created) freshJob();
  if (cur.staff || /·/.test(cur.name || '')) { delete cur.staff; if (cur.saved) cur.name = jobName(new Date(cur.created)); saveCur(); }
  showStart();
  loadList();
}

async function main() {
  cfg = await config();
  messages = await loadJson('messages.json');
  $('sheetLink').href = cfg.sheetUrl || '#';

  $('pinForm').addEventListener('submit', e => {
    e.preventDefault();
    if ($('pin').value.trim() !== String(cfg.pin)) { $('loginMsg').textContent = '번호가 맞지 않아요'; return; }
    localStorage.setItem('nc2_in', '1'); enter();
  });
  $('amount').addEventListener('input', () => {
    const n = amountValue(); $('amount').value = n ? fmt(n) : '';
    if (!cur.saved) { cur.amount = n; saveCur(); }
    if (!cur.accountEdited) $('accountText').value = accountDefault();
  });
  $('accountText').addEventListener('input', () => { cur.accountEdited = true; cur.accountText = $('accountText').value; saveCur(); });
  $('reviewText').addEventListener('input', () => { cur.reviewEdited = true; cur.reviewText = $('reviewText').value; saveCur(); });

  $('photoDone').addEventListener('click', () => { markStep('s1'); toast('✔ 좋아요! 다음은 2번'); });
  $('copyAccount').addEventListener('click', async () => {
    if (!okToReuse()) return;
    if (await copyText($('accountText').value)) { ensureSaved(); toast('✔ 복사됐어요 — 문자방에 붙여넣고 보내세요'); markStep('s2'); }
  });
  $('copyReview').addEventListener('click', async () => {
    if (!okToReuse()) return;
    if (!cur.saved) { cur.created = Date.now(); cur.reviewEdited = false; saveCur(); render(); }   // 링크 시각 = 처음 보내는 순간
    const text = $('reviewText').value;
    if (!text.includes(cur.token)) { cur.reviewEdited = false; saveCur(); render(); return toast('⚠️ 링크 줄이 지워져서 문구를 다시 불러왔어요'); }
    if (await copyText(text)) { ensureSaved(); toast('✔ 복사됐어요 — 문자방에 붙여넣고 보내세요'); markStep('s3'); }
  });
  $('preview').addEventListener('click', () => {
    if (!cur.saved) return toast('문자를 한 번 복사해서 저장한 뒤에 볼 수 있어요');
    window.open(reviewLink() + '&preview=1', '_blank');
  });
  $('startNew').addEventListener('click', () => { freshJob(); showFlow(); toast('✚ 이번 고객 링크 준비됐어요 — 1번부터'); });
  $('resume').addEventListener('click', () => showFlow());
  $('nextJob').addEventListener('click', () => { cur.done = true; saveCur(); showStart(); $('resume').hidden = true; loadList(); toast('수고하셨어요! 다음 고객은 위 버튼으로'); });
  $('logout').addEventListener('click', () => { localStorage.removeItem('nc2_in'); location.reload(); });
  $('refresh').addEventListener('click', () => { loadList(); toast('목록 새로 불러오는 중'); });

  if (!cfg.formAction) $('loginMsg').textContent = '⚠️ 설정(구글 설문지 연결)이 아직 안 됐어요';
  if (localStorage.getItem('nc2_in')) enter();
}
main();
