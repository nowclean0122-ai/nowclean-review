// v2 고객 링크: 화면 단계는 v1과 같은 파일(assets/js/steps)을 쓰고, 기록만 구글 설문지로 보낸다.
// 링크: a/?j=작업토큰&t=만든시각(36진수) — 만든 뒤 linkDays(기본 1일) 지나면 마감 화면
import { loadJson } from '../../assets/js/core/api.js';
import { submit, device, config } from './store.js';

const params = new URLSearchParams(location.search);
const j = params.get('j') || '';
const created = parseInt(params.get('t') || '', 36) || 0;
const preview = params.get('preview') === '1';   // 관리자 미리보기: 기록 안 남김
const root = document.getElementById('app');
const storeKey = 'nc2_' + j;
const read = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch (e) { return {}; } };
const write = s => { try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch (e) {} };

if (params.get('reset') || preview) {
  try { localStorage.removeItem(storeKey); } catch (e) {}
  params.delete('reset');
  history.replaceState(null, '', location.pathname + '?' + params);
}

const log = (ev, step) => { if (!preview) submit({ 종류: '기록', 토큰: j, 이벤트: ev, 화면: step || '', 기기: device() }); };
const saveSurvey = a => {
  if (preview) return;
  const join = v => [].concat(v || []).join(', ');
  submit({ 종류: '설문', 토큰: j, 청소종류: join(a.type), 깨끗해진곳: join(a.clean), 좋았던점: join(a.good), 기기: device() });
};

async function main() {
  if (!/^[a-z0-9]{6,12}$/.test(j)) { root.innerHTML = '<section><h1>링크가 올바르지 않아요</h1><p class="sub">문자로 받으신 링크를 다시 눌러주세요.</p></section>'; return; }
  const cfg = await config();
  if (created && Date.now() - created > (Number(cfg.linkDays) || 1) * 86400000) {
    root.innerHTML = '<section class="thanks"><h1>이 링크는 마감됐어요</h1><p class="thanks-body">이용해 주셔서 감사합니다 🙏<br>문의는 나우클린<br><b>010-3674-5156</b></p></section>';
    return;
  }
  const flow = (await loadJson('flow.json')).afterCleaning;
  const jobPromise = Promise.resolve({ links: cfg.links || {} });   // 후기 버튼 주소: v2 설정 → 없으면 platforms.json 기본값

  const state = read();
  log(state.opened ? 'reopen' : 'open', flow[state.step || 0]);
  state.opened = true; write(state);

  let current = flow[state.step || 0];
  document.addEventListener('visibilitychange', () => log(document.hidden ? 'leave' : 'return', current));

  const show = async i => {
    const idx = Math.max(0, Math.min(i, flow.length - 1));
    current = flow[idx];
    state.step = idx; write(state);
    const mod = await import(`../../assets/js/steps/${current}.js`);
    const ctx = {
      j, jobPromise, state, log, saveSurvey,
      save: patch => { Object.assign(state, patch); write(state); },
      next: () => show(idx + 1),
      back: () => { log('back', current); show(idx - 1); },
    };
    root.replaceChildren(await mod.render(ctx));
    document.getElementById('progress').textContent = `${idx + 1} / ${flow.length}`;
    window.scrollTo(0, 0);
  };
  show(state.step || 0);
}
main();
