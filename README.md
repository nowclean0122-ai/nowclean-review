# nowclean-review

나우클린 리뷰 퍼널 (베타). 기획: `D:\marketing\입주청소-리뷰퍼널-기획서.html`

- `docs/` — GitHub Pages로 공개되는 화면 (고객 링크 `a/?j=토큰`, 관리자 `admin/`)
- `docs/config/` — 단계 순서·설문·버튼·문자 문구 (코드 수정 없이 바꾸는 곳)
- `apps-script/` — Google Apps Script 서버 (clasp push). 저장: 구글 시트, 메일: 업체 Gmail
- `tools/mock-server.mjs` — 로컬 테스트 (`node tools/mock-server.mjs`, PIN 1234)

새 단계 추가 = `docs/assets/js/steps/이름.js` + `docs/config/flow.json`에 이름 추가.
