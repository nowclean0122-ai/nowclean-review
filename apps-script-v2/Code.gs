/**
 * 나우클린 리뷰 퍼널 v2 — 웹앱 없음 (구글 차단 재발 방지 구조)
 *
 * v1은 "로그인 없이 누구나 여는 Apps Script 웹앱 + PIN 입력 화면"이라 구글 자동 탐지에 걸렸다(2026-09-26).
 * v2는 외부에 열린 스크립트 주소가 하나도 없다:
 *   - 고객·관리자 화면(GitHub Pages) → 구글 "설문지(Forms)"에 제출  ← 누구나 답하는 용도의 구글 공식 기능
 *   - 이 스크립트는 설문지 제출 트리거(onSubmitV2)와 매일 요약(dailyDigestV2)으로만 돈다
 *   - 화면이 읽는 목록은 시트 "공개" 탭 하나만 "웹에 게시(CSV)" — 고객 연락처·계좌 같은 건 없음
 *
 * 시트 "나우클린 리뷰퍼널 DB v2"
 *   원본: 설문지 응답 그대로 (자동)
 *   작업: 생성 시각 | 작업 이름 | 금액 | 토큰 | 상태 | 담당 직원
 *   기록: 시각 | 작업 이름 | 토큰 | 이벤트 | 화면 | 청소 후 경과 | 기기 | 담당 직원
 *   설문: 첫 제출 | 작업 이름 | 토큰 | 청소 종류 | 깨끗해진 곳 | 좋았던 점 | 담당 직원 | 수정 횟수 | 마지막 수정   (링크 1개당 1줄)
 *   직원: 이름 | 상태(사용/숨김) | 메모
 *   공개: 화면용 목록 (웹에 게시)
 *   설정: 항목 | 값 | 설명
 */

const FIELDS = ['종류', '토큰', '이벤트', '화면', '기기', '작업이름', '담당직원', '금액', '청소종류', '깨끗해진곳', '좋았던점', '키'];
const TAB = { raw: '원본', job: '작업', log: '기록', survey: '설문', staff: '직원', pub: '공개', settings: '설정' };
const ADMIN_KINDS = ['작업', '수정', '삭제', '직원'];
const STAGES = [
  ['job_created', '작업 생성'], ['open', '링크 열람'], ['survey_start', '설문 시작'], ['survey_submit', '설문 제출'],
  ['review_view', '후기 화면'], ['click', '후기 버튼 클릭'], ['thanks_view', '감사 화면'],
];
const EVENT_LABEL = {
  job_created: '작업 생성', open: '링크 열람', reopen: '다시 열람', survey_view: '설문 화면', survey_start: '설문 시작',
  survey_submit: '설문 제출', survey_update: '설문 수정', survey_skip: '설문 건너뜀', review_view: '후기 화면',
  click_daangn: '🥕 당근 클릭', click_kakao: '💬 카카오 클릭', click_insta: '📷 인스타 클릭', done: '다 했어요',
  auto_thanks: '돌아와서 자동 감사', back: '뒤로 가기', thanks_view: '감사 화면', leave: '나감', 'return': '돌아옴',
};

/* ---------- 처음 한 번: 편집기에서 ▶ 실행 ---------- */

