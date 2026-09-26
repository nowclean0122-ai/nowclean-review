/**
 * 나우클린 리뷰 퍼널 — 서버 (Google Apps Script 웹앱)
 * 저장: 구글 시트(작업/기록/설문/설정) · 메일: 이 계정 Gmail로 자기 자신에게
 * 화면(GitHub Pages)에서 GET/POST로 호출한다.
 */

const TAB = { job: '작업', log: '기록', survey: '설문', settings: '설정' };

// 퍼널 단계 순서 — 목록·요약 메일에서 "어디까지 갔나" 계산에 사용
const STAGES = [
  ['job_created', '작업 생성'],
  ['open', '링크 열람'],
  ['survey_start', '설문 시작'],
  ['survey_submit', '설문 제출'],
  ['review_view', '후기 화면'],
  ['click', '당근/인스타 클릭'],
  ['thanks_view', '감사 화면'],
];

const EVENT_LABEL = {
  job_created: '작업 생성', open: '링크 열람', reopen: '다시 열람',
  survey_view: '설문 화면', survey_start: '설문 시작', survey_submit: '설문 제출',
  review_view: '후기 화면', click_daangn: '🥕 당근 클릭', click_insta: '📷 인스타 클릭',
  done: '다 했어요', auto_thanks: '돌아와서 자동 감사', thanks_view: '감사 화면', leave: '나감', 'return': '돌아옴',
};

