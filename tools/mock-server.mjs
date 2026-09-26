// 로컬 테스트용: docs/ 화면 + 가짜 Apps Script(/api)를 한 서버에서 띄운다.
// 실행: node tools/mock-server.mjs  →  http://localhost:4610/admin/  (PIN 1234)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const PORT = 4610;
const jobs = [], logs = [], surveys = [];
const settings = { bank: '농협', account: '351-0000-0000-00', holder: '테스트(나우클린)' };
const links = { daangn: 'https://www.daangn.com/kr/local-profile/wkyp8ke12i96/', insta: 'https://www.instagram.com/nowclean_930/', kakao: '', naver: '' };
const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function api(body) {
  const job = jobs.find(j => j.token === body.j);
  switch (body.action) {
    case 'login': return body.pin === '1234' ? { ok: true, settings } : { ok: false, error: 'PIN이 맞지 않아요' };
    case 'createJob': jobs.push({ token: body.token, name: new Date().toLocaleString('ko-KR'), amount: body.amount }); logs.push([body.token, 'job_created']); return { ok: true, name: jobs.at(-1).name };
    case 'listJobs': return { ok: true, jobs: jobs.slice().reverse().map(j => { const ev = logs.filter(l => l[0] === j.token).map(l => l[1]); return { ...j, stage: ev.at(-1), clicks: { daangn: ev.includes('click_daangn'), insta: ev.includes('click_insta') } }; }) };
    case 'log': if (!job) return { ok: false }; logs.push([body.j, body.ev]); console.log('LOG', body.ev, body.step, body.device); return { ok: true };
    case 'survey': if (!job) return { ok: false }; surveys.push(body.answers); logs.push([body.j, 'survey_submit']); console.log('SURVEY', JSON.stringify(body.answers)); return { ok: true };
  }
  return { ok: false };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api') {
    if (req.method === 'GET') {
      const job = jobs.find(j => j.token === url.searchParams.get('j'));
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(job ? { ok: true, name: job.name, links } : { ok: false }));
    }
    let data = ''; req.on('data', c => data += c);
    return req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(api(JSON.parse(data || '{}')))); });
  }
  if (url.pathname === '/config/app.json') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ apiUrl: `http://localhost:${PORT}/api`, siteBase: `http://localhost:${PORT}/` }));
  }
  let p = path.join(root, decodeURIComponent(url.pathname));
  if (p.endsWith(path.sep) || url.pathname.endsWith('/')) p = path.join(p, 'index.html');
  fs.readFile(p, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('content-type', type[path.extname(p)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(PORT, () => console.log('mock on http://localhost:' + PORT));
