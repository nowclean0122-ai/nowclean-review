// 관리자: PIN → 같이 간 사람 → 금액 → ② 계좌 문자 / ③ 리뷰 문자 (고쳐서 복사 가능) → 작업 목록
// "지금 작업"은 이 폰에 저장돼서 새로고침하거나 여러 번 복사해도 작업이 늘지 않는다.
import { post, appConfig, loadJson } from './core/api.js';
import { copyText, toast } from './core/clipboard.js';

const $ = id => document.getElementById(id);
const CUR = 'nc_current';
const LAST_STAFF = 'nc_staff';          // 이 폰에서 마지막으로 고른 사람들 (다음 작업 기본값)
let pin = localStorage.getItem('nc_pin') || '';
let settings = null, messages = null, cfg = null;
let staffList = [];                     // 시트 "직원" 탭
let listWho = '';                       // 목록 거르기 ('' = 전체)
let cur = null;   // { token, saved, name, amount, staff[], accountEdited, reviewEdited }

const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const saveCur = () => localStorage.setItem(CUR, JSON.stringify(cur));
function newToken() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(7));
  return [...r].map(x => a[x % a.length]).join('');
}
const amountValue = () => Number(($('amount').value || '').replace(/[^0-9]/g, '')) || 0;
const fmt = n => n.toLocaleString('ko-KR');
const fill = (tpl, map) => tpl.replace(/\{([^}]+)\}/g, (_, k) => map[k] ?? '');
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function accountDefault() {
  return fill(messages.account, {
    '계좌번호': settings.account || '[계좌번호를 입력해 주세요]',
    '은행': settings.bank || '[은행]',
    '예금주': settings.holder || '[예금주]',
    '금액': amountValue() ? fmt(amountValue()) : '[금액]',
  });
}
const reviewDefault = () => fill(messages.review, { '링크': cfg.siteBase + 'a/?j=' + cur.token });

function freshJob() {
  cur = { token: newToken(), saved: false, name: '', amount: 0, staff: readJson(LAST_STAFF, []), accountEdited: false, reviewEdited: false };
  saveCur();
}

/* ---------- 같이 간 사람 ---------- */

function renderStaff() {
  const chosen = new Set(cur.staff);
  $('staffChips').replaceChildren(...staffList.map(name => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (chosen.has(name) ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => {
      chosen.has(name) ? chosen.delete(name) : chosen.add(name);
      cur.staff = staffList.filter(n => chosen.has(n));
      saveCur();
      localStorage.setItem(LAST_STAFF, JSON.stringify(cur.staff));
      renderStaff(); renderCard();
      if (cur.saved) saveStaffChange();   // 저장된 작업이면 서버의 담당 직원·작업 이름도 고침
    });
    return b;
  }));
  if (!staffList.length) $('staffChips').innerHTML = '<p class="sub small">아직 이름이 없어요 — 아래에서 추가해 주세요</p>';

  $('staffFilter').replaceChildren(...['전체', ...staffList].map(name => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + ((name === '전체' ? '' : name) === listWho ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => { listWho = name === '전체' ? '' : name; renderStaff(); loadList(); });
    return b;
  }));
}

// 저장된 작업의 사람을 바꾼 경우 — 연달아 누를 수 있어 0.8초 모았다가 한 번 보냄
let staffTimer = null;
function saveStaffChange() {
  clearTimeout(staffTimer);
  staffTimer = setTimeout(async () => {
    const r = await post({ action: 'updateJob', pin, token: cur.token, staff: cur.staff }).catch(() => ({}));
    if (!r.ok) return toast('⚠️ 사람 바꾸기 저장 실패');
    if (r.name) { cur.name = r.name; saveCur(); renderCard(); }
    toast('✔ 같이 간 사람 바꿨어요');
    loadList();
  }, 800);
}

async function addStaff() {
  const name = $('newStaff').value.trim();
  if (!name) return toast('이름을 넣어주세요');
  $('addStaff').disabled = true;
  try {
    const r = await post({ action: 'addStaff', pin, name });
    if (!r.ok) throw new Error(r.error);
    staffList = r.staff;
    if (!cur.staff.includes(name)) { cur.staff.push(name); saveCur(); localStorage.setItem(LAST_STAFF, JSON.stringify(cur.staff)); if (cur.saved) saveStaffChange(); }
    $('newStaff').value = '';
    renderStaff(); renderCard();
    toast('✔ ' + name + ' 추가됐어요');
  } catch (e) { toast('⚠️ ' + (e.message || '추가 실패')); }
  $('addStaff').disabled = false;
}

