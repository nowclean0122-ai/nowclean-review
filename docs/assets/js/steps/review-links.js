// 2단계: 후기 남기기 — 켜져 있고 링크가 있는 버튼만 보여줌 (준비 중은 숨김)
// 버튼을 눌러 당근·인스타로 갔다가 돌아오면 자동으로 감사 화면으로 넘어간다.
import { h } from '../core/dom.js';
import { loadJson } from '../core/api.js';
import { log } from '../core/log.js';

export async function render(ctx) {
  const platforms = await loadJson('platforms.json');
  const job = await ctx.jobPromise;
  const links = job?.links || {};

  let clicked = false, leftAt = 0, moved = false;
  const goNext = ev => {
    if (moved) return;
    moved = true;
    document.removeEventListener('visibilitychange', onVisible);
    log(ctx.j, ev, 'review-links');
    ctx.next();
  };
  const onVisible = () => {
    if (document.hidden) { if (clicked) leftAt = Date.now(); return; }
    if (clicked && leftAt && Date.now() - leftAt > 2000) goNext('auto_thanks');   // 2초 넘게 다녀왔으면 후기 쓰고 온 것으로 봄
  };
  document.addEventListener('visibilitychange', onVisible);

  const buttons = platforms
    .filter(p => p.enabled && links[p.key])
    .map(p => {
      const a = h('a', { class: 'btn big ' + p.style, href: links[p.key], target: '_blank', rel: 'noopener' }, p.label);
      a.addEventListener('click', () => { clicked = true; log(ctx.j, 'click_' + p.key, 'review-links'); });
      return h('div', {}, a, p.note ? h('p', { class: 'sub note' }, p.note) : null);
    });

  const back = h('button', { class: 'link', type: 'button' }, '← 설문으로');
  back.addEventListener('click', () => { moved = true; document.removeEventListener('visibilitychange', onVisible); ctx.back(); });

  const done = h('button', { class: 'btn', type: 'button' }, '다 했어요 →');
  done.addEventListener('click', () => goNext('done'));

  log(ctx.j, 'review_view', 'review-links');
  return h('section', {},
    back,
    h('h1', {}, '짧은 후기 부탁드려요 🙏'),
    h('p', { class: 'sub' }, '한두 줄이면 충분해요. 저장해 두신 사진도 같이 올려주시면 더 좋아요.'),
    buttons.length ? buttons : h('p', { class: 'sub' }, '(후기 링크 준비 중이에요)'),
    h('div', { class: 'gap' }), done);
}
