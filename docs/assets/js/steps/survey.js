// 1단계: 설문 — 답은 구글 시트 "설문" 탭에 저장
import { h } from '../core/dom.js';
import { loadJson, post } from '../core/api.js';
import { log, device, isPreview } from '../core/log.js';
import { toast } from '../core/clipboard.js';

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
        b.closest('.q')?.classList.remove('need');
        if (q.multi) { chosen.has(opt) ? chosen.delete(opt) : chosen.add(opt); b.classList.toggle('on'); }
        else { chosen.clear(); chosen.add(opt); b.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); }
        answers[q.id] = q.multi ? [...chosen] : [...chosen][0];
        ctx.save({ answers });
      });
      return b;
    });
    return h('div', { class: 'q', 'data-q': q.id }, h('div', { class: 'ql' }, q.label + (q.required ? ' *' : '')), h('div', { class: 'chips' }, chips));
  });

  const next = h('button', { class: 'btn primary', type: 'button' }, '다음 →');
  next.addEventListener('click', () => {
    // 꼭 골라야 하는 질문(예: 어떤 청소였나요?)을 안 골랐으면 그 질문으로 안내
    const miss = cfg.questions.find(q => q.required && ![].concat(answers[q.id] || []).length);
    if (miss) {
      const box = document.querySelector('[data-q="' + miss.id + '"]');
      box.classList.add('need'); box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast(miss.requiredMsg || '표시(*)된 질문을 골라주세요');
    }
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
