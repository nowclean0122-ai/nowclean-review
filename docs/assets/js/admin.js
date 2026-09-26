// 관리자: PIN → 금액 입력 → ② 계좌 문자 / ③ 리뷰 문자 복사 → 작업 목록
import { post, appConfig, loadJson } from './core/api.js';
import { copyText, toast } from './core/clipboard.js';

const $ = id => document.getElementById(id);
let pin = localStorage.getItem('nc_pin') || '';
let settings = null, messages = null, cfg = null;
let token = null;   // 현재 작업 토큰 (첫 복사 때 만들어짐)

function newToken() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(7));
  return [...r].map(x => a[x % a.length]).join('');
}
const amountValue = () => Number(($('amount').value || '').replace(/[^0-9]/g, '')) || 0;
const fmt = n => n.toLocaleString('ko-KR');
const fill = (tpl, map) => tpl.replace(/\{([^}]+)\}/g, (_, k) => map[k] ?? '');
const reviewLink = () => cfg.siteBase + 'a/?j=' + token;

function ensureJob() {
  if (token) return;
  token = newToken();
  // 복사는 누른 순간 바로 해야 해서(휴대폰 브라우저 제한) 작업 등록은 기다리지 않고 뒤에서 보냄
  post({ action: 'createJob', pin, token, amount: amountValue() })
    .then(r => {
      if (!r.ok) return toast('⚠️ 작업 저장 실패: ' + (r.error || ''));
      $('jobname').textContent = r.name;
      loadList();
    })
    .catch(() => toast('⚠️ 인터넷 연결을 확인해 주세요'));
  $('reset').hidden = false;
}

async function login() {
  $('loginMsg').textContent = '확인 중…';
  try {
    const r = await post({ action: 'login', pin });
    if (!r.ok) throw new Error(r.error);
    settings = r.settings;
    localStorage.setItem('nc_pin', pin);
    $('login').hidden = true;
    $('main').hidden = false;
    $('acct').textContent = settings.account
      ? `${settings.bank} ${settings.account} (${settings.holder})`
      : '⚠️ 계좌가 비어 있어요 — 구글 시트 "설정" 탭에 입력';
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
      d.className = 'job';
      const amt = j.amount ? ' · ' + fmt(Number(j.amount)) + '원' : '';
      const clicks = (j.clicks.daangn ? ' · 🥕' : '') + (j.clicks.insta ? ' · 📷' : '');
      d.innerHTML = `<b>${j.name}</b>${amt}<br><span class="sub">지금까지: ${j.stage}${clicks}</span>`;
      return d;
    }));
  } catch (e) {}
}

async function main() {
  cfg = await appConfig();
  messages = await loadJson('messages.json');

  $('pinForm').addEventListener('submit', e => { e.preventDefault(); pin = $('pin').value.trim(); login(); });
  $('amount').addEventListener('input', () => { const n = amountValue(); $('amount').value = n ? fmt(n) : ''; });

  $('copyAccount').addEventListener('click', async () => {
    if (!settings.account) return toast('⚠️ 설정 탭에 계좌번호가 없어요');
    if (!amountValue()) return toast('금액을 먼저 넣어주세요');
    ensureJob();
    const text = fill(messages.account, { '계좌번호': settings.account, '은행': settings.bank, '예금주': settings.holder, '금액': fmt(amountValue()) });
    if (await copyText(text)) { toast('✔ ② 계좌 문자 복사됨'); $('copyAccount').classList.add('done'); }
  });

  $('copyReview').addEventListener('click', async () => {
    ensureJob();
    const text = fill(messages.review, { '링크': reviewLink() });
    if (await copyText(text)) { toast('✔ ③ 리뷰 문자 복사됨'); $('copyReview').classList.add('done'); }
  });

  $('reset').addEventListener('click', () => {
    token = null;
    $('amount').value = '';
    $('jobname').textContent = '(첫 복사 때 지금 시각으로 저장)';
    $('copyAccount').classList.remove('done');
    $('copyReview').classList.remove('done');
    $('reset').hidden = true;
  });
  $('logout').addEventListener('click', () => { localStorage.removeItem('nc_pin'); location.reload(); });

  if (!cfg.apiUrl) { $('loginMsg').textContent = '⚠️ 서버 주소(config/app.json의 apiUrl)가 아직 없어요'; return; }
  if (pin) login();
}
main();
