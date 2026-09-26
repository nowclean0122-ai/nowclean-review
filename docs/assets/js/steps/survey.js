// 1단계: 설문 — 답은 구글 시트 "설문" 탭에 저장
import { h } from '../core/dom.js';
import { loadJson, post } from '../core/api.js';
import { log, device, isPreview } from '../core/log.js';

export async function render(ctx) {
  const L = ctx.log || ((ev, step) => log(ctx.j, ev, step));
  const cfg = await loadJson('survey.json');
  const answers = ctx.state.answers || {};
  let started = false;
  const markStart = () => { if (!started) { started = true; L('survey_start', 'survey'); } };

  const blocks = cfg.questions.map(q => {
    const chosen = new Set([].concat(answers[q.id] || []));
    const chips = q.options.map(opt => {
      const b = h('button', { class: 'chip' + (chosen.has(opt) ? ' on' : ''), type: 'button' }, opt);
      b.addEventListener('click', () => {
        markStart();
        if (q.multi) { chosen.has(opt) ? chosen.delete(opt) : chosen.add(opt); b.classList.toggle('on'); }
        else { chosen.clear(); chosen.add(opt); b.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); }
        answers[q.id] = q.multi ? [...chosen] : [...chosen][0];
        ctx.save({ answers });
      });
      return b;
    });
    return h('div', { class: 'q' }, h('div', { class: 'ql' }, q.label), h('div', { class: 'chips' }, chips));
  });

  const next = h('button', { class: 'btn primary', type: 'button' }, '다음 →');
  next.addEventListener('click', () => {
    next.disabled = true;
    if (!isPreview) {   // 기다리지 않음
      if (ctx.saveSurvey) ctx.saveSurvey(answers);
      else post({ action: 'survey', j: ctx.j, answers, device: device() }).catch(() => {});
    }
    ctx.next();
  });

  const skip = h('button', { class: 'link center', type: 'button' }, '설문 건너뛰기 →');
  skip.addEventListener('click', () => { L('survey_skip', 'survey'); ctx.next(); });

  L('survey_view', 'survey');
  return h('section', {}, h('h1', {}, cfg.title), h('p', { class: 'sub' }, '해당하는 것만 톡톡 눌러주세요 · 1분'), blocks, next, skip);
}
