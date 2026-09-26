/**
 * 나우클린 리뷰 퍼널 — 서버 (Google Apps Script 웹앱)
 * 저장: 구글 시트(작업/기록/설문/설정/팀) · 메일: 이 계정 Gmail로 자기 자신에게
 * 화면(GitHub Pages)에서 GET/POST로 호출한다.
 *
 * 로그인: 팀 PIN(팀 탭) → 그 팀 작업만 / 관리자PIN(설정 탭) → 대표, 전체 팀
 * 시트 열 구성
 *   작업: 생성 시각 | 작업 이름 | 금액 | 토큰 | 상태 | 팀
 *   기록: 시각 | 작업 이름 | 토큰 | 이벤트 | 화면 | 청소 후 경과 | 기기 | 팀
 *   설문: 첫 제출 | 작업 이름 | 토큰 | 청소 종류 | 깨끗해진 곳 | 좋았던 점 | 팀 | 수정 횟수 | 마지막 수정   ← 링크 1개당 1줄
 *   팀:   팀 이름 | PIN | 메모
 */

const TAB = { job: '작업', log: '기록', survey: '설문', settings: '설정', team: '팀' };
const OWNER = '대표';

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
  survey_view: '설문 화면', survey_start: '설문 시작', survey_submit: '설문 제출', survey_update: '설문 수정',
  review_view: '후기 화면', click_daangn: '🥕 당근 클릭', click_insta: '📷 인스타 클릭',
  done: '다 했어요', survey_skip: '설문 건너뜀', back: '뒤로 가기', auto_thanks: '돌아와서 자동 감사',
  thanks_view: '감사 화면', leave: '나감', 'return': '돌아옴',
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

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  try {
    ensureTrigger_();
    migrate_();
    switch (body.action) {
      case 'log': return json_(logEvent_(body));
      case 'survey': return json_(saveSurvey_(body));
      case 'login': return json_(login_(body));
      case 'createJob': return json_(createJob_(body));
      case 'listJobs': return json_(listJobs_(body));
      case 'updateJob': return json_(updateJob_(body));
      case 'deleteJob': return json_(deleteJob_(body));
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

// 설문은 링크(작업) 1개당 1줄 — 같은 고객이 다시 제출하면 새 줄이 아니라 그 줄을 고친다
function saveSurvey_(b) {
  const job = findJob_(b.j);
  if (!job) return { ok: false, error: 'no job' };
  const a = b.answers || {};
  const join = v => (Array.isArray(v) ? v : [v]).filter(Boolean).map(String).join(', ').slice(0, 500);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(TAB.survey);
    const rows = sh.getDataRange().getValues();
    let row = 0;
    for (let i = rows.length - 1; i >= 1; i--) if (rows[i][2] === job.token) { row = i + 1; break; }
    const now = new Date();
    if (row) {
      const times = Number(rows[row - 1][7] || 0) + 1;
      sh.getRange(row, 4, 1, 6).setValues([[join(a.type), join(a.clean), join(a.good), job.team, times, now]]);
      appendLog_(job, 'survey_update', 'survey', String(b.device || '').slice(0, 40));
    } else {
      sh.appendRow([now, job.name, job.token, join(a.type), join(a.clean), join(a.good), job.team, 0, now]);
      appendLog_(job, 'survey_submit', 'survey', String(b.device || '').slice(0, 40));
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/* ---------- 관리자 쪽 ---------- */

// PIN → { role: 'owner'|'team', team }
function auth_(pin) {
  pin = String(pin || '').trim();
  if (!pin) throw new Error('PIN을 넣어주세요');
  const s = settings_();
  if (pin === String(s['관리자PIN'])) return { role: 'owner', team: OWNER };
  const t = teams_().find(x => x.pin === pin);
  if (t) return { role: 'team', team: t.name };
  throw new Error('PIN이 맞지 않아요');
}

function canTouch_(who, jobTeam) { return who.role === 'owner' || who.team === jobTeam; }

function login_(b) {
  const who = auth_(b.pin);
  const s = settings_();
  return {
    ok: true, role: who.role, team: who.team,
    teams: who.role === 'owner' ? teams_().map(t => t.name) : [],
    daangnUrl: s['당근후기링크'] || '',
    settings: { bank: s['은행'] || '', account: s['계좌번호'] || '', holder: s['예금주'] || '' },
  };
}

function createJob_(b) {
  const who = auth_(b.pin);
  const token = String(b.token || '');
  if (!/^[a-z0-9]{6,12}$/.test(token)) throw new Error('bad token');
  if (findJob_(token)) return { ok: true, dup: true, name: findJob_(token).name };
  let team = who.team;
  if (who.role === 'owner' && b.team && teams_().some(t => t.name === b.team)) team = b.team;   // 대표는 팀을 골라서 만들 수 있음
  const now = new Date();
  const name = team + ' · ' + jobName_(now);
  const amount = Number(b.amount) || '';
  sheet_(TAB.job).appendRow([now, name, amount, token, '', team]);
  CacheService.getScriptCache().remove('job_' + token);
  appendLog_({ name, token, created: now, team }, 'job_created', 'admin', '');
  return { ok: true, name, team };
}

function listJobs_(b) {
  const who = auth_(b.pin);
  const filterTeam = who.role === 'owner' ? (b.team || '') : who.team;
  const jobs = sheet_(TAB.job).getDataRange().getValues().slice(1)
    .filter(r => r[4] !== '삭제' && (!filterTeam || teamOf_(r[5]) === filterTeam))
    .slice(-40).reverse();
  const tokens = new Set(jobs.map(r => r[3]));
  const byToken = {};
  sheet_(TAB.log).getDataRange().getValues().slice(1).forEach(r => {
    if (tokens.has(r[2])) (byToken[r[2]] = byToken[r[2]] || []).push(r[3]);
  });
  const surveys = {};
  sheet_(TAB.survey).getDataRange().getValues().slice(1).forEach(r => {
    if (tokens.has(r[2])) surveys[r[2]] = { type: r[3], clean: r[4], good: r[5], edits: Number(r[7] || 0) };
  });
  const list = jobs.map(r => {
    const evs = byToken[r[3]] || [];
    return {
      name: r[1], amount: r[2], token: r[3], team: teamOf_(r[5]),
      stage: stageOf_(evs), opened: evs.includes('open'),
      clicks: { daangn: evs.includes('click_daangn'), insta: evs.includes('click_insta') },
      survey: surveys[r[3]] || null,
    };
  });
  const sum = { jobs: list.length, opened: 0, survey: 0, daangn: 0, insta: 0 };
  list.forEach(j => { if (j.opened) sum.opened++; if (j.survey) sum.survey++; if (j.clicks.daangn) sum.daangn++; if (j.clicks.insta) sum.insta++; });
  return { ok: true, jobs: list, sum, team: filterTeam || '전체' };
}

function jobRow_(token) {
  const rows = sheet_(TAB.job).getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (rows[i][3] === token) return { row: i + 1, team: teamOf_(rows[i][5]) };
  return null;
}

// 작업을 만든 뒤 금액을 고친 경우
function updateJob_(b) {
  const who = auth_(b.pin);
  const hit = jobRow_(String(b.token || ''));
  if (!hit || !canTouch_(who, hit.team)) return { ok: false, error: 'no job' };
  sheet_(TAB.job).getRange(hit.row, 3).setValue(Number(b.amount) || '');
  return { ok: true };
}

// 테스트·실수로 만든 작업 지우기 — 줄은 남기고 상태만 "삭제" (기록은 보존)
function deleteJob_(b) {
  const who = auth_(b.pin);
  const hit = jobRow_(String(b.token || ''));
  if (!hit || !canTouch_(who, hit.team)) return { ok: false, error: 'no job' };
  sheet_(TAB.job).getRange(hit.row, 5).setValue('삭제');
  return { ok: true };
}

/* ---------- 하루 요약 메일 (매일 21시, 팀별로 묶음) ---------- */

function dailyDigest() {
  const props = PropertiesService.getScriptProperties();
  const since = Number(props.getProperty('LAST_DIGEST') || 0);
  const now = Date.now();
  const jobRows = sheet_(TAB.job).getDataRange().getValues().slice(1);
  const deleted = new Set(jobRows.filter(r => r[4] === '삭제').map(r => r[3]));
  const teamByToken = {};
  jobRows.forEach(r => { teamByToken[r[3]] = teamOf_(r[5]); });
  const allLogs = sheet_(TAB.log).getDataRange().getValues().slice(1);
  const rows = allLogs.filter(r => new Date(r[0]).getTime() > since && !deleted.has(r[2]));
  props.setProperty('LAST_DIGEST', String(now));
  if (!rows.length) return;

  const count = (list, ev) => new Set(list.filter(r => String(r[3]).indexOf(ev) === 0).map(r => r[2])).size;
  const lines = [];
  lines.push('전체: 열람 ' + count(rows, 'open') + ' · 설문 ' + count(rows, 'survey_submit') + ' · 당근 클릭 ' + count(rows, 'click_daangn') + ' · 인스타 클릭 ' + count(rows, 'click_insta'));
  lines.push('');

  const byTeam = {};
  rows.forEach(r => { const t = teamByToken[r[2]] || '미지정'; (byTeam[t] = byTeam[t] || []).push(r); });
  Object.keys(byTeam).sort().forEach(team => {
    const tRows = byTeam[team];
    lines.push('━━ ' + team + ' — 열람 ' + count(tRows, 'open') + ' · 설문 ' + count(tRows, 'survey_submit') + ' · 당근 ' + count(tRows, 'click_daangn'));
    const groups = {};
    tRows.forEach(r => { (groups[r[1]] = groups[r[1]] || []).push(r); });
    Object.keys(groups).forEach(name => {
      const token = groups[name][0][2];
      const evs = allLogs.filter(r => r[2] === token).map(r => r[3]);
      lines.push('■ ' + name + ' — 지금까지: ' + stageOf_(evs));
      groups[name].forEach(r => {
        lines.push('   ' + Utilities.formatDate(new Date(r[0]), 'Asia/Seoul', 'HH:mm') + '  ' + (EVENT_LABEL[r[3]] || r[3]) +
                   (r[5] ? ' · 청소 후 ' + r[5] : ''));
      });
    });
    lines.push('');
  });
  lines.push('자세한 기록: ' + SpreadsheetApp.openById(sheetId_()).getUrl());

  const to = settings_()['알림메일'] || Session.getEffectiveUser().getEmail();
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d');
  MailApp.sendEmail(to, '[나우클린 리뷰퍼널] ' + today + ' 요약 — 열람 ' + count(rows, 'open') + ' · 설문 ' + count(rows, 'survey_submit') + ' · 당근 ' + count(rows, 'click_daangn'), lines.join('\n'));
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
  first.appendRow(['생성 시각', '작업 이름', '금액', '토큰', '상태', '팀']);
  ss.insertSheet(TAB.log).appendRow(['시각', '작업 이름', '토큰', '이벤트', '화면', '청소 후 경과', '기기', '팀']);
  ss.insertSheet(TAB.survey).appendRow(['첫 제출', '작업 이름', '토큰', '청소 종류', '깨끗해진 곳', '좋았던 점', '팀', '수정 횟수', '마지막 수정']);
  const st = ss.insertSheet(TAB.settings);
  st.getRange(1, 1, 9, 3).setValues([
    ['항목', '값', '설명'],
    ['은행', '', '예: 농협'],
    ['계좌번호', '', '예: 351-0000-0000-00 (문자 ② 맨 앞 줄)'],
    ['예금주', '나우클린', '예: 홍길동(나우클린)'],
    ['당근후기링크', 'https://www.daangn.com/kr/local-profile/wkyp8ke12i96/', '후기쓰기 직행 링크로 바꾸기'],
    ['인스타후기링크', 'https://www.instagram.com/p/DdqqWnkEyxt/', '후기 고정 게시물 링크'],
    ['관리자PIN', randomPin_([]), '대표용 — 모든 팀 작업을 봄 (숫자 4자리)'],
    ['알림메일', '', '비우면 이 구글 계정으로 요약 메일'],
    ['카카오맵링크', '', '비워두면 버튼 안 보임'],
  ]);
  [ss.getSheetByName(TAB.job), ss.getSheetByName(TAB.log), ss.getSheetByName(TAB.survey), st].forEach(s => s.setFrozenRows(1));
  props.setProperty('SHEET_ID', ss.getId());
  props.setProperty('SCHEMA', '0');
  return ss.getId();
}

// 예전 모양의 시트를 새 열 구성·팀 탭으로 맞춤 (한 번만)
function migrate_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA') === '2') return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (props.getProperty('SCHEMA') === '2') return;
    const ss = SpreadsheetApp.openById(sheetId_());
    ss.getSheetByName(TAB.job).getRange(1, 5, 1, 2).setValues([['상태', '팀']]);
    ss.getSheetByName(TAB.log).getRange(1, 8).setValue('팀');
    ss.getSheetByName(TAB.survey).getRange(1, 1).setValue('첫 제출');
    ss.getSheetByName(TAB.survey).getRange(1, 7, 1, 3).setValues([['팀', '수정 횟수', '마지막 수정']]);
    if (!ss.getSheetByName(TAB.team)) {
      const t = ss.insertSheet(TAB.team);
      const used = [String(settings_()['관리자PIN'])];
      const rows = [['팀 이름', 'PIN', '메모']];
      ['A팀', 'B팀', 'C팀'].forEach(name => { const p = randomPin_(used); used.push(p); rows.push([name, p, '']); });
      t.getRange(1, 1, rows.length, 3).setValues(rows);
      t.getRange(2, 2, rows.length - 1, 1).setNumberFormat('@');
      t.setFrozenRows(1);
      t.getRange(1, 5).setValue('팀을 늘리려면 아래 줄에 "팀 이름 | PIN(숫자 4자리, 서로 겹치지 않게)"만 추가하면 바로 적용돼요(1분 안).');
    }
    // 인스타 링크가 프로필 기본값이면 후기 게시물로
    const st = ss.getSheetByName(TAB.settings);
    st.getDataRange().getValues().forEach((r, i) => {
      if (r[0] === '인스타후기링크' && String(r[1]).indexOf('/p/') < 0) st.getRange(i + 1, 2).setValue('https://www.instagram.com/p/DdqqWnkEyxt/');
    });
    CacheService.getScriptCache().removeAll(['settings', 'teams']);
    props.setProperty('SCHEMA', '2');
  } finally {
    lock.releaseLock();
  }
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

function teams_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('teams');
  if (hit) return JSON.parse(hit);
  const sh = sheet_(TAB.team);
  const out = sh ? sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({ name: String(r[0]).trim(), pin: String(r[1]).trim() })) : [];
  cache.put('teams', JSON.stringify(out), 60);
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
      const j = { name: rows[i][1], token, created: new Date(rows[i][0]), team: teamOf_(rows[i][5]) };
      cache.put('job_' + token, JSON.stringify(j), 21600);
      return j;
    }
  }
  return null;
}

function appendLog_(job, ev, step, device) {
  const now = new Date();
  sheet_(TAB.log).appendRow([now, job.name, job.token, ev, step, elapsed_(job.created, now), device, job.team || '']);
}

/* ---------- 도우미 ---------- */

function teamOf_(v) { return String(v || '').trim() || '미지정'; }

function randomPin_(used) {
  let p;
  do { p = String(Math.floor(1000 + Math.random() * 9000)); } while (used.indexOf(p) >= 0);
  return p;
}

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
  migrate_();
  ensureTrigger_();
  Logger.log('시트: ' + SpreadsheetApp.openById(sheetId_()).getUrl());
  Logger.log('대표 PIN은 "설정" 탭, 팀별 PIN은 "팀" 탭에 있어요.');
}