function doGet(e) {
  const p = e.parameter || {};
  try {
    migrate_();
    if (p.action === 'job') return json_(publicJob_(p.j));
    return json_({ ok: true, service: 'nowclean-review' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function migrate_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_INSTA')) return;
  const rows = sheet_(TAB.settings).getDataRange().getValues();
  rows.forEach((r, i) => {
    if (r[0] === '인스타후기링크' && String(r[1]).indexOf('/p/') < 0) sheet_(TAB.settings).getRange(i + 1, 2).setValue('https://www.instagram.com/p/DdqqWnkEyxt/');
  });
  CacheService.getScriptCache().remove('settings');
  props.setProperty('MIG_INSTA', '1');
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  try {
    ensureTrigger_();
    switch (body.action) {
      case 'log': return json_(logEvent_(body));
      case 'survey': return json_(saveSurvey_(body));
      case 'login': return json_(login_(body));
      case 'createJob': return json_(createJob_(body));
      case 'listJobs': return json_(listJobs_(body));
      default: return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- 고객 쪽 ---------- */

function publicJob_(token) {
  const job = findJob_(token);
  if (!job) return { ok: false, error: 'no job' };
  const s = settings_();
  return { ok: true, name: job.name, links: { daangn: s['당근후기링크'] || '', insta: s['인스타후기링크'] || '', kakao: s['카카오맵링크'] || '', naver: s['네이버리뷰링크'] || '' } };
}

function logEvent_(b) {
  const job = findJob_(b.j);
  if (!job) return { ok: false, error: 'no job' };        // 등록된 작업 토큰만 받음
  const cache = CacheService.getScriptCache();
  const key = 'n_' + b.j;
  const n = Number(cache.get(key) || 0);
  if (n > 80) return { ok: false, error: 'too many' };   // 한 작업당 과도한 기록 차단
  cache.put(key, String(n + 1), 21600);
  appendLog_(job, String(b.ev || '').slice(0, 30), String(b.step || '').slice(0, 30), String(b.device || '').slice(0, 40));
  return { ok: true };
}

function saveSurvey_(b) {
  const job = findJob_(b.j);
  if (!job) return { ok: false, error: 'no job' };
  const a = b.answers || {};
  const join = v => (Array.isArray(v) ? v : [v]).filter(Boolean).map(String).join(', ').slice(0, 500);
  sheet_(TAB.survey).appendRow([new Date(), job.name, job.token, join(a.type), join(a.clean), join(a.good)]);
  appendLog_(job, 'survey_submit', 'survey', String(b.device || '').slice(0, 40));
  return { ok: true };
}

/* ---------- 관리자 쪽 ---------- */

function checkPin_(pin) {
  const s = settings_();
  if (!pin || String(pin) !== String(s['관리자PIN'])) throw new Error('PIN이 맞지 않아요');
  return s;
}

function login_(b) {
  const s = checkPin_(b.pin);
  return { ok: true, settings: { bank: s['은행'] || '', account: s['계좌번호'] || '', holder: s['예금주'] || '' } };
}

function createJob_(b) {
  checkPin_(b.pin);
  const token = String(b.token || '');
  if (!/^[a-z0-9]{6,12}$/.test(token)) throw new Error('bad token');
  if (findJob_(token)) return { ok: true, dup: true };
  const now = new Date();
  const name = jobName_(now);
  const amount = Number(b.amount) || '';
  sheet_(TAB.job).appendRow([now, name, amount, token]);
  CacheService.getScriptCache().remove('job_' + token);
  appendLog_({ name, token, created: now }, 'job_created', 'admin', '');
  return { ok: true, name };
}

function listJobs_(b) {
  checkPin_(b.pin);
  const jobs = sheet_(TAB.job).getDataRange().getValues().slice(1).slice(-30).reverse();
  const logs = sheet_(TAB.log).getDataRange().getValues().slice(1);
  const byToken = {};
  logs.forEach(r => { (byToken[r[2]] = byToken[r[2]] || []).push(r[3]); });
  return {
    ok: true,
    jobs: jobs.map(r => {
      const evs = byToken[r[3]] || [];
      return { name: r[1], amount: r[2], token: r[3], stage: stageOf_(evs), clicks: { daangn: evs.includes('click_daangn'), insta: evs.includes('click_insta') } };
    }),
  };
}

/* ---------- 하루 요약 메일 (매일 21시) ---------- */

function dailyDigest() {
  const props = PropertiesService.getScriptProperties();
  const since = Number(props.getProperty('LAST_DIGEST') || 0);
  const now = Date.now();
  const rows = sheet_(TAB.log).getDataRange().getValues().slice(1).filter(r => new Date(r[0]).getTime() > since);
  props.setProperty('LAST_DIGEST', String(now));
  if (!rows.length) return;

  const groups = {};
  rows.forEach(r => { (groups[r[1]] = groups[r[1]] || []).push(r); });
  const allLogs = sheet_(TAB.log).getDataRange().getValues().slice(1);
  const count = ev => new Set(rows.filter(r => String(r[3]).indexOf(ev) === 0).map(r => r[2])).size;

  const lines = [];
  lines.push('오늘 움직임이 있었던 작업 ' + Object.keys(groups).length + '건');
  lines.push('링크 열람 ' + count('open') + ' · 설문 제출 ' + count('survey_submit') + ' · 후기 화면 ' + count('review_view') +
             ' · 당근 클릭 ' + count('click_daangn') + ' · 인스타 클릭 ' + count('click_insta'));
  lines.push('');
  Object.keys(groups).forEach(name => {
    const token = groups[name][0][2];
    const evs = allLogs.filter(r => r[2] === token).map(r => r[3]);
    lines.push('■ ' + name + ' — 지금까지: ' + stageOf_(evs));
    groups[name].forEach(r => {
      lines.push('   ' + Utilities.formatDate(new Date(r[0]), 'Asia/Seoul', 'HH:mm') + '  ' + (EVENT_LABEL[r[3]] || r[3]) +
                 (r[4] ? ' (' + r[4] + ')' : '') + (r[5] ? ' · 청소 후 ' + r[5] : ''));
    });
    lines.push('');
  });
  lines.push('자세한 기록: ' + SpreadsheetApp.openById(sheetId_()).getUrl());

  const to = settings_()['알림메일'] || Session.getEffectiveUser().getEmail();
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d');
  MailApp.sendEmail(to, '[나우클린 리뷰퍼널] ' + today + ' 요약 — 열람 ' + count('open') + ' · 설문 ' + count('survey_submit') + ' · 당근 ' + count('click_daangn'), lines.join('\n'));
}

function ensureTrigger_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TRIGGER_OK')) return;
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyDigest');
  if (!has) ScriptApp.newTrigger('dailyDigest').timeBased().atHour(21).everyDays(1).inTimezone('Asia/Seoul').create();
  props.setProperty('TRIGGER_OK', '1');
}

/* ---------- 시트 ---------- */

function sheetId_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  if (id) return id;
  const ss = SpreadsheetApp.create('나우클린 리뷰퍼널 DB');
  const first = ss.getSheets()[0];
  first.setName(TAB.job);
  first.appendRow(['생성 시각', '작업 이름', '금액', '토큰']);
  ss.insertSheet(TAB.log).appendRow(['시각', '작업 이름', '토큰', '이벤트', '화면', '청소 후 경과', '기기']);
  ss.insertSheet(TAB.survey).appendRow(['시각', '작업 이름', '토큰', '청소 종류', '깨끗해진 곳', '좋았던 점']);
  const st = ss.insertSheet(TAB.settings);
  st.getRange(1, 1, 9, 3).setValues([
    ['항목', '값', '설명'],
    ['은행', '', '예: 농협'],
    ['계좌번호', '', '예: 351-0000-0000-00 (문자 ② 맨 앞 줄)'],
    ['예금주', '나우클린', '예: 홍길동(나우클린)'],
    ['당근후기링크', 'https://www.daangn.com/kr/local-profile/wkyp8ke12i96/', '후기쓰기 직행 링크로 바꾸기'],
    ['인스타후기링크', 'https://www.instagram.com/nowclean_930/', '후기 고정 게시물 링크로 바꾸기'],
    ['관리자PIN', String(Math.floor(1000 + Math.random() * 9000)), '관리자 화면 비밀번호 (숫자 4자리)'],
    ['알림메일', '', '비우면 이 구글 계정으로 요약 메일'],
    ['카카오맵링크', '', '비워두면 버튼 안 보임'],
  ]);
  [ss.getSheetByName(TAB.job), ss.getSheetByName(TAB.log), ss.getSheetByName(TAB.survey), st].forEach(s => s.setFrozenRows(1));
  props.setProperty('SHEET_ID', ss.getId());
  return ss.getId();
}

function sheet_(name) { return SpreadsheetApp.openById(sheetId_()).getSheetByName(name); }

function settings_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('settings');
  if (hit) return JSON.parse(hit);
  const out = {};
  sheet_(TAB.settings).getDataRange().getValues().slice(1).forEach(r => { if (r[0]) out[String(r[0]).trim()] = String(r[1]).trim(); });
  cache.put('settings', JSON.stringify(out), 60);
  return out;
}

function findJob_(token) {
  if (!token || !/^[a-z0-9]{6,12}$/.test(token)) return null;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('job_' + token);
  if (hit) { const j = JSON.parse(hit); j.created = new Date(j.created); return j; }
  const rows = sheet_(TAB.job).getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][3] === token) {
      const j = { name: rows[i][1], token, created: new Date(rows[i][0]) };
      cache.put('job_' + token, JSON.stringify(j), 21600);
      return j;
    }
  }
  return null;
}