function setupV2() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) { Logger.log('이미 만들어져 있어요. 설정값:\n' + props.getProperty('CONFIG')); return; }

  const ss = SpreadsheetApp.create('나우클린 리뷰퍼널 DB v2');
  const first = ss.getSheets()[0];
  first.setName(TAB.job).appendRow(['생성 시각', '작업 이름', '금액', '토큰', '상태', '담당 직원']);
  ss.insertSheet(TAB.log).appendRow(['시각', '작업 이름', '토큰', '이벤트', '화면', '청소 후 경과', '기기', '담당 직원']);
  ss.insertSheet(TAB.survey).appendRow(['첫 제출', '작업 이름', '토큰', '청소 종류', '깨끗해진 곳', '좋았던 점', '담당 직원', '수정 횟수', '마지막 수정']);
  const sf = ss.insertSheet(TAB.staff);
  const names = ['김수영', '김수현', '정수현', '박수현', '이수현', '김팀장', '김대리'];   // 예시 명단 (사용자 요청) — 실제 직원으로 바꾸기
  sf.getRange(1, 1, names.length + 1, 3).setValues([['이름', '상태', '메모']].concat(names.map(n => [n, '사용', '예시'])));
  sf.getRange('B2:B500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['사용', '숨김'], true).build());
  sf.getRange(1, 5).setValue('안 보이게 하려면 상태를 "숨김" (지우지 말기). 관리자 화면 "＋ 이름 추가"로 넣은 이름도 여기에 생겨요.');
  ss.insertSheet(TAB.pub);
  const st = ss.insertSheet(TAB.settings);
  st.getRange(1, 1, 3, 3).setValues([
    ['항목', '값', '설명'],
    ['알림메일', '', '비우면 이 구글 계정으로 매일 21시 요약'],
    ['비고', '계좌·후기 링크·PIN·링크유효일은 GitHub 설정 파일(docs/v2/config.json)에 있어요', ''],
  ]);
  [TAB.job, TAB.log, TAB.survey, TAB.staff, TAB.settings].forEach(n => ss.getSheetByName(n).setFrozenRows(1));

  const key = Utilities.getUuid().slice(0, 8);
  const form = FormApp.create('나우클린 리뷰 기록 (자동 전송용 — 직접 답하지 마세요)');
  form.setDescription('나우클린 리뷰 화면이 자동으로 보내는 기록입니다. 개인정보를 받지 않아요.')
    .setCollectEmail(false).setLimitOneResponsePerUser(false).setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false).setPublishingSummary(false).setProgressBar(false);
  FIELDS.forEach(t => form.addTextItem().setTitle(t));
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  const rawSheet = ss.getSheets().find(s => s.getFormUrl && s.getFormUrl());
  if (rawSheet) rawSheet.setName(TAB.raw);

  // 설문지 칸 번호(entry.xxxx) 알아내기 — 미리 채운 주소에서 뽑는다
  const resp = form.createResponse();
  form.getItems().forEach((it, i) => resp.withItemResponse(it.asTextItem().createResponse('v' + i)));
  const pre = resp.toPrefilledUrl();
  const entries = {};
  FIELDS.forEach((t, i) => { const m = pre.match(new RegExp('entry\\.(\\d+)=v' + i + '(&|$)')); if (m) entries[t] = 'entry.' + m[1]; });

  const config = {
    formAction: form.getPublishedUrl().replace(/\/viewform.*$/, '/formResponse'),
    entries, key,
    sheetUrl: ss.getUrl(),
    publicGid: ss.getSheetByName(TAB.pub).getSheetId(),
  };
  props.setProperties({ SHEET_ID: ss.getId(), FORM_ID: form.getId(), KEY: key, CONFIG: JSON.stringify(config, null, 2) });

  ScriptApp.newTrigger('onSubmitV2').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('dailyDigestV2').timeBased().atHour(21).everyDays(1).inTimezone('Asia/Seoul').create();
  rebuildPublic_();

  Logger.log('✅ 완료. 아래 설정값을 Claude에게 전달하세요(실행 로그 전체 복사):\n' + JSON.stringify(config, null, 2));
  Logger.log('다음 단계: 시트 열기 → 파일 → 공유 → 웹에 게시 → "공개" 탭 · 쉼표로 구분된 값(.csv) → 게시 → 나온 주소도 Claude에게');
}

/** 설정값 다시 보기 */
function showConfig() { Logger.log(PropertiesService.getScriptProperties().getProperty('CONFIG')); }

/* ---------- 설문지 제출될 때마다 (트리거) ---------- */

function onSubmitV2(e) {
  const v = {};
  e.response.getItemResponses().forEach(r => { v[r.getItem().getTitle()] = String(r.getResponse() || '').trim(); });
  const kind = v['종류'];
  const token = v['토큰'];
  if (!/^[a-z0-9]{6,12}$/.test(token)) return;
  if (ADMIN_KINDS.indexOf(kind) >= 0 && v['키'] !== PropertiesService.getScriptProperties().getProperty('KEY')) return;   // 관리자 동작은 키가 맞아야

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (kind === '작업') createJob_(token, v);
    else if (kind === '수정') updateJob_(token, v);
    else if (kind === '삭제') { const hit = jobRow_(token); if (hit) sheet_(TAB.job).getRange(hit.row, 5).setValue('삭제'); }
    else if (kind === '직원') addStaff_(v['담당직원']);
    else if (kind === '기록') logEvent_(token, v);
    else if (kind === '설문') saveSurvey_(token, v);
    else return;
    rebuildPublic_();
  } finally {
    lock.releaseLock();
  }
}

