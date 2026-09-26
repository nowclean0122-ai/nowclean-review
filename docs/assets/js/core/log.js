// 기록 전송: 화면을 막지 않도록 sendBeacon(실패 시 fetch)으로 보내고 결과는 기다리지 않는다.
import { appConfig } from './api.js';

export function device() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/SamsungBrowser/.test(ua)) return 'Galaxy(삼성인터넷)';
  if (/Android/.test(ua)) return 'Android';
  return 'PC';
}

// 관리자 미리보기(&preview=1)로 연 화면은 기록하지 않는다
const preview = new URLSearchParams(location.search).get('preview') === '1';
export const isPreview = preview;

export async function log(j, ev, step = '') {
  const { apiUrl } = await appConfig();
  if (!apiUrl || !j || preview) return;
  const body = JSON.stringify({ action: 'log', j, ev, step, device: device() });
  const sent = navigator.sendBeacon && navigator.sendBeacon(apiUrl, new Blob([body], { type: 'text/plain' }));
  if (!sent) fetch(apiUrl, { method: 'POST', body, keepalive: true }).catch(() => {});
}
