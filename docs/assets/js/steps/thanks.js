// 3단계: 감사 — 인사 + (있으면) 당근 단골 맺기 한 번 더 권하기
// 후기를 먼저 받고, 단골은 "한 가지만 더" 정도로 가볍게 — platforms.json의 placement: "thanks" 항목
import { h } from '../core/dom.js';
import { loadJson } from '../core/api.js';
import { log } from '../core/log.js';

export async function render(ctx) {
  const L = ctx.log || ((ev, step) => log(ctx.j, ev, step));
  L('thanks_view', 'thanks');
  const p = h('p', { class: 'thanks-body' });
  p.innerHTML = '바쁘신데 시간 내주셔서<br><b>진심으로 감사드려요.</b><br><br>남겨주신 설문과 후기가<br>저희 같은 작은 업체에<br><b>정말 너무너무 큰 힘</b>이 됩니다.<br><br>새집에서 행복한 일만<br>가득하시길 바랄게요 🏠';

  const pj = await loadJson('platforms.json');
  const extras = (Array.isArray(pj) ? pj : pj.buttons).filter(x => x.placement === 'thanks' && x.enabled && x.url);
  const cards = extras.map(x => {
    const followed = ctx.state['did_' + x.key];
    const card = h('div', { class: 'extra-card' });
    if (followed) {
      card.append(h('p', { class: 'extra-done' }, '✔ ' + x.label.replace(/^\S+\s/, '') + ' 해주셔서 감사해요!'));
      return card;
    }
    const a = h('a', { class: 'btn big ' + x.style, href: x.url, target: '_blank', rel: 'noopener' }, x.label);
    a.addEventListener('click', () => {
      L('click_' + x.key, 'thanks');
      ctx.save({ ['did_' + x.key]: true });
      setTimeout(() => card.replaceChildren(h('p', { class: 'extra-done' }, '✔ 감사해요! 단골 소식으로 찾아갈게요 🙌')), 800);
    });
    card.append(h('p', { class: 'extra-title' }, '한 가지만 더 부탁드려도 될까요? 🙏'), a, x.note ? h('p', { class: 'sub note' }, x.note) : null);
    return card;
  });

  const back = h('button', { class: 'link', type: 'button' }, '← 후기 남기기로 돌아가기');
  back.addEventListener('click', () => ctx.back());
  return h('section', { class: 'thanks' }, h('h1', {}, '정말 감사합니다 🙏'), p, cards, h('p', { class: 'sign' }, '— 나우클린 드림'), h('div', { class: 'gap' }), back);
}
