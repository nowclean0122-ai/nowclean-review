// 2단계: 후기 남기기
// 버튼 링크 = platforms.json 기본값 → 시트 설정 탭 값이 있으면 그걸로 덮어씀 (서버가 늦거나 실패해도 버튼은 항상 보임)
// 버튼을 눌러 당근·카카오·인스타로 갔다가 돌아오면 자동으로 감사 화면으로 넘어간다.
import { h } from '../core/dom.js';
import { loadJson } from '../core/api.js';
import { log } from '../core/log.js';

export async function render(ctx) {
  const L = ctx.log || ((ev, step) => log(ctx.j, ev, step));
  const cfgP = await loadJson('platforms.json');
  const platforms = Array.isArray(cfgP) ? cfgP : cfgP.buttons;
  const job = await Promise.race([ctx.jobPromise, new Promise(r => setTimeout(() => r(null), 2500))]);
  const server = job?.links || {};
  const linkOf = p => server[p.key] || p.url || '';

  let clicked = false, leftAt = 0, moved = false;
  const visited = new Set();       // 누르고 다녀온 버튼
  let lastKey = '';
  const goNext = ev => {
    if (moved) return;
    moved = true;
    document.removeEventListener('visibilitychange', onVisible);
    L(ev, 'review-links');
    ctx.next();
  };
  const onVisible = () => {
    if (document.hidden) { if (clicked) leftAt = Date.now(); return; }
    if (!(clicked && leftAt && Date.now() - leftAt > 2000)) return;   // 2초 넘게 다녀왔으면 하고 온 것으로 봄
    visited.add(lastKey);
    const el = document.querySelector('[data-key="' + lastKey + '"]');
    if (el && !el.textContent.startsWith('✔')) el.textContent = '✔ ' + el.textContent;
    // 같은 줄(당근 후기 + 단골)에 아직 안 한 게 있으면 기다림 → 둘 다 하면 감사 화면
    const p = platforms.find(x => x.key === lastKey);
    const pending = p && p.row ? platforms.filter(x => x.row === p.row && x.enabled && !visited.has(x.key)) : [];
    clicked = false; leftAt = 0;
    if (!pending.length) goNext('auto_thanks');
  };
  document.addEventListener('visibilitychange', onVisible);

  // 누를 수 있는 버튼: row가 같으면 한 줄에 2열로 / 준비 중: 맨 아래 회색 2열
  const live = platforms.filter(p => p.placement !== 'thanks' && p.enabled && linkOf(p));
  const soon = platforms.filter(p => p.showSoon && !(p.enabled && linkOf(p)));
  const mk = p => {
    const a = h('a', { class: 'btn big ' + p.style, href: linkOf(p), target: '_blank', rel: 'noopener', 'data-key': p.key }, p.label);
    a.addEventListener('click', () => { clicked = true; lastKey = p.key; L('click_' + p.key, 'review-links'); });
    return a;
  };
  const buttons = [];
  const usedRows = new Set();
  live.forEach(p => {
    if (p.row) {
      if (usedRows.has(p.row)) return;
      usedRows.add(p.row);
      buttons.push(h('div', { class: 'row2' }, live.filter(x => x.row === p.row).map(mk)));
    } else {
      buttons.push(h('div', {}, mk(p), p.note ? h('p', { class: 'sub note' }, p.note) : null));
    }
  });
  if (soon.length) buttons.push(h('div', { class: 'row2' }, soon.map(p => h('div', { class: 'btn soon' }, p.label, h('br'), h('small', {}, '준비 중')))));

  const back = h('button', { class: 'link', type: 'button' }, '← 설문으로');
  back.addEventListener('click', () => { moved = true; document.removeEventListener('visibilitychange', onVisible); ctx.back(); });

  const done = h('button', { class: 'btn', type: 'button' }, '다 했어요 →');
  done.addEventListener('click', () => goNext('done'));

  L('review_view', 'review-links');
  return h('section', {},
    back,
    h('h1', {}, '짧은 후기 부탁드려요 🙏'),
    h('p', { class: 'sub' }, '한두 줄이면 충분해요. 저장해 두신 사진도 같이 올려주시면 더 좋아요.'),
    buttons,
    h('div', { class: 'gap' }), done);
}
