const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const file = path.join(__dirname, 'artifacts', '召會認領_隔離測試版.html');
const html = fs.readFileSync(file, 'utf8');
assert(!/https?:\/\//.test(html), '沙盒不應含有網址');
assert(html.includes("connect-src 'none'"));
assert(html.includes('隔離測試版｜全部為示範資料，不影響正式名單、不會發送LINE'));
assert(!html.includes('liff') && !html.includes('script.google.com'));
['李彥霆','林品清','蕭仲良','高萱','王昱淳','陳永傑','貞雅'].forEach(function (name) {
  assert(!html.includes(name), name);
});

function boot(storage) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://sandbox.local/demo.html',
    beforeParse: function (win) {
      if (!storage) return;
      Object.keys(storage).forEach(function (k) { win.localStorage.setItem(k, storage[k]); });
    }
  });
  return dom;
}

const dom = boot();
const win = dom.window;
const sb = win.__SANDBOX__;
assert(sb, 'sandbox api');
assert.strictEqual(win.document.querySelector('.banner').textContent, '隔離測試版｜全部為示範資料，不影響正式名單、不會發送LINE');
assert.strictEqual(win.document.getElementById('netCount').textContent, '0');

const before = JSON.stringify(sb.state.people.map(function (p) { return p.id + p.by; }));
sb.setRole('observer');
const denied = sb.applyClaims();
assert.strictEqual(denied.ok, false);
assert(denied.error.includes('沙盒資料層拒絕'));
assert.strictEqual(JSON.stringify(sb.state.people.map(function (p) { return p.id + p.by; })), before);
const deniedVisit = sb.saveVisit('A07', '2026-11-01', '電話', '順利聯繫', '不該寫');
assert.strictEqual(deniedVisit.ok, false);
assert.strictEqual(sb.state.visits.length, 1);
console.log('ok observer data layer rejects claim and visit');

sb.setRole('示範服事者甲');
sb.ui.pick = { A07: 1 };
const claimed = sb.applyClaims();
assert.strictEqual(claimed.ok, true);
assert.strictEqual(claimed.claimed, 1);
assert.strictEqual(sb.findPerson('A07').by, '示範服事者甲');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const saved = sb.saveVisit('A07', today, '見面', '願意來聚會', '示範備註：重新看得到');
assert.strictEqual(saved.ok, true);
assert(sb.state.visits.some(function (v) { return v.personId === 'A07' && v.note.indexOf('重新看得到') >= 0; }));
console.log('ok claim and visit stored');

const raw = win.localStorage.getItem('cc-sandbox-v1');
assert(raw && raw.indexOf('重新看得到') >= 0);
const dom2 = boot({ 'cc-sandbox-v1': raw });
const again = dom2.window.__SANDBOX__.findPerson('A07');
assert.strictEqual(again.by, '示範服事者甲');
assert(dom2.window.__SANDBOX__.state.visits.some(function (v) { return v.note.indexOf('重新看得到') >= 0; }));
console.log('ok reload keeps claim and visit');

function count(drawn) { return { A: drawn.A.length, B: drawn.B.length, CD: drawn.CD.length, n: drawn.list.length }; }
const all = sb.state.people;
const groupPools = sb.poolsFrom(all.filter(function (p) { return !p.by; }));
const full = sb.drawSample(groupPools, function () { return 0.3; });
assert.deepStrictEqual(count(full), { A: 2, B: 2, CD: 4, n: 8 });
assert.strictEqual(new Set(full.list.map(function (p) { return p.id; })).size, 8);
assert(!full.list.some(function (p) { return p.attendanceStatus === 'pending' || p.tier === '待核實' || String(p.id).indexOf('26-') === 0 || String(p.id).indexOf('27-') === 0; }));
console.log('ok group sample is A2 B2 CD4 with no pending');

const shortPools = { A: groupPools.A.slice(0, 1), B: [], CD: groupPools.CD.slice(0, 1) };
const short = sb.drawSample(shortPools, Math.random);
assert.strictEqual(short.A.length, 1);
assert.strictEqual(short.B.length, 0);
assert.strictEqual(short.CD.length, 1);
assert.strictEqual(short.list.length, 2);
assert(!short.list.some(function (p) { return p.tier === '待核實'; }));
console.log('ok short pool is not padded');

sb.setRole('示範服事者乙');
const personal = sb.poolsFrom(sb.state.people.filter(function (p) { return p.by === '示範服事者乙'; }));
const few = sb.drawSample(personal, Math.random);
assert.strictEqual(few.A.length, 1);
assert.strictEqual(few.B.length, 0);
assert.strictEqual(few.CD.length, 0);
console.log('ok personal pool for 乙 shows the actual short count');

const dry = sb.repairDryRun();
assert.strictEqual(dry.wrote, false);
assert.strictEqual(dry.dryRun, true);
assert.strictEqual(dry.claimCount, 2);
assert.strictEqual(dry.visitCount, 0);
assert.strictEqual(sb.state.occupied.active, true);
const bad = sb.repairConfirm('不是這個人');
assert.strictEqual(bad.ok, false);
assert.strictEqual(sb.state.occupied.active, true);
assert.strictEqual(sb.findPerson('A04').by, '示範服事者丙');
const good = sb.repairConfirm('示範占用顯示名');
assert.strictEqual(good.wrote, true);
assert.strictEqual(good.claimsPreserved, true);
assert.strictEqual(sb.state.occupied.active, false);
assert.strictEqual(sb.findPerson('A04').by, '示範服事者丙');
assert.strictEqual(sb.findPerson('A05').by, '示範服事者丙');
console.log('ok repair dry-run writes nothing and confirm keeps fictional claims');

sb.reset();
assert.strictEqual(sb.state.occupied.active, true);
assert.strictEqual(sb.findPerson('A07').by, '');
assert.strictEqual(sb.state.visits.length, 1);
console.log('ok reset restores the fictional seed');

assert.throws(function () { win.fetch('/blocked'); });
assert.strictEqual(sb.net.length, 1);
console.log('ok script-level network call is blocked');
console.log('ALL SANDBOX TESTS PASSED');