/* ---------- 지금 작업 ---------- */

function renderCard() {
  const who = cur.staff.length ? cur.staff.join('·') + ' · ' : '';
  $('jobname').textContent = cur.saved ? cur.name : who + '새 작업 (아직 저장 전)';
  $('jobhint').textContent = cur.saved
    ? '저장된 작업이에요. 다시 복사해도 새 작업이 생기지 않아요. 같이 간 사람은 지금도 바꿀 수 있어요.'
    : '문자를 처음 복사하는 순간 저장돼요. 여러 번 복사해도 작업은 1개예요.';
  $('jobcard').classList.toggle('saved', cur.saved);
}

function render() {
  $('amount').value = cur.amount ? fmt(cur.amount) : '';
  renderCard();
  renderStaff();
  $('accountText').value = cur.accountEdited ? (cur.accountText || accountDefault()) : accountDefault();
  $('reviewText').value = cur.reviewEdited ? (cur.reviewText || reviewDefault()) : reviewDefault();
  $('copyAccount').classList.remove('done');
  $('copyReview').classList.remove('done');
  $('acctNote').textContent = settings.account ? '' : '계좌가 아직 없어요 — 구글 시트 "설정" 탭에 넣으면 자동으로 채워져요';
}

// 첫 복사 때 한 번만 서버에 작업 등록. 이후 복사는 등록하지 않음(금액이 바뀌었으면 금액만 고침)
function ensureSaved() {
  const amount = amountValue();
  if (cur.saved) {
    if (amount !== cur.amount) { cur.amount = amount; saveCur(); post({ action: 'updateJob', pin, token: cur.token, amount }).catch(() => {}); }
    return;
  }
  cur.saved = true; cur.amount = amount; cur.name = '저장 중…'; saveCur(); render();
  post({ action: 'createJob', pin, token: cur.token, amount, staff: cur.staff })
    .then(r => {
      if (!r.ok) { cur.saved = false; saveCur(); render(); return toast('⚠️ 작업 저장 실패: ' + (r.error || '')); }
      if (r.name) { cur.name = r.name; saveCur(); render(); }
      loadList();
    })
    .catch(() => { cur.saved = false; saveCur(); render(); toast('⚠️ 인터넷 연결을 확인해 주세요'); });
}

async function login() {
  $('loginMsg').textContent = '확인 중… (처음엔 5초쯤 걸려요)';
  try {
    const r = await post({ action: 'login', pin });
    if (!r.ok) throw new Error(r.error);
    settings = r.settings;
    staffList = r.staff || [];
    localStorage.setItem('nc_pin', pin);
    $('daangnLink').href = r.daangnUrl || '#';
    $('login').hidden = true;
    $('main').hidden = false;
    cur = readJson(CUR, null);
    if (!cur) freshJob();
    cur.staff = (cur.staff || []).filter(n => cur.saved || staffList.includes(n));
    render();
    loadList();
  } catch (e) {
    localStorage.removeItem('nc_pin');
    $('login').hidden = false;
    $('main').hidden = true;
    $('loginMsg').textContent = e.message || '연결 실패';
  }
}

/* ---------- 최근 작업 목록 ---------- */

