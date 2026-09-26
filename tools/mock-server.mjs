// 로컬 테스트용: docs/ 화면 + 가짜 Apps Script(/api)를 한 서버에서 띄운다.
// 실행: node tools/mock-server.mjs  →  http://localhost:4610/admin/  (PIN 1234, 직원 김주현·박수현)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const PORT = 4610;
const jobs = [], logs = [], surveys = {};
const staff = ['김주현', '박수현'];
const settings = { bank: '농협', account: '351-0000-0000-00', holder: '테스트(나우클린)' };
// 서버 링크를 일부러 비워서 platforms.json 기본값이 쓰이는지 확인
const links = { daangn: '', insta: '', kakao: '', naver: '' };
const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function api(body) {
  const job = jobs.find(j => j.token === body.j && !j.deleted);
  const okPin = body.pin === '1234';
  switch (body.action) {
    case 'login': return okPin ? { ok: true, staff, daangnUrl: 'https://www.daangn.com/', settings } : { ok: false, error: 'PIN이 맞지 않아요' };
    case 'addStaff': if (!staff.includes(body.name)) staff.push(body.name); return { ok: true, staff };
    case 'createJob': {
      const who = (body.staff || []).join('·');
      jobs.push({ token: body.token, staff: who, name: (who ? who + ' · ' : '') + new Date().toLocaleTimeString('ko-KR'), amount: body.amount });
      logs.push([body.token, 'job_created']);
      return { ok: true, name: jobs.at(-1).name };
    }
    case 'updateJob': { const x = jobs.find(j => j.token === body.token); if (x) x.amount = body.amount; return { ok: !!x }; }
    case 'deleteJob': { const x = jobs.find(j => j.token === body.token); if (x) x.deleted = true; return { ok: !!x }; }
    case 'listJobs': {
      const list = jobs.filter(j => !j.deleted && (!body.staff || j.staff.split('·').includes(body.staff))).slice().reverse().map(j => {
        const ev = logs.filter(l => l[0] === j.token).map(l => l[1]);
        return { ...j, stage: ev.at(-1), opened: ev.includes('open'), clicks: { daangn: ev.includes('click_daangn'), insta: ev.includes('click_insta'), kakao: ev.includes('click_kakao') }, survey: surveys[j.token] || null };
      });
      return { ok: true, jobs: list, who: body.staff || '전체', staff, sum: { jobs: list.length, opened: list.filter(x => x.opened).length, survey: list.filter(x => x.survey).length, daangn: list.filter(x => x.clicks.daangn).length, insta: list.filter(x => x.clicks.insta).length } };
    }
    case 'log': if (!job) return { ok: false }; logs.push([body.j, body.ev]); console.log('LOG', body.ev, body.step, body.device); return { ok: true };
    case 'survey': {
      if (!job) return { ok: false };
      const prev = surveys[body.j]; const a = body.answers;
      surveys[body.j] = { type: a.type, clean: (a.clean || []).join(', '), good: (a.good || []).join(', '), edits: prev ? prev.edits + 1 : 0 };
      logs.push([body.j, prev ? 'survey_update' : 'survey_submit']);
      return { ok: true };
    }
  }
  return { ok: false };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api') {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const t = url.searchParams.get('j');
      const job = jobs.find(j => j.token === t);
      return res.end(JSON.stringify(!job ? { ok: false, error: 'no job' } : job.deleted ? { ok: false, error: 'closed' } : { ok: true, name: job.name, links }));
    }
    let data = ''; req.on('data', c => data += c);
    return req.on('end', () => res.end(JSON.stringify(api(JSON.parse(data || '{}')))));
  }
  if (url.pathname === '/config/app.json') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ apiUrl: `http://localhost:${PORT}/api`, siteBase: `http://localhost:${PORT}/` }));
  }
  let p = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith('/')) p = path.join(p, 'index.html');
  fs.readFile(p, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('content-type', type[path.extname(p)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(PORT, () => console.log('mock on http://localhost:' + PORT));