function createJob_(token, v) {
  if (jobRow_(token)) return;
  const now = new Date();
  const staff = v['담당직원'].slice(0, 80);
  const name = (v['작업이름'] || ((staff ? staff + ' · ' : '') + jobName_(now))).slice(0, 100);
  sheet_(TAB.job).appendRow([now, name, Number(v['금액']) || '', token, '', staff]);
  appendLog_({ name, token, created: now, staff }, 'job_created', 'admin', '');
}

function updateJob_(token, v) {
  const hit = jobRow_(token);
  if (!hit) return;
  const sh = sheet_(TAB.job);
  if (v['금액'] !== '') sh.getRange(hit.row, 3).setValue(Number(v['금액']) || '');
  if (v['이벤트'] === 'staff') {
    const staff = v['담당직원'].slice(0, 80);
    const created = new Date(sh.getRange(hit.row, 1).getValue());
    sh.getRange(hit.row, 2).setValue((staff ? staff + ' · ' : '') + jobName_(created));
    sh.getRange(hit.row, 6).setValue(staff);
  }
}

function addStaff_(name) {
  name = String(name || '').trim().slice(0, 20);
  if (!name) return;
  const sh = sheet_(TAB.staff);
  const rows = sh.getDataRange().getValues();
  const i = rows.findIndex((r, k) => k > 0 && String(r[0]).trim() === name);
  if (i > 0) sh.getRange(i + 1, 2).setValue('사용');
  else sh.appendRow([name, '사용', '']);
}

function logEvent_(token, v) {
  const job = findJob_(token);
  if (!job || job.status === '삭제') return;
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('n_' + token) || 0);
  if (n > 80) return;
  cache.put('n_' + token, String(n + 1), 21600);
  appendLog_(job, v['이벤트'].slice(0, 30), v['화면'].slice(0, 30), v['기기'].slice(0, 40));
}

function saveSurvey_(token, v) {
  const job = findJob_(token);
  if (!job || job.status === '삭제') return;
  const sh = sheet_(TAB.survey);
  const rows = sh.getDataRange().getValues();
  const row = rows.findIndex((r, k) => k > 0 && r[2] === token) + 1;
  const now = new Date();
  const vals = [v['청소종류'].slice(0, 50), v['깨끗해진곳'].slice(0, 500), v['좋았던점'].slice(0, 500)];
  if (row > 0) {
    const times = Number(rows[row - 1][7] || 0) + 1;
    sh.getRange(row, 4, 1, 6).setValues([vals.concat([job.staff, times, now])]);
    appendLog_(job, 'survey_update', 'survey', v['기기']);
  } else {
    sh.appendRow([now, job.name, token].concat(vals, [job.staff, 0, now]));
    appendLog_(job, 'survey_submit', 'survey', v['기기']);
  }
}

/* ---------- 화면용 목록 (공개 탭, 웹에 게시) ---------- */

function rebuildPublic_() {
  const out = [['구분', '이름', '토큰', '금액', '단계', '클릭', '청소종류', '깨끗해진곳', '좋았던점', '수정횟수', '생성ms', '담당직원']];
  sheet_(TAB.staff).getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() && String(r[1]).trim() !== '숨김')
    .forEach(r => out.push(['직원', String(r[0]).trim(), '', '', '', '', '', '', '', '', '', '']));
  const jobs = sheet_(TAB.job).getDataRange().getValues().slice(1).filter(r => r[4] !== '삭제').slice(-60);
  const tokens = new Set(jobs.map(r => r[3]));
  const evs = {}, sv = {};
  sheet_(TAB.log).getDataRange().getValues().slice(1).forEach(r => { if (tokens.has(r[2])) (evs[r[2]] = evs[r[2]] || []).push(r[3]); });
  sheet_(TAB.survey).getDataRange().getValues().slice(1).forEach(r => { if (tokens.has(r[2])) sv[r[2]] = r; });
  jobs.forEach(r => {
    const e = evs[r[3]] || [], s = sv[r[3]];
    const clicks = ['daangn', 'kakao', 'insta'].filter(k => e.indexOf('click_' + k) >= 0).join(',');
    out.push(['작업', r[1], r[3], r[2], stageOf_(e), clicks, s ? s[3] : '', s ? s[4] : '', s ? s[5] : '', s ? s[7] : '', new Date(r[0]).getTime(), r[5]]);
  });
  const sh = sheet_(TAB.pub);
  sh.clearContents();
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
}

