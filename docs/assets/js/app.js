// 고객 링크: config/flow.json 순서대로 단계 파일(steps/*.js)을 불러와 보여준다.
import { get, loadJson } from './core/api.js';
import { log } from './core/log.js';

const j = new URLSearchParams(location.search).get('j') || '';
const root = document.getElementById('app');
const storeKey = 'nc_' + j;
const read = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch (e) { return {}; } };
const write = s => { try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch (e) {} };

async function main() {
  if (!/^[a-z0-9]{6,12}$/.test(j)) { root.innerHTML = '<section><h1>링크가 올바르지 않아요</h1><p class="sub">문자로 받으신 링크를 다시 눌러주세요.</p></section>'; return; }
  const flow = (await loadJson('flow.json')).afterCleaning;
  let job = null;
  try { const r = await get({ action: 'job', j }); if (r.ok) job = r; } catch (e) {}

  const state = read();
  log(j, state.opened ? 'reopen' : 'open', flow[state.step || 0]);
  state.opened = true; write(state);

  let current = flow[state.step || 0];
  document.addEventListener('visibilitychange', () => log(j, document.hidden ? 'leave' : 'return', current));

  const show = async i => {
    const idx = Math.min(i, flow.length - 1);
    current = flow[idx];
    state.step = idx; write(state);
    const mod = await import(`./steps/${current}.js`);
    const ctx = { j, job, state, save: patch => { Object.assign(state, patch); write(state); }, next: () => show(idx + 1) };
    const el = await mod.render(ctx);
    root.replaceChildren(el);
    document.getElementById('progress').textContent = `${idx + 1} / ${flow.length}`;
    window.scrollTo(0, 0);
  };
  show(state.step || 0);
}
main();
