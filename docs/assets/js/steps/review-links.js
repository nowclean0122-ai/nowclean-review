// 2단계: 후기 남기기 — 켜져 있고 링크가 있는 버튼만 보여줌 (준비 중은 숨김)
import { h } from '../core/dom.js';
import { loadJson } from '../core/api.js';
import { log } from '../core/log.js';

export async function render(ctx) {
  const platforms = await loadJson('platforms.json');
  const links = ctx.job?.links || {};
  const buttons = platforms
    .filter(p => p.enabled && links[p.key])
    .map(p => {
      const a = h('a', { class: 'btn big ' + p.style, href: links[p.key], target: '_blank', rel: 'noopener' }, p.label);
      a.addEventListener('click', () => log(ctx.j, 'click_' + p.key, 'review-links'));
      return a;
    });
  const done = h('button', { class: 'btn', type: 'button' }, '다 했어요 →');
  done.addEventListener('click', () => { log(ctx.j, 'done', 'review-links'); ctx.next(); });

  log(ctx.j, 'review_view', 'review-links');
  return h('section', {},
    h('h1', {}, '짧은 후기 부탁드려요 🙏'),
    h('p', { class: 'sub' }, '한두 줄이면 충분해요. 저장해 두신 사진도 같이 올려주시면 더 좋아요.'),
    buttons.length ? buttons : h('p', { class: 'sub' }, '(후기 링크 준비 중이에요)'),
    h('div', { class: 'gap' }), done);
}