/* ---------- 매일 21시 요약 메일 ---------- */

function dailyDigestV2() {
  const props = PropertiesService.getScriptProperties();
  const since = Number(props.getProperty('LAST_DIGEST') || 0);
  props.setProperty('LAST_DIGEST', String(Date.now()));
  const jobRows = sheet_(TAB.job).getDataRange().getValues().slice(1);
  const deleted = new Set(jobRows.filter(r => r[4] === '삭제').map(r => r[3]));
  const all = sheet_(TAB.log).getDataRange().getValues().slice(1);
  const rows = all.filter(r => new Date(r[0]).getTime() > since && !deleted.has(r[2]));
  if (!rows.length) return;
  const count = ev => new Set(rows.filter(r => String(r[3]).indexOf(ev) === 0).map(r => r[2])).size;
  const lines = ['열람 ' + count('open') + ' · 설문 ' + count('survey_submit') + ' · 당근 ' + count('click_daangn') + ' · 카카오 ' + count('click_kakao') + ' · 인스타 ' + count('click_insta'), ''];
  const groups = {};
  rows.forEach(r => { (groups[r[1]] = groups[r[1]] || []).push(r); });
  Object.keys(groups).forEach(name => {
    const token = groups[name][0][2];
    lines.push('■ ' + name + ' — 지금까지: ' + stageOf_(all.filter(r => r[2] === token).map(r => r[3])));
    groups[name].forEach(r => lines.push('   ' + Utilities.formatDate(new Date(r[0]), 'Asia/Seoul', 'HH:mm') + '  ' + (EVENT_LABEL[r[3]] || r[3]) + (r[5] ? ' · 청소 후 ' + r[5] : '')));
    lines.push('');
  });
  lines.push('자세한 기록: ' + SpreadsheetApp.openById(sheetId_()).getUrl());
  const to = settingsMail_() || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(to, '[나우클린 리뷰] ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d') + ' 요약 — 열람 ' + count('open') + ' · 설문 ' + count('survey_submit') + ' · 당근 ' + count('click_daangn'), lines.join('\n'));
}

/* ---------- 도우미 ---------- */

function sheetId_() { return PropertiesService.getScriptProperties().getProperty('SHEET_ID'); }
function sheet_(name) { return SpreadsheetApp.openById(sheetId_()).getSheetByName(name); }
function settingsMail_() {
  const r = sheet_(TAB.settings).getDataRange().getValues().find(x => x[0] === '알림메일');
  return r ? String(r[1]).trim() : '';
}
function jobRow_(token) {
  const rows = sheet_(TAB.job).getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (rows[i][3] === token) return { row: i + 1, r: rows[i] };
  return null;
}
function findJob_(token) {
  const hit = jobRow_(token);
  return hit ? { name: hit.r[1], token, created: new Date(hit.r[0]), status: String(hit.r[4] || ''), staff: String(hit.r[5] || '') } : null;
}
function appendLog_(job, ev, step, device) {
  const now = new Date();
  sheet_(TAB.log).appendRow([now, job.name, job.token, ev, step, elapsed_(job.created, now), device, job.staff || '']);
}
function jobName_(d) {
  const w = ['일', '월', '화', '수', '목', '금', '토'][Number(Utilities.formatDate(d, 'Asia/Seoul', 'u')) % 7];
  const h = Number(Utilities.formatDate(d, 'Asia/Seoul', 'H'));
  return Utilities.formatDate(d, 'Asia/Seoul', 'M/d') + '(' + w + ') ' + (h < 12 ? '오전' : '오후') + ' ' + (h % 12 || 12) + ':' + Utilities.formatDate(d, 'Asia/Seoul', 'mm');
}
function elapsed_(from, to) {
  const m = Math.max(0, Math.round((to - from) / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return (d ? d + '일 ' : '') + (h ? h + '시간 ' : '') + mm + '분';
}
function stageOf_(evs) {
  let last = '';
  STAGES.forEach(([k, label]) => { if (k === 'click' ? evs.some(e => String(e).indexOf('click_') === 0) : evs.indexOf(k) >= 0) last = label; });
  return last || '작업 생성';
}
