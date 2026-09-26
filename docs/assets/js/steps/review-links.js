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
  // 당근·인스타에 다녀오면 화면은 그대로 두고: 그 버튼에 ✔ + 아래에 감사 인사 (다른 버튼도 이어서 누를 수 있게)
  const thanksBox = h('div', { class: 'inline-thanks', hidden: true });
  thanksBox.innerHTML = '<b>남겨주셔서 정말 감사합니다 🙏</b><br>다른 곳에도 남겨주시면 더 큰 힘이 돼요.<br>다 하셨으면 아래 <b>다 했어요</b>를 눌러주세요.';
  const onVisible = () => {
    if (document.hidden) { if (clicked) leftAt = Date.now(); return; }
    if (!(clicked && leftAt && Date.now() - leftAt > 2000)) return;   // 2초 넘게 다녀왔으면 하고 온 것으로 봄
    visited.add(lastKey);
    const el = document.querySelector('[data-key="' + lastKey + '"]');
    if (el) el.classList.add('did');
    thanksBox.hidden = false;
    L('return_from_' + lastKey, 'review-links');
    clicked = false; leftAt = 0;
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
    thanksBox,
    h('div', { class: 'gap' }), done);
}
