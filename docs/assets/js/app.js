// 고객 링크: config/flow.json 순서대로 단계 파일(steps/*.js)을 불러와 보여준다.
import { get, loadJson } from './core/api.js';
import { log } from './core/log.js';

const params = new URLSearchParams(location.search);
const j = params.get('j') || '';
const root = document.getElementById('app');
const storeKey = 'nc_' + j;
const read = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch (e) { return {}; } };
const write = s => { try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch (e) {} };

// 테스트용: 주소 끝에 &reset=1 → 이 폰에 저장된 진행 상태를 지우고 처음부터
if (params.get('reset') || params.get('preview')) {
  try { localStorage.removeItem(storeKey); } catch (e) {}
  params.delete('reset');
  if (params.get('preview')) document.title = '미리보기 · ' + document.title;
  history.replaceState(null, '', location.pathname + '?' + params);
}

async function main() {
  if (!/^[a-z0-9]{6,12}$/.test(j)) { root.innerHTML = '<section><h1>링크가 올바르지 않아요</h1><p class="sub">문자로 받으신 링크를 다시 눌러주세요.</p></section>'; return; }
  const flow = (await loadJson('flow.json')).afterCleaning;
  // 서버(구글)가 처음엔 몇 초 걸려서 기다리지 않고 뒤에서 받아둔다 — 후기 버튼 화면에서만 필요
  const jobPromise = get({ action: 'job', j }).then(r => (r.ok ? r : null)).catch(() => null);

  const state = read();
  log(j, state.opened ? 'reopen' : 'open', flow[state.step || 0]);
  state.opened = true; write(state);

  let current = flow[state.step || 0];
  document.addEventListener('visibilitychange', () => log(j, document.hidden ? 'leave' : 'return', current));

  const show = async i => {
    const idx = Math.max(0, Math.min(i, flow.length - 1));
    current = flow[idx];
    state.step = idx; write(state);
    const mod = await import(`./steps/${current}.js`);
    const ctx = {
      j, jobPromise, state,
      save: patch => { Object.assign(state, patch); write(state); },
      next: () => show(idx + 1),
      back: () => { log(j, 'back', current); show(idx - 1); },
      isFirst: idx === 0,
    };
    const el = await mod.render(ctx);
    root.replaceChildren(el);
    document.getElementById('progress').textContent = `${idx + 1} / ${flow.length}`;
    window.scrollTo(0, 0);
  };
  show(state.step || 0);
}
main();