async function loadList() {
  const box = $('list');
  try {
    const r = await post({ action: 'listJobs', pin, staff: listWho });
    if (!r.ok) return;
    const s = r.sum;
    $('sumbar').textContent = `${r.who} · 작업 ${s.jobs} · 링크 열람 ${s.opened} · 설문 ${s.survey} · 🥕 당근 ${s.daangn} · 📷 인스타 ${s.insta}`;
    if (!r.jobs.length) { box.innerHTML = '<p class="sub">아직 작업이 없어요</p>'; return; }
    box.replaceChildren(...r.jobs.map(j => {
      const d = document.createElement('div');
      const isNow = cur && j.token === cur.token;
      d.className = 'job' + (isNow ? ' now' : '');
      const amt = j.amount ? ' · ' + fmt(Number(j.amount)) + '원' : '';
      const clicks = (j.clicks.daangn ? ' · 🥕' : '') + (j.clicks.kakao ? ' · 💬' : '') + (j.clicks.insta ? ' · 📷' : '');
      const tag = isNow ? ' <span class="nowtag">지금 작업</span>' : '';
      const closed = j.closed ? ' <span class="sub">(링크 마감)</span>' : '';
      const sv = j.survey
        ? `<div class="ans">${esc(j.survey.type)}${j.survey.clean ? ' · <b>깨끗</b> ' + esc(j.survey.clean) : ''}${j.survey.good ? ' · <b>좋았던 점</b> ' + esc(j.survey.good) : ''}${j.survey.edits ? ' (수정 ' + j.survey.edits + '회)' : ''}</div>`
        : '';
      d.innerHTML = `<div><b>${esc(j.name)}</b>${amt}${tag}${closed}<br><span class="sub">지금까지: ${j.stage}${clicks}</span>${sv}</div>`;
      const del = document.createElement('button');
      del.className = 'link'; del.type = 'button'; del.textContent = '🗑';
      del.addEventListener('click', async () => {
        if (!confirm(`${j.name} 작업을 지울까요?\n(테스트·실수로 만든 작업만 지우세요. 고객 링크도 닫혀요)`)) return;
        d.style.opacity = '.4';
        const res = await post({ action: 'deleteJob', pin, token: j.token }).catch(() => ({}));
        if (!res.ok) { d.style.opacity = '1'; return toast('⚠️ 지우기 실패'); }
        if (isNow) { freshJob(); render(); }
        toast('🗑 지웠어요'); loadList();
      });
      d.append(del);
      return d;
    }));
  } catch (e) {}
}

/* ---------- 시작 ---------- */

async function main() {
  cfg = await appConfig();
  messages = await loadJson('messages.json');

  $('pinForm').addEventListener('submit', e => { e.preventDefault(); pin = $('pin').value.trim(); login(); });
  $('addStaff').addEventListener('click', addStaff);
  $('newStaff').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addStaff(); } });

  $('amount').addEventListener('input', () => {
    const n = amountValue();
    $('amount').value = n ? fmt(n) : '';
    if (!cur.saved) { cur.amount = n; saveCur(); }
    if (!cur.accountEdited) $('accountText').value = accountDefault();
  });
  $('accountText').addEventListener('input', () => { cur.accountEdited = true; cur.accountText = $('accountText').value; saveCur(); });
  $('reviewText').addEventListener('input', () => { cur.reviewEdited = true; cur.reviewText = $('reviewText').value; saveCur(); });

  $('copyAccount').addEventListener('click', async () => {
    if (await copyText($('accountText').value)) { ensureSaved(); toast('✔ ② 계좌 문자 복사됨'); $('copyAccount').classList.add('done'); }
  });
  $('copyReview').addEventListener('click', async () => {
    const text = $('reviewText').value;
    if (!text.includes(cur.token)) {
      cur.reviewEdited = false; saveCur(); render();
      return toast('⚠️ 링크 줄이 지워져서 문구를 다시 불러왔어요');
    }
    if (!cur.saved && !cur.staff.length && !confirm('같이 간 사람을 안 골랐어요. 그대로 보낼까요?')) return;
    if (await copyText(text)) { ensureSaved(); toast('✔ ③ 리뷰 문자 복사됨'); $('copyReview').classList.add('done'); }
  });

  $('preview').addEventListener('click', () => {
    if (!cur.saved) return toast('문자를 한 번 복사해서 작업을 저장한 뒤에 볼 수 있어요');
    window.open(cfg.siteBase + 'a/?j=' + cur.token + '&preview=1', '_blank');
  });
  $('nextJob').addEventListener('click', () => {
    if (cur.saved && !confirm(`"${cur.name}" 작업을 끝내고 새 작업을 시작할까요?`)) return;
    freshJob(); render(); loadList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('✚ 새 작업 준비됐어요 — 같이 간 사람·금액부터');
  });
  $('logout').addEventListener('click', () => { localStorage.removeItem('nc_pin'); location.reload(); });

  if (!cfg.apiUrl) { $('loginMsg').textContent = '⚠️ 서버 주소(config/app.json의 apiUrl)가 아직 없어요'; return; }
  if (pin) login();
}
main();
