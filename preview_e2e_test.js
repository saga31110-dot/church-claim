// 預覽頁的記憶體流程。不連 LINE、不讀正式表、不發送。
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, 'preview', '召會認領_整合預覽.html');
const html = fs.readFileSync(htmlPath, 'utf8');
assert(html.includes('不寫正式資料') && html.includes('不發訊'));
assert(!/liff\.line\.me|api\.line\.me|script\.google\.com/.test(html));

function boot() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://preview.local/' });
  const { document } = dom.window;
  return {
    document,
    role(value) {
      const sel = document.getElementById('role');
      sel.value = value;
      sel.dispatchEvent(new dom.window.Event('change'));
    },
    click(selector) {
      const el = document.querySelector(selector);
      assert(el, selector);
      el.click();
    },
    text() { return document.getElementById('result').textContent; }
  };
}

const page = boot();
assert.strictEqual(page.document.querySelectorAll('#groupRows .person').length, 5);
page.role('yi');
page.click('#groupRows .person[data-id="2-4|示範A01|1"]');
assert(page.text().includes('你目前沒有這位的照顧關係'));
assert(!page.text().includes('既有示範紀錄'));
page.click('[data-join="2-4|示範A01|1"]');
assert.strictEqual(page.document.querySelectorAll('#groupRows .person').length, 5);
page.click('#groupRows .person[data-id="2-4|示範A01|1"]');
page.document.getElementById('fn').value = '共同示範紀錄';
page.click('#save');
assert(page.text().includes('示範服事者乙') && page.text().includes('共同示範紀錄'));
page.role('jia');
page.click('#groupRows .person[data-id="2-4|示範A01|1"]');
assert(page.text().includes('示範服事者乙') && page.text().includes('共同示範紀錄'));
page.click('#groupRows .person[data-id="2-4|示範同名|2"]');
assert(!page.text().includes('共同示範紀錄'));
assert(page.text().includes('你目前沒有這位的照顧關係'));
page.click('[data-cancel="2-4|示範A01|1"]');
assert(page.text().includes('仍有共同照顧者，主要不能退出'));
assert(page.document.getElementById('roster').textContent.includes('主要照顧者：示範服事者甲'));
page.role('yi');
page.click('[data-leave="2-4|示範A01|1"]');
page.click('#groupRows .person[data-id="2-4|示範A01|1"]');
assert(page.text().includes('你目前沒有這位的照顧關係'));
assert(!page.text().includes('共同示範紀錄'));
page.role('observer');
page.click('#groupRows .person[data-id="2-4|示範B01|1"]');
assert(page.text().includes('觀察者模式不能填寫回訪'));
assert(!page.text().includes('既有示範紀錄'));
page.click('#reset');
page.role('yi');
page.click('#groupRows .person[data-id="2-4|示範A01|1"]');
assert(page.text().includes('你目前沒有這位的照顧關係'));
assert(!page.document.querySelector('[data-leave="2-4|示範A01|1"]'));
console.log('ALL PREVIEW TESTS PASSED');
