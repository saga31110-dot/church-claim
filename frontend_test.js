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
assert(htmlOut.includes('已認領回訪推薦') && htmlOut.includes('本人已認領回訪'));
assert(!htmlOut.includes('未認領推薦'));
S.data['A 優先'].push({ key:'2-4|同名|2', stableId:'2-4|同名|2', name:'同名', group:'二', att:1, absent:1, by:'聖徒二', tier:'A', district:'2-4', care:'', coCount:0 });
S.tab = 'A 優先';
window.__APP__.render();
assert(app.innerHTML.includes('加入共同照顧') && app.innerHTML.includes('主要：聖徒二'));
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
  S.visits = [
    { key: '2-4|同名|1', name: '同名', group: '一', tier: 'A', district: '2-4', cycle: 7, never: false, overdue: 1, due: '2026-11-08', pending: false, attendanceStatus: 'verified', care: 'primary', history: [{ date: '2026-11-01', method: '見面', status: '順利聯繫', saint: '管理者', note: '私密一' }] },
    { key: '2-4|同名|2', name: '同名', group: '二', tier: 'A', district: '2-4', cycle: 7, never: true, overdue: 0, due: '2026-11-09', pending: false, attendanceStatus: 'verified', care: 'co', history: [{ date: '2026-11-02', method: '電話', status: '未聯繫上', saint: '聖徒二', note: '私密二' }] }
  ];
  S.today = '2026-11-09';
  S.deepKey = '2-4|同名|2';
  S.deepOpened = '';
  S.deepMiss = false;
  S.readOnly = false;
  S.mode = 'visit';
  window.__APP__.openDeepVisit();
  let mask = window.document.querySelector('.mask');
  assert(mask && mask.innerHTML.includes('私密二') && !mask.innerHTML.includes('私密一'));
  window.__APP__.openForm(S.visits[0]);
  assert(window.document.querySelectorAll('.mask').length === 1);
  mask = window.document.querySelector('.mask');
  assert(mask.innerHTML.includes('私密一') && !mask.innerHTML.includes('私密二'));
  S.deepKey = '2-6|已退出|1';
  S.deepOpened = '';
  window.__APP__.openDeepVisit();
  assert(!window.document.querySelector('.mask'));
  assert(app.innerHTML.includes('你目前沒有這位的照顧關係'));
  assert(!app.innerHTML.includes('私密一') && !app.innerHTML.includes('私密二'));
  S.readOnly = true;
  S.deepKey = '2-4|同名|2';
  S.mode = 'claim';
  window.__APP__.render();
  assert(app.innerHTML.includes('觀察者模式不能填寫回訪'));
  S.readOnly = false;
  const srcLogin = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert(srcLogin.includes('liff.login({redirectUri: location.href})'));
  assert(srcLogin.includes("q.get('k')"));
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

