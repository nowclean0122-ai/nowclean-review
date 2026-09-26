// 관리자: PIN → 금액 → ② 계좌 문자 / ③ 리뷰 문자 (고쳐서 복사 가능) → 작업 목록
// "지금 작업"은 이 폰에 저장돼서 새로고침하거나 여러 번 복사해도 작업이 늘지 않는다.
import { post, appConfig, loadJson } from './core/api.js';
import { copyText, toast } from './core/clipboard.js';

const $ = id => document.getElementById(id);
const CUR = 'nc_current';
let pin = localStorage.getItem('nc_pin') || '';
let settings = null, messages = null, cfg = null;
let cur = null;   // { token, saved, name, amount, accountEdited, reviewEdited }

const readCur = () => { try { return JSON.parse(localStorage.getItem(CUR) || 'null'); } catch (e) { return null; } };
const saveCur = () => localStorage.setItem(CUR, JSON.stringify(cur));
function newToken() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(7));
  return [...r].map(x => a[x % a.length]).join('');
}
const amountValue = () => Number(($('amount').value || '').replace(/[^0-9]/g, '')) || 0;
const fmt = n => n.toLocaleString('ko-KR');
const fill = (tpl, map) => tpl.replace(/\{([^}]+)\}/g, (_, k) => map[k] ?? '');

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
  cur = { token: newToken(), saved: false, name: '', amount: 0, accountEdited: false, reviewEdited: false };
  saveCur();
}

function render() {
  $('amount').value = cur.amount ? fmt(cur.amount) : '';
  $('jobname').textContent = cur.saved ? cur.name : '새 작업 (아직 저장 전)';
  $('jobhint').textContent = cur.saved
    ? '저장된 작업이에요. 다시 복사해도 새 작업이 생기지 않아요.'
    : '문자를 처음 복사하는 순간 지금 시각으로 저장돼요. 여러 번 복사해도 작업은 1개예요.';
  $('jobcard').classList.toggle('saved', cur.saved);
  if (!cur.accountEdited) $('accountText').value = accountDefault();
  else $('accountText').value = cur.accountText || accountDefault();
  if (!cur.reviewEdited) $('reviewText').value = reviewDefault();
  else $('reviewText').value = cur.reviewText || reviewDefault();
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
  post({ action: 'createJob', pin, token: cur.token, amount })
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
    localStorage.setItem('nc_pin', pin);
    $('login').hidden = true;
    $('main').hidden = false;
    cur = readCur() || null;
    if (!cur) freshJob();
    render();
    loadList();
  } catch (e) {
    localStorage.removeItem('nc_pin');
    $('login').hidden = false;
    $('main').hidden = true;
    $('loginMsg').textContent = e.message || '연결 실패';
  }
}

async function loadList() {
  const box = $('list');
  try {
    const r = await post({ action: 'listJobs', pin });
    if (!r.ok) return;
    if (!r.jobs.length) { box.innerHTML = '<p class="sub">아직 작업이 없어요</p>'; return; }
    box.replaceChildren(...r.jobs.map(j => {
      const d = document.createElement('div');
      d.className = 'job' + (cur && j.token === cur.token ? ' now' : '');
      const amt = j.amount ? ' · ' + fmt(Number(j.amount)) + '원' : '';
      const clicks = (j.clicks.daangn ? ' · 🥕' : '') + (j.clicks.insta ? ' · 📷' : '');
      const tag = cur && j.token === cur.token ? ' <span class="nowtag">지금 작업</span>' : '';
      d.innerHTML = `<div><b>${j.name}</b>${amt}${tag}<br><span class="sub">지금까지: ${j.stage}${clicks}</span></div>`;
      const del = document.createElement('button');
      del.className = 'link'; del.type = 'button'; del.textContent = '🗑';
      del.addEventListener('click', async () => {
        if (!confirm(`${j.name} 작업을 지울까요?\n(테스트·실수로 만든 작업만 지우세요)`)) return;
        d.style.opacity = '.4';
        const res = await post({ action: 'deleteJob', pin, token: j.token }).catch(() => ({}));
        if (!res.ok) { d.style.opacity = '1'; return toast('⚠️ 지우기 실패'); }
        if (cur && j.token === cur.token) { freshJob(); render(); }
        toast('🗑 지웠어요'); loadList();
      });
      d.append(del);
      return d;
    }));
  } catch (e) {}
}

async function main() {
  cfg = await appConfig();
  messages = await loadJson('messages.json');

  $('pinForm').addEventListener('submit', e => { e.preventDefault(); pin = $('pin').value.trim(); login(); });

  $('amount').addEventListener('input', () => {
    const n = amountValue();
    $('amount').value = n ? fmt(n) : '';
    if (!cur.saved) { cur.amount = n; saveCur(); }
    if (!cur.accountEdited) $('accountText').value = accountDefault();
  });
  $('accountText').addEventListener('input', () => { cur.accountEdited = true; cur.accountText = $('accountText').value; saveCur(); });
  $('reviewText').addEventListener('input', () => { cur.reviewEdited = true; cur.reviewText = $('reviewText').value; saveCur(); });

  $('copyAccount').addEventListener('click', async () => {
    const text = $('accountText').value;
    if (await copyText(text)) { ensureSaved(); toast('✔ ② 계좌 문자 복사됨'); $('copyAccount').classList.add('done'); }
  });
  $('copyReview').addEventListener('click', async () => {
    const text = $('reviewText').value;
    if (!text.includes(cur.token)) {
      cur.reviewEdited = false; saveCur(); render();
      return toast('⚠️ 링크 줄이 지워져서 문구를 다시 불러왔어요');
    }
    if (await copyText(text)) { ensureSaved(); toast('✔ ③ 리뷰 문자 복사됨'); $('copyReview').classList.add('done'); }
  });

  $('nextJob').addEventListener('click', () => {
    if (cur.saved && !confirm(`"${cur.name}" 작업을 끝내고 새 작업을 시작할까요?`)) return;
    freshJob(); render(); loadList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('amount').focus();
    toast('✚ 새 작업 준비됐어요 — 금액부터 넣어주세요');
  });
  $('preview').addEventListener('click', () => {
    if (!cur.saved) return toast('문자를 한 번 복사해서 작업을 저장한 뒤에 볼 수 있어요');
    window.open(cfg.siteBase + 'a/?j=' + cur.token + '&preview=1', '_blank');
  });
  $('logout').addEventListener('click', () => { localStorage.removeItem('nc_pin'); location.reload(); });

  if (!cfg.apiUrl) { $('loginMsg').textContent = '⚠️ 서버 주소(config/app.json의 apiUrl)가 아직 없어요'; return; }
  if (pin) login();
}
main();
