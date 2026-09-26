// 2단계: 후기 남기기
// 버튼 링크 = platforms.json 기본값 → 시트 설정 탭 값이 있으면 그걸로 덮어씀 (서버가 늦거나 실패해도 버튼은 항상 보임)
// 버튼을 눌러 당근·카카오·인스타로 갔다가 돌아오면 자동으로 감사 화면으로 넘어간다.
import { h } from '../core/dom.js';
import { loadJson } from '../core/api.js';
import { log } from '../core/log.js';

export async function render(ctx) {
  const platforms = await loadJson('platforms.json');
  const job = await Promise.race([ctx.jobPromise, new Promise(r => setTimeout(() => r(null), 2500))]);
  const server = job?.links || {};
  const linkOf = p => server[p.key] || p.url || '';

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

  const buttons = platforms.map(p => {
    const url = linkOf(p);
    if (p.enabled && url) {
      const a = h('a', { class: 'btn big ' + p.style, href: url, target: '_blank', rel: 'noopener' }, p.label);
      a.addEventListener('click', () => { clicked = true; log(ctx.j, 'click_' + p.key, 'review-links'); });
      return h('div', {}, a, p.note ? h('p', { class: 'sub note' }, p.note) : null);
    }
    if (p.showSoon) return h('div', { class: 'btn soon' }, p.label + ' · 준비 중');   // 누를 수 없는 회색 버튼
    return null;
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
    buttons,
    h('div', { class: 'gap' }), done);
}
