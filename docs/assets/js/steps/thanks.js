// 3단계: 감사 — 인사만
import { h } from '../core/dom.js';
import { log } from '../core/log.js';

export async function render(ctx) {
  log(ctx.j, 'thanks_view', 'thanks');
  const p = h('p', { class: 'thanks-body' });
  p.innerHTML = '바쁘신데 시간 내주셔서<br><b>진심으로 감사드려요.</b><br><br>남겨주신 설문과 후기가<br>저희 같은 작은 업체에<br><b>정말 너무너무 큰 힘</b>이 됩니다.<br><br>새집에서 행복한 일만<br>가득하시길 바랄게요 🏠';
  const back = h('button', { class: 'link', type: 'button' }, '← 후기 남기기로 돌아가기');
  back.addEventListener('click', () => ctx.back());
  return h('section', { class: 'thanks' }, h('h1', {}, '정말 감사합니다 🙏'), p, h('p', { class: 'sign' }, '— 나우클린 드림'), h('div', { class: 'gap' }), back);
}