function appendLog_(job, ev, step, device) {
  const now = new Date();
  sheet_(TAB.log).appendRow([now, job.name, job.token, ev, step, elapsed_(job.created, now), device]);
}

/* ---------- 도우미 ---------- */

function jobName_(d) {
  const w = ['일', '월', '화', '수', '목', '금', '토'][Number(Utilities.formatDate(d, 'Asia/Seoul', 'u')) % 7];
  const h = Number(Utilities.formatDate(d, 'Asia/Seoul', 'H'));
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return Utilities.formatDate(d, 'Asia/Seoul', 'M/d') + '(' + w + ') ' + ampm + ' ' + h12 + ':' + Utilities.formatDate(d, 'Asia/Seoul', 'mm');
}

function elapsed_(from, to) {
  const m = Math.max(0, Math.round((to - from) / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return (d ? d + '일 ' : '') + (h ? h + '시간 ' : '') + mm + '분';
}

function stageOf_(evs) {
  let last = '';
  STAGES.forEach(([key, label]) => {
    const hit = key === 'click' ? evs.some(e => String(e).indexOf('click_') === 0) : evs.includes(key);
    if (hit) last = label;
  });
  return last || '작업 생성';
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** 편집기에서 한 번 실행: 시트 만들기 + 권한 허용 + 하루 요약 예약 */
function setup() {
  sheetId_();
  ensureTrigger_();
  Logger.log('시트: ' + SpreadsheetApp.openById(sheetId_()).getUrl());
  Logger.log('관리자PIN은 시트 "설정" 탭에 있어요.');
}
