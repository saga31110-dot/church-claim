// 前端渲染測試：不連 LINE、不呼叫 /exec
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace(/<script[^>]+src=[^>]+><\/script>/, '');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/?v=1',
  beforeParse(window) { window.__TEST__ = true; }
});
const { window } = dom;
window.alert = () => {};
window.confirm = () => true;
const app = window.document.getElementById('app');
const S = window.S;
S.data = {
  'A 優先': [{ key: '2-4|甲|1', name: '甲', group: '青職', att: 5, absent: 4, by: '管理者', tier: 'A', district: '2-4', attendanceStatus: 'verified' }],
  'B 穩定': [{ key: '2-4|穩|1', name: '穩', group: '大學', att: 10, absent: 0, by: '', tier: 'B', district: '2-4', attendanceStatus: 'verified' }],
  'C 近期斷線': [],
  'D 全年未出席': [],
  '待核實': [{ key: '2-6|新|1', name: '新区人', group: '一', att: 0, absent: 43, by: '', tier: '待核實', district: '2-6', attendanceStatus: 'pending' }]
};

S.readOnly = true; S.role = 'observer'; S.saint = null; S.mode = 'claim'; S.tab = 'A 優先';
window.__APP__.render();
let htmlOut = app.innerHTML;
assert(!htmlOut.includes('type="checkbox"'), 'observer has no claim checkbox');
assert(!htmlOut.includes('確認認領'), 'observer has no submit button');
assert(htmlOut.includes('觀察者模式'), 'observer banner is visible');
assert(htmlOut.includes('B 穩定') && htmlOut.includes('待核實'));
S.tab = '待核實';
window.__APP__.render();
htmlOut = app.innerHTML;
assert(htmlOut.includes('出席狀態待核實'));
assert(!htmlOut.includes('連續缺席'));
window.__APP__.openForm(S.data['待核實'][0]);
assert(!window.document.querySelector('.mask'), 'observer cannot open the visit form');

S.readOnly = false; S.role = 'saint'; S.saint = '管理者'; S.tab = 'B 穩定'; S.mode = 'claim';
window.__APP__.render();
htmlOut = app.innerHTML;
assert(htmlOut.includes('type="checkbox"'));
assert(htmlOut.includes('確認認領'));
assert(htmlOut.includes('>B 穩定<'));
assert(htmlOut.includes('週一、四、六'));
assert(htmlOut.includes('未認領推薦') && htmlOut.includes('本人已認領回訪'));
S.data['A 優先'].push({ key:'2-4|同名|2', stableId:'2-4|同名|2', name:'同名', group:'二', att:1, absent:1, by:'聖徒二', tier:'A', district:'2-4', care:'', coCount:0 });
S.tab = 'A 優先';
window.__APP__.render();
htmlOut = app.innerHTML;
assert(htmlOut.includes('加入共同照顧') && htmlOut.includes('主要：聖徒二'));
S.readOnly = true;
window.__APP__.render();
assert(!app.innerHTML.includes('加入共同照顧'));
S.readOnly = false;
S.data['A 優先'].pop();
S.tab = 'B 穩定';
window.__APP__.render();

window.liff = { getIDToken: () => 'tok' };
window.fetch = async () => ({ json: async () => ({ ok: true, today: '2026-11-09', people: [
  { key: '2-4|穩|1', name: '穩', group: '大學', tier: 'B', district: '2-4', cycle: 30, never: true, overdue: 0, due: '2026-11-09', pending: false, attendanceStatus: 'verified', history: [] }
] }) });
S.mode = 'visit';
window.__APP__.render();
setTimeout(() => {
  const visitHtml = app.innerHTML;
  assert(visitHtml.includes('B 每月'));
  assert(visitHtml.includes('待核實可記入回訪'));
  const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert(src.includes("const LIFF_ID = '2012397222-u2XpUCRQ'"));
  assert(src.includes('https://script.google.com/macros/s/AKfycbwo0W9wULIyYuVlmJq9u2EDvFmMJH6DP2kwj-s1NIYrMRCY3WgThjrTSyInuRGpQHFzzw/exec'));
  assert(!/2026-11-release-[34]/.test(src), 'frontend must not hard-pin release-3 or release-4');
  assert(!/apiVersion\s*[!=]==\s*['"]2026-11-release-/.test(src), 'frontend must not equality-check apiVersion');
  window.liff = {
    init: async () => {},
    isLoggedIn: () => true,
    getIDToken: () => 'tok',
    getFriendship: async () => ({ friendFlag: true }),
    login: () => { throw new Error('should stay logged in'); }
  };
  window.fetch = async () => ({ json: async () => ({
    ok: true, apiVersion: '2026-11-release-5', bound: true, saint: '管理者', role: 'saint', readOnly: false,
    data: { 'A 優先': [], 'B 穩定': [], 'C 近期斷線': [], 'D 全年未出席': [], '待核實': [] }
  }) });
  window.main().then(() => {
    assert(!app.innerHTML.includes('後端還沒換成這個版本'), 'release-5 must be accepted');
    assert(app.innerHTML.includes('我的回訪') || app.innerHTML.includes('認領名單'), 'release-5 init should render');
    window.fetch = async () => ({ json: async () => ({ ok: true, bound: false, saints: ['管理者'], displayName: '甲' }) });
    return window.main();
  }).then(() => {
    assert(app.innerHTML.includes('後端還沒換成這個版本'), 'a response without apiVersion must still stop');
    console.log('ALL FRONTEND TESTS PASSED');
  }).catch((err) => { console.error(err); process.exit(1); });
}, 30);

