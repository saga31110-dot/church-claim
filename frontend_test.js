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
  assert(src.includes('liff.login({redirectUri: location.href})'));
  assert(!/2026-11-release-[34]/.test(src), 'frontend must not hard-pin release-3 or release-4');
  assert(!/apiVersion\s*[!=]==\s*['"]2026-11-release-/.test(src), 'frontend must not equality-check apiVersion');
  assert(src.includes('加入共同照顧') && src.includes('退出共同照顧') && src.includes('未認領推薦') && src.includes('openLinked(entry.k)'));
  assert(!src.includes('已認領回訪推薦'));
  const id1 = '2-4|曾淳棋|1';
  const same1 = '2-4|同名|1';
  const same2 = '2-4|同名|2';
  assert.strictEqual(window.__APP__.entryFrom('?k=' + encodeURIComponent(id1) + '&v=1').k, id1);
  assert.strictEqual(window.__APP__.entryFrom('?liff.state=' + encodeURIComponent('?k=' + encodeURIComponent(same1) + '&v=1')).k, same1);
  assert.strictEqual(window.__APP__.entryFrom('?liff.state=' + encodeURIComponent('?k=' + encodeURIComponent(same1) + '&v=1')).v, '1');
  assert.strictEqual(window.__APP__.entryFrom('?k=' + encodeURIComponent(same2) + '&liff.state=' + encodeURIComponent('?k=' + encodeURIComponent(same1))).k, same2);
  const visits = [
    { key: same1, name: '同名', group: '一', tier: 'A', district: '2-4', cycle: 7, never: false, overdue: 1, due: '2026-11-08', pending: false, attendanceStatus: 'verified', history: [{ date: '2026-11-01', method: '見面', status: '順利聯繫', saint: '管理者', note: '私密一' }] },
    { key: same2, name: '同名', group: '二', tier: 'A', district: '2-4', cycle: 7, never: true, overdue: 0, due: '2026-11-09', pending: false, attendanceStatus: 'verified', history: [{ date: '2026-11-02', method: '電話', status: '未聯繫上', saint: '聖徒二', note: '私密二' }] }
  ];
  let visitsReady;
  const visitsGate = new Promise((resolve) => { visitsReady = resolve; });
  window.fetch = () => visitsGate.then(() => ({ json: async () => ({ ok: true, today: '2026-11-09', people: visits }) }));
  S.readOnly = false; S.role = 'saint'; S.saint = '管理者'; S.mode = 'visit'; S.deepKey = same1; S.deepOpened = ''; S.deepMiss = false; S.visits = null;
  window.__APP__.render();
  assert(!window.document.querySelector('.mask'), 'form waits until the roster arrives');
  visitsReady();
  setTimeout(async () => {
  const opened = window.document.querySelector('.mask');
  assert(opened && opened.innerHTML.includes('私密一') && !opened.innerHTML.includes('私密二'));
  S.deepKey = same2; S.deepOpened = '';
  window.__APP__.openDeepVisit();
  const second = window.document.querySelector('.mask');
  assert(second && second.innerHTML.includes('私密二') && !second.innerHTML.includes('私密一'));
  assert.strictEqual(window.document.querySelectorAll('.mask').length, 1);
  S.deepKey = '2-4|沒有|1'; S.deepOpened = ''; S.deepMiss = false;
  window.__APP__.openDeepVisit();
  assert(!window.document.querySelector('.mask'));
  assert(app.innerHTML.includes('你目前沒有這位的照顧關係'));
  assert(!app.innerHTML.includes('私密一') && !app.innerHTML.includes('私密二'));
  S.visits = visits.filter(p => p.key !== same2); S.deepKey = same2; S.deepOpened = ''; S.deepMiss = false;
  window.__APP__.openDeepVisit();
  assert(!window.document.querySelector('.mask'));
  assert(app.innerHTML.includes('你目前沒有這位的照顧關係'));
  assert(!app.innerHTML.includes('私密二'));
  S.readOnly = true; S.role = 'observer'; S.deepKey = same1; S.deepMiss = false; S.mode = 'claim';
  window.__APP__.render();
  assert(app.innerHTML.includes('觀察者模式不能填寫回訪，也不顯示回訪紀錄'));
  assert(!app.innerHTML.includes('私密一'));
  window.__APP__.openDeepVisit();
  assert(!window.document.querySelector('.mask'));
  assert(src.includes('openLinked(entry.k)'));
  function openOk(key, note){
    return { ok:true, apiVersion:'2026-11-name-link-2', nameEntry:'row-stable-id', nameOpen:'one', bound:true, role:'saint', readOnly:false, saint:'管理者', today:'2026-11-09', found:true, person:{
      key:key, name:'同名', group:'一', district:'2-4', tier:'A', tab:'A 優先', cycle:7, last:'2026-11-01', lastStatus:'順利聯繫', due:'2026-11-08', never:false, overdue:1, pending:false, attendanceStatus:'verified',
      history:[{ date:'2026-11-01', method:'見面', status:'順利聯繫', saint:'管理者', note:note }]
    } };
  }
  window.liff = { getIDToken: () => 'secret-token' };
  let releaseSlow;
  window.fetch = () => new Promise((resolve) => { releaseSlow = resolve; });
  S.openMs = 5000;
  const slow = window.__APP__.openLinked(same1);
  assert.strictEqual(window.document.getElementById('meter').dataset.stage, 'open');
  assert(app.innerHTML.includes('正在確認這一位'));
  assert(!window.document.querySelector('.mask'));
  assert(!app.innerHTML.includes(same1) && !app.innerHTML.includes('secret-token') && !app.innerHTML.includes('私密一'));
  releaseSlow({ json: async () => openOk(same1, '私密一') });
  await slow;
  let openedNow = window.document.querySelector('.mask');
  assert(openedNow && openedNow.innerHTML.includes('私密一') && !openedNow.innerHTML.includes('私密二'));
  const pending = [];
  window.fetch = () => new Promise((resolve) => { pending.push(resolve); });
  const first = window.__APP__.openLinked(same1);
  const again = window.__APP__.openLinked(same2);
  pending[0]({ json: async () => openOk(same1, '私密一') });
  pending[1]({ json: async () => openOk(same2, '私密二') });
  await Promise.all([first, again]);
  openedNow = window.document.querySelector('.mask');
  assert(openedNow && openedNow.innerHTML.includes('私密二') && !openedNow.innerHTML.includes('私密一'));
  assert.strictEqual(window.document.querySelectorAll('.mask').length, 1);
  window.fetch = () => new Promise(() => {});
  S.openMs = 30;
  await window.__APP__.openLinked(same1);
  assert(app.innerHTML.includes('這一位載入逾時'));
  assert.strictEqual(window.document.getElementById('meter').dataset.stage, 'timeout');
  assert(!window.document.querySelector('.mask'));
  assert(!app.innerHTML.includes('私密'));
  window.fetch = async () => ({ json: async () => openOk(same1, '私密一') });
  S.openMs = 5000;
  window.document.getElementById('retry').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  openedNow = window.document.querySelector('.mask');
  assert(openedNow && openedNow.innerHTML.includes('私密一'));
  window.fetch = async () => { throw new Error('down'); };
  await window.__APP__.openLinked(same2);
  assert(app.innerHTML.includes('無法載入這一位'));
  assert(!window.document.querySelector('.mask'));
  assert(!app.innerHTML.includes('私密'));
  window.fetch = async () => ({ json: async () => ({ ok:true, apiVersion:'2026-11-name-link-2', nameEntry:'row-stable-id', nameOpen:'one', bound:true, role:'saint', readOnly:false, saint:'管理者', today:'2026-11-09', found:false, person:null }) });
  await window.__APP__.openLinked('2-4|沒有|1');
  assert(app.innerHTML.includes('你目前沒有這位的照顧關係'));
  assert(!app.innerHTML.includes('私密'));
  assert(!window.document.querySelector('.mask'));
  window.fetch = async () => ({ json: async () => ({ ok:true, apiVersion:'2026-11-name-link-2', nameEntry:'row-stable-id', nameOpen:'one', bound:true, role:'observer', readOnly:true, saint:null, today:'2026-11-09', found:false, person:null }) });
  await window.__APP__.openLinked(same1);
  assert(app.innerHTML.includes('觀察者模式不能填寫回訪，也不顯示回訪紀錄'));
  assert(!app.innerHTML.includes('私密一'));
  assert(!window.document.querySelector('.mask'));
  S.openMs = 0;
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
    assert(app.innerHTML.includes('nameEntry'), 'a backend without the name-entry marker must stop');
    assert(app.innerHTML.includes('2026-11-release-7 不是這次修正'));
    window.fetch = async () => ({ json: async () => ({
      ok: true, apiVersion: '2026-11-name-link-1', nameEntry: 'row-stable-id', bound: true, saint: '管理者', role: 'saint', readOnly: false,
      data: { 'A 優先': [], 'B 穩定': [], 'C 近期斷線': [], 'D 全年未出席': [], '待核實': [] }
    }) });
    return window.main();
  }).then(() => {
    assert(app.innerHTML.includes('nameOpen'), 'name-link-1 without single-person open must stop');
    assert(app.innerHTML.includes('2026-11-name-link-1 仍會先載入全部名單'));
    window.fetch = async () => ({ json: async () => ({
      ok: true, apiVersion: '2026-11-name-link-2', nameEntry: 'row-stable-id', nameOpen: 'one', bound: true, saint: '管理者', role: 'saint', readOnly: false,
      data: { 'A 優先': [], 'B 穩定': [], 'C 近期斷線': [], 'D 全年未出席': [], '待核實': [] }
    }) });
    return window.main();
  }).then(() => {
    assert(app.innerHTML.includes('我的回訪') || app.innerHTML.includes('認領名單'), 'single-person open build should render');
    window.fetch = async () => ({ json: async () => ({ ok: true, bound: false, saints: ['管理者'], displayName: '甲' }) });
    return window.main();
  }).then(() => {
    assert(app.innerHTML.includes('後端還沒換成這個版本'), 'a response without apiVersion must still stop');
    console.log('ALL FRONTEND TESTS PASSED');
  }).catch((err) => { console.error(err); process.exit(1); });
  }, 0);
}, 30);

