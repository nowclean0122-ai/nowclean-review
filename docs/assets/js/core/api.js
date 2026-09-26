// Apps Script 웹앱 호출. text/plain POST라 브라우저 사전요청(CORS preflight)이 없다.
let cfg = null;
export async function appConfig() {
  if (!cfg) cfg = await (await fetch(new URL('../../../config/app.json', import.meta.url))).json();
  return cfg;
}
export async function loadJson(name) {
  return (await fetch(new URL(`../../../config/${name}`, import.meta.url))).json();
}
export async function get(params) {
  const { apiUrl } = await appConfig();
  const url = apiUrl + '?' + new URLSearchParams(params);
  return (await fetch(url)).json();
}
export async function post(body) {
  const { apiUrl } = await appConfig();
  const res = await fetch(apiUrl, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}
