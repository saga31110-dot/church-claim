/**
 * 回訪認領 API（2-4／2-6／2-7）— Apps Script 後端。
 * 部署：網頁應用程式，執行身分＝我，存取權＝所有人。前端 index.html 以 POST 呼叫同一個 /exec。
 * 本檔不含聖徒名單、LINE userId、試算表 ID、權杖。請放在指令碼屬性（見《部署與遷移》）。
 *
 * 排程：每週一、四、六 09:00（Asia/Taipei）個人＋兩個群組共用 sendReminders；每月 1 日 08:00 月報。
 * Apps Script 的 nearMinute(0) 是指定分鐘加減約 15 分鐘（官方說明），不是「09 分」，也不能保證準時 09:00。
 * 觸發時區用 inTimezone('Asia/Taipei')。本機測試只檢查這個參數。
 *
 * 抽樣暫定（待調整）：群組抽「未認領推薦」、個人抽「本人已認領回訪」，分開抽。
 * 比例 A 2、B 2、C 或 D 合計 4。池不足只抽實際人數，不重複、不跨級補齊。待核實不進 C/D。
 *
 * 遷移與綁定修復都是 dry-run 預設，確認前不寫入。不要在這裡執行正式表。
 * 認領與回訪以執行當下的正式表為準。2026-11-07 的 139／22 只是參考，不是上限。
 * 上線順序：先把必填屬性設好，貼上本檔後立刻 pauseReminderTriggers，再部署同一個 /exec，
 * 瀏覽器看到 apiVersion 後才換前端；最後才 setupTriggers。不要先換 GitHub Pages。
 */
var API_VERSION = '2026-11-name-link-1';
var NAME_ENTRY = 'row-stable-id';
var CONFIG = {
  LOGIN_CHANNEL_ID: '2012397222',
  LIFF_URL: 'https://liff.line.me/2012397222-u2XpUCRQ',
  EXEC_URL: 'https://script.google.com/macros/s/AKfycbwo0W9wULIyYuVlmJq9u2EDvFmMJH6DP2kwj-s1NIYrMRCY3WgThjrTSyInuRGpQHFzzw/exec',
  TABS: ['A 優先', 'B 穩定', 'C 近期斷線', 'D 全年未出席', '待核實'],
  TIER: { 'A 優先': 'A', 'B 穩定': 'B', 'C 近期斷線': 'C', 'D 全年未出席': 'D', '待核實': '待核實' },
  CYCLE: { 'A 優先': 7, 'B 穩定': 30, 'C 近期斷線': 14, 'D 全年未出席': 30 },
  BIND_TAB: 'LINE綁定',
  VISIT_TAB: '回訪紀錄',
  LOG_TAB: '推播紀錄',
  GROUP_TAB: '群組紀錄',
  INDEX_TAB: '名單索引',
  KEYMAP_TAB: '鍵對照',
  SOURCEMAP_TAB: '來源對照',
  MERGE_TAB: '合併紀錄',
  SAMPLE_TAB: '抽樣紀錄',
  REPAIR_TAB: '修復紀錄',
  CLAIM_COL: 5,
  STABLE_COL: 6,
  METHODS: ['見面', '電話', 'LINE', '其他'],
  STATUSES: ['順利聯繫', '未聯繫上', '有需要代禱', '願意來聚會'],
  STATUS_SCORE: { '未聯繫上': 0, '有需要代禱': 1, '順利聯繫': 2, '願意來聚會': 3 },
  TZ: 'Asia/Taipei',
  GROUP_NAMES: ['一杯好咖啡', '2-4柱子們'],
  RUN_DAYS: '一四六',
  RUN_HOUR: 9,
  MONTHLY_HOUR: 8,
  MAX_ROWS_IN_BUBBLE: 8,
  SCHEDULE_NOTE: '每週觸發是 Asia/Taipei 週一、四、六 atHour(9).nearMinute(0)。Google 文件寫 nearMinute 為指定分鐘加減約 15 分鐘，所以大約落在台北時間 08:45 到 09:15，不是準時 09:00，也不是「09 分」。月報是每月 1 日 atHour(8).nearMinute(0)，大約 07:45 到 08:15。本機測試只檢查時區與參數，不能證明正式環境準時執行。'
};
var WEEK_HEADERS = ('2025-12-29,2026-01-05,2026-01-12,2026-01-19,2026-01-26,2026-02-02,2026-02-09,2026-02-16,2026-02-23,2026-03-02,2026-03-09,2026-03-16,2026-03-23,2026-03-30,2026-04-06,2026-04-13,2026-04-20,2026-04-27,2026-05-04,2026-05-11,2026-05-18,2026-05-25,2026-06-01,2026-06-08,2026-06-15,2026-06-22,2026-06-29,2026-07-06,2026-07-13,2026-07-20,2026-07-27,2026-08-03,2026-08-10,2026-08-17,2026-08-24,2026-08-31,2026-09-07,2026-09-14,2026-09-21,2026-09-28,2026-10-05,2026-10-12,2026-10-19').split(',');
var ROSTER_MANIFEST_V1 = {
  manifestVersion: 1,
  id: '2026-11-07-roster-structure',
  asOf: '2026-11-07',
  note: '只核對名單結構。認領與回訪不在門檻內，以執行當下的正式表為準，不得用這份參考覆蓋後來新增的資料。',
  districts: { '2-4': { A: 35, B: 16, C: 37, D: 599, total: 687 }, '2-6': { total: 248 }, '2-7': { total: 71 } },
  candidates: 1006,
  sameNameGroups: 12,
  sameNameRows: 25,
  reviewNameGroups: 14,
  reviewNameRows: 30,
  referenceClaims: 139,
  referenceVisits: 22,
  gates: ['districts', 'candidates', 'sameNameGroups', 'pendingNotD']
};
var EXPECTED_IMPORT = ROSTER_MANIFEST_V1;
var SAMPLE_SPEC = {
  assumption: '暫定假設（待教授調整）：群組推播抽「未認領推薦」，個人推播抽「本人已認領回訪」，兩種分開抽。比例 A 2 位、B 2 位、C 或 D 合計 4 位。池不足只顯示實際人數，不重複、不跨級補齊；出席待核實不納入 C/D。',
  groupPool: '未認領推薦',
  personalPool: '本人已認領回訪',
  counts: { A: 2, B: 2, CD: 4 }
};
var ATTENDANCE_HEADER = ['#', '姓名', '大區', '小區', '排', '群組', '出席', '出席率', '最近出席', '缺席週'];
var VISIT_HEADER = ['時間戳', '聖徒', '分頁', '姓名', '回訪日期', '方式', '狀況', '備註', '資料鍵', '舊資料鍵'];
var LOG_HEADER = ['時間', '類型', '對象', 'userId', '狀態碼', '結果', '說明'];
var GROUP_HEADER = ['記錄時間', '事件類型', 'groupId／roomId／userId', '來源類型', '事件時間'];
var INDEX_HEADER = ['穩定ID', '舊資料鍵', '來源鍵', '來源區', '分級', '分頁', '列號', '姓名', '正規化姓名', '同名序', '群組', '大區', '小區', '排', '出席', '缺席', '出席狀態', '認領者', '來源表', '來源列', '有效', '併入'];
var SAMPLE_HEADER = ['日期', '池', '對象', '名單鍵', '狀態'];
var BACKUP_TABS = ['A 優先', 'B 穩定', 'C 近期斷線', 'D 全年未出席', '待核實', '回訪紀錄', 'LINE綁定', '名單索引', '鍵對照', '來源對照', '合併紀錄'];
var LEGACY_TABS = ['A 優先', 'C 近期斷線', 'D 全年未出席'];
var TIER_COLOR = { A: '#E0533D', B: '#2B6CB0', C: '#E8A317', D: '#6B7A8F', '待核實': '#6B4C7A' };

function cfg_(key) {
  var p = PropertiesService.getScriptProperties().getProperty(key);
  if (p != null && p !== '') return p;
  var v = CONFIG[key];
  return v == null ? '' : v;
}
function requireSheetId_() {
  var id = cfg_('SHEET_ID');
  if (!id) throw new Error('伺服器尚未設定指令碼屬性 SHEET_ID');
  return id;
}
function openSs_() { return SpreadsheetApp.openById(requireSheetId_()); }
function saints_() {
  var p = PropertiesService.getScriptProperties().getProperty('SAINTS');
  if (!p) throw new Error('伺服器尚未設定指令碼屬性 SAINTS');
  var list = String(p).split(/[,，、]/).map(function (s) { return s.trim(); }).filter(String);
  if (!list.length) throw new Error('指令碼屬性 SAINTS 是空的');
  return list;
}
function adminSaint_() {
  var p = PropertiesService.getScriptProperties().getProperty('ADMIN_SAINT');
  if (p && String(p).trim()) return String(p).trim();
  return saints_()[0];
}
function adminUserId_() {
  var id = PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID');
  if (!id) throw new Error('伺服器尚未設定指令碼屬性 ADMIN_USER_ID');
  return id;
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, service: '回訪認領 API', apiVersion: API_VERSION, nameEntry: NAME_ENTRY,
    features: ['observer', 'tier-B', 'pending-not-D', 'sample-A2B2CD4', 'schedule-mon-thu-sat-09', 'migration-manifest-v1', 'name-link']
  })).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var out, req;
  try {
    req = JSON.parse(e.postData.contents);
    if (isWebhook_(req)) { handleWebhook_(e, req); return; }
    var user = verifyIdToken_(req.idToken);
    out = handle_(req, user);
  } catch (err) {
    if (req && isWebhook_(req)) return;
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('缺少 ID token，請從 LINE 內開啟');
  var cid = String(cfg_('LOGIN_CHANNEL_ID') || '');
  if (!cid) throw new Error('伺服器尚未設定 LOGIN_CHANNEL_ID');
  var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', payload: { id_token: idToken, client_id: cid }, muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !body.sub) throw new Error('LINE 身分驗證失敗：' + (body.error_description || res.getResponseCode()));
  if (String(body.aud) !== cid) throw new Error('LINE 身分驗證失敗：channel 不符');
  return { userId: body.sub, displayName: body.name || '' };
}
function handle_(req, user) {
  var ss = openSs_();
  var acc = account_(ss, user.userId);
  switch (req.action) {
    case 'init':
      return initPayload_(ss, acc, user);
    case 'bind':
      return bind_(ss, user, req.saint, acc);
    case 'bindObserver':
      return bindObserver_(ss, user, acc);
    case 'submit':
      assertWriter_(acc);
      return submit_(ss, acc.saint, req.claims || [], req.releases || []);
    case 'visits':
      assertWriter_(acc);
      return { ok: true, today: today_(), people: myVisits_(ss, acc.saint) };
    case 'record':
      assertWriter_(acc);
      return record_(ss, acc.saint, req);
    case 'adminRepair':
      assertAdmin_(user);
      return repairBinding_(ss, req || {});
    case 'adminMerge':
      assertAdmin_(user);
      return mergePeople_(ss, req || {});
    default:
      throw new Error('未知動作');
  }
}
function initPayload_(ss, acc, user) {
  var base = {
    ok: true, apiVersion: API_VERSION, nameEntry: NAME_ENTRY, saints: saints_(), displayName: user.displayName,
    sampleAssumption: SAMPLE_SPEC.assumption, scheduleNote: CONFIG.SCHEDULE_NOTE,
    cycles: { A: 7, B: 30, C: 14, D: 30 }
  };
  if (!acc) return Object.assign(base, { bound: false, role: null, readOnly: false, saint: null, data: null });
  if (acc.role === 'observer') {
    return Object.assign(base, { bound: true, role: 'observer', readOnly: true, saint: null, data: readAll_(ss) });
  }
  return Object.assign(base, { bound: true, role: 'saint', readOnly: false, saint: acc.saint, data: readAll_(ss) });
}
function assertWriter_(acc) {
  if (!acc || acc.role !== 'saint' || !acc.saint) throw new Error('觀察者模式或未綁定不能認領或填寫回訪');
}
function assertAdmin_(user) {
  if (!user || user.userId !== adminUserId_()) throw new Error('只有管理者可以執行這項操作');
}

function bindSheet_(ss, create) {
  var sh = ss.getSheetByName(CONFIG.BIND_TAB);
  if (!sh && create) {
    sh = ss.insertSheet(CONFIG.BIND_TAB);
    sh.appendRow(['userId', 'displayName', '聖徒姓名', '綁定時間', '角色']);
  }
  return sh;
}
function account_(ss, userId) {
  var sh = bindSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] !== userId) continue;
    var role = v[i][4] || (v[i][2] ? 'saint' : '');
    if (role === 'observer' || !v[i][2]) return { role: 'observer', saint: null, displayName: v[i][1] || '', row: i + 1, userId: userId };
    return { role: 'saint', saint: v[i][2], displayName: v[i][1] || '', row: i + 1, userId: userId };
  }
  return null;
}
function bind_(ss, user, saint, acc) {
  if (acc && acc.role === 'observer') throw new Error('觀察者模式不能自行改綁聖徒，請聯絡管理者');
  if (acc && acc.role === 'saint') return { ok: false, error: '此 LINE 帳號已綁定為 ' + acc.saint };
  if (saints_().indexOf(saint) < 0) throw new Error('只有指定的聖徒可以綁定');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = bindSheet_(ss, true), v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (v[i][0] === user.userId) return { ok: false, error: '此 LINE 帳號已綁定為 ' + (v[i][2] || '觀察者') };
      if (v[i][2] === saint) return { ok: false, error: saint + ' 已被其他 LINE 帳號綁定，請聯絡管理者' };
    }
    sh.appendRow([user.userId, user.displayName, saint, new Date(), 'saint']);
    return { ok: true, saint: saint, role: 'saint', readOnly: false, data: readAll_(ss) };
  } finally { lock.releaseLock(); }
}
function bindObserver_(ss, user, acc) {
  if (acc && acc.role === 'saint') throw new Error('已綁定聖徒身分，不能改成觀察者');
  if (acc && acc.role === 'observer') return { ok: true, role: 'observer', readOnly: true, saint: null, data: readAll_(ss) };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var again = account_(ss, user.userId);
    if (again) throw new Error('此 LINE 帳號已有身分');
    var sh = bindSheet_(ss, true);
    sh.appendRow([user.userId, user.displayName, '', new Date(), 'observer']);
    return { ok: true, role: 'observer', readOnly: true, saint: null, data: readAll_(ss) };
  } finally { lock.releaseLock(); }
}

function repairBinding_(ss, opts) {
  opts = opts || {};
  var saint = String(opts.saint || '');
  if (!saint || saints_().indexOf(saint) < 0) return { ok: false, wrote: false, error: '只能修復指定的一位聖徒' };
  if (opts.op && opts.op !== 'release' && opts.op !== 'transfer') return { ok: false, wrote: false, error: '未知修復操作' };
  var sh = bindSheet_(ss, false);
  var values = sh && sh.getLastRow() ? sh.getDataRange().getValues() : [];
  var matches = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][2] === saint) matches.push({ row: i + 1, userId: values[i][0], displayName: values[i][1] || '', saint: values[i][2], role: values[i][4] || 'saint' });
  }
  var claims = claimsOfSaint_(ss, saint);
  var visitCount = 0;
  try { visitCount = readVisits_(ss).filter(function (r) { return r.saint === saint; }).length; } catch (e) { visitCount = 0; }
  var report = {
    saint: saint, matchCount: matches.length,
    displayName: matches.length === 1 ? matches[0].displayName : '',
    userId: matches.length === 1 ? matches[0].userId : '',
    claimCount: claims.length, claims: claims, visitCount: visitCount,
    bindingCount: Math.max(0, values.length - 1)
  };
  if (matches.length !== 1) {
    return { ok: false, wrote: false, dryRun: true, error: matches.length ? '同一聖徒有多筆綁定，已中止以免誤刪' : '找不到這位聖徒的綁定', report: report };
  }
  var confirm = opts.mode === 'confirm' && opts.confirm === true;
  if (!confirm) return { ok: true, wrote: false, dryRun: true, report: report };
  if (opts.op !== 'release' && opts.op !== 'transfer') return { ok: false, wrote: false, error: '確認時必須指定 release 或 transfer' };
  if (String(opts.expectDisplayName || '') !== String(matches[0].displayName)) return { ok: false, wrote: false, error: '顯示名稱不符，未修改任何綁定', report: report };
  if (opts.expectUserId && opts.expectUserId !== matches[0].userId) return { ok: false, wrote: false, error: 'userId 不符，未修改', report: report };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    values = sh.getDataRange().getValues();
    var row = 0;
    var still = 0;
    for (var r = 1; r < values.length; r++) if (values[r][2] === saint) { still++; row = r + 1; }
    if (still !== 1) return { ok: false, wrote: false, error: '綁定筆數已變，已中止' };
    if (String(values[row - 1][1] || '') !== String(opts.expectDisplayName || '')) return { ok: false, wrote: false, error: '顯示名稱不符，未修改任何綁定' };
    if (opts.op === 'transfer') {
      var to = String(opts.toUserId || '');
      if (!to) return { ok: false, wrote: false, error: '缺少目標 userId' };
      if (to === values[row - 1][0]) return { ok: false, wrote: false, error: '目標與目前相同' };
      for (var j = 1; j < values.length; j++) if (values[j][0] === to) return { ok: false, wrote: false, error: '目標 LINE 已有綁定，拒絕搶身分' };
      sh.getRange(row, 1).setValue(to);
      if (opts.toDisplayName) sh.getRange(row, 2).setValue(opts.toDisplayName);
      sh.getRange(row, 4).setValue(new Date());
      sh.getRange(row, 5).setValue('saint');
      logRepair_(ss, 'transfer', saint, opts.expectDisplayName, '已改綁，認領保留 ' + claims.length);
      return { ok: true, wrote: true, dryRun: false, op: 'transfer', claimsPreserved: true, claimCount: claims.length, visitCount: visitCount };
    }
    sh.deleteRow(row);
    logRepair_(ss, 'release', saint, opts.expectDisplayName, '已解除這一筆綁定，認領保留 ' + claims.length + '，回訪未刪');
    return { ok: true, wrote: true, dryRun: false, op: 'release', claimsPreserved: true, claimCount: claims.length, visitCount: visitCount };
  } finally { lock.releaseLock(); }
}
function claimsOfSaint_(ss, saint) {
  var all = readAll_(ss), out = [];
  CONFIG.TABS.forEach(function (t) {
    (all[t] || []).forEach(function (p) { if (p.by === saint) out.push({ key: p.key, name: p.name, tab: t }); });
  });
  return out;
}
function logRepair_(ss, op, saint, displayName, note) {
  var sh = ss.getSheetByName(CONFIG.REPAIR_TAB);
  if (!sh) { sh = ss.insertSheet(CONFIG.REPAIR_TAB); sh.appendRow(['時間', '操作', '聖徒', '顯示名稱', '說明']); }
  sh.appendRow([new Date(), op, saint, displayName, note]);
}
function adminBindingDryRun() {
  var props = PropertiesService.getScriptProperties();
  var saint = props.getProperty('REPAIR_SAINT');
  if (!saint) throw new Error('請先設定指令碼屬性 REPAIR_SAINT（只填一位）');
  var res = repairBinding_(openSs_(), {
    mode: 'dry-run', op: props.getProperty('REPAIR_OP') || 'release', saint: saint,
    expectDisplayName: props.getProperty('REPAIR_DISPLAY_NAME') || ''
  });
  Logger.log('綁定 dry-run wrote=' + res.wrote + ' claim=' + (res.report && res.report.claimCount) + ' visit=' + (res.report && res.report.visitCount) + ' display=' + (res.report && res.report.displayName) + (res.error ? ' error=' + res.error : ''));
  return res;
}
function restoreDryRun() {
  var id = PropertiesService.getScriptProperties().getProperty('RESTORE_BACKUP_ID');
  if (!id) throw new Error('請設定 RESTORE_BACKUP_ID（遷移確認回傳的 backupId）');
  var res = restoreBackup_(openSs_(), id, { confirm: false });
  Logger.log('回復 dry-run wrote=' + res.wrote + ' sheets=' + ((res.sheets || []).length) + (res.error ? ' error=' + res.error : ''));
  return res;
}
function restoreConfirm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('RESTORE_CONFIRM') !== '確認回復') {
    logActionResult_('restoreConfirm', { ok: false, wrote: false, stage: 'confirm-text', error: '確認文字不符，未刪除旗標，未寫入' });
    throw new Error('請先 dry-run，再把 RESTORE_CONFIRM 設為「確認回復」');
  }
  props.deleteProperty('RESTORE_CONFIRM');
  var id = props.getProperty('RESTORE_BACKUP_ID');
  if (!id) {
    logActionResult_('restoreConfirm', { ok: false, wrote: false, stage: 'backup-id', error: '沒有備份編號，未寫入' });
    throw new Error('請設定 RESTORE_BACKUP_ID');
  }
  var res = restoreBackup_(openSs_(), id, { confirm: true, confirmText: '確認回復' });
  res.stage = res.wrote ? 'wrote' : 'restore';
  logActionResult_('restoreConfirm', res);
  return res;
}
function mergeDryRun() {
  var props = PropertiesService.getScriptProperties();
  return mergePeople_(openSs_(), { keepId: props.getProperty('MERGE_KEEP_ID') || '', mergeId: props.getProperty('MERGE_ID') || '' });
}
function mergeConfirm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MERGE_CONFIRM') !== '確認合併') {
    logActionResult_('mergeConfirm', { ok: false, wrote: false, stage: 'confirm-text', error: '確認文字不符，未刪除旗標，未寫入' });
    throw new Error('請先 dry-run，再把 MERGE_CONFIRM 設為「確認合併」');
  }
  props.deleteProperty('MERGE_CONFIRM');
  var res = mergePeople_(openSs_(), { keepId: props.getProperty('MERGE_KEEP_ID') || '', mergeId: props.getProperty('MERGE_ID') || '', confirm: true, confirmText: '確認合併' });
  res.stage = res.wrote ? 'wrote' : 'merge';
  logActionResult_('mergeConfirm', res);
  return res;
}
function adminBindingConfirm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('REPAIR_CONFIRM') !== '確認修復') {
    logActionResult_('adminBindingConfirm', { ok: false, wrote: false, stage: 'confirm-text', error: '確認文字不符，未刪除旗標，未寫入' });
    throw new Error('請先做 dry-run，再把 REPAIR_CONFIRM 設為「確認修復」');
  }
  props.deleteProperty('REPAIR_CONFIRM');
  var op = props.getProperty('REPAIR_OP') || 'release';
  var res = repairBinding_(openSs_(), {
    mode: 'confirm', confirm: true, op: op,
    saint: props.getProperty('REPAIR_SAINT') || '',
    expectDisplayName: props.getProperty('REPAIR_DISPLAY_NAME') || '',
    expectUserId: props.getProperty('REPAIR_EXPECT_USER_ID') || '',
    toUserId: props.getProperty('REPAIR_TO_USER_ID') || '',
    toDisplayName: props.getProperty('REPAIR_TO_DISPLAY_NAME') || ''
  });
  res.stage = res.wrote ? 'wrote' : 'repair';
  logActionResult_('adminBindingConfirm', { ok: res.ok, wrote: res.wrote, stage: res.stage, error: res.ok ? '' : '未寫入' });
  return res;
}

function today_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd'); }
function dayStr_(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd');
  var m = String(v).trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function dayNum_(s) { var p = String(s).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
function numDay_(n) { var d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
function md_(s) { var p = String(s).split('-'); return (+p[1]) + '/' + (+p[2]); }
var WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
function weekday_(s) { return WEEKDAY[(dayNum_(s) + 4) % 7]; }
function isRunWeekday_(wch) { return CONFIG.RUN_DAYS.indexOf(wch) >= 0; }
function nextRunDay_(today) {
  var n = dayNum_(today);
  for (var add = 1; add <= 7; add++) {
    var w = WEEKDAY[(n + add + 4) % 7];
    if (isRunWeekday_(w)) return numDay_(n + add);
  }
  throw new Error('找不到下一個推播日');
}
function weekStart_(today) { var n = dayNum_(today), w = (n + 4) % 7; return numDay_(n - ((w + 6) % 7)); }

function normalizeName_(name) {
  var s = String(name == null ? '' : name);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  return s.trim();
}
function attendanceCount_(v) {
  if (v == null || v === '') return { ok: true, n: 0 };
  if (typeof v === 'number' && isFinite(v)) return { ok: true, n: v };
  var s = String(v).trim();
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  var frac = s.match(/^(\d+)\s*\/\s*43$/);
  if (frac) return { ok: true, n: Number(frac[1]) };
  if (/^\d+$/.test(s)) return { ok: true, n: Number(s) };
  return { ok: false, n: 0 };
}
function absenceWeeks_(v) {
  if (v == null || v === '') return { ok: true, n: 0 };
  if (typeof v === 'number' && isFinite(v)) return { ok: true, n: v };
  var s = String(v).trim();
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  if (/^\d+$/.test(s)) return { ok: true, n: Number(s) };
  return { ok: false, n: 0 };
}
function classifyVerified_(att, absent) {
  var a = Number(att), b = Number(absent);
  if (!isFinite(a) || !isFinite(b)) return '';
  if (a <= 0) return 'D';
  if (b <= 1) return 'B';
  if (b <= 12) return 'A';
  return 'C';
}
function reviewNameKey_(name) {
  var s = normalizeName_(name).replace(/[\s\u3000]+/g, '');
  var prev;
  do {
    prev = s;
    s = s.replace(/[-_－＿]*\d+$/, '');
  } while (s !== prev);
  return s;
}
function nameGroupStats_(keys) {
  var map = {}, groups = 0, rows = 0;
  keys.forEach(function (k) { map[k] = (map[k] || 0) + 1; });
  Object.keys(map).forEach(function (k) { if (map[k] > 1) { groups++; rows += map[k]; } });
  return { groups: groups, rows: rows };
}
function weeksAllZero_(weeks) {
  if (!weeks || weeks.length !== 43) return false;
  for (var i = 0; i < weeks.length; i++) if (!(weeks[i] === '' || weeks[i] == null || Number(weeks[i]) === 0)) return false;
  return true;
}
function sourceKey_(district, tab, row) { return district + '|' + tab + '|' + row; }
function idPart_(norm) { return String(norm).replace(/\|/g, '｜'); }

function readLegacy_(ss) {
  var out = {};
  CONFIG.TABS.forEach(function (t) {
    var sh = ss.getSheetByName(t);
    out[t] = [];
    if (!sh || sh.getLastRow() < 2) return;
    var n = sh.getLastRow();
    var v = sh.getRange(2, 1, n - 1, CONFIG.CLAIM_COL).getValues();
    var ids = [];
    try { ids = sh.getRange(2, CONFIG.STABLE_COL, n - 1, 1).getValues(); } catch (e) { ids = []; }
    v.forEach(function (r, i) {
      if (!r[0]) return;
      var stable = ids[i] ? ids[i][0] : '';
      out[t].push({
        key: stable || (t + '|' + (i + 2)), stableId: stable || '', legacyKey: t + '|' + (i + 2),
        name: r[0], group: r[1], att: r[2], absent: r[3], by: r[4] || '',
        tier: CONFIG.TIER[t], tab: t, district: t === '待核實' ? '' : '2-4',
        attendanceStatus: t === '待核實' ? 'pending' : 'verified', row: i + 2, active: 'Y', mergedInto: ''
      });
    });
  });
  return out;
}
function indexObjects_(ss) {
  var sh = ss.getSheetByName(CONFIG.INDEX_TAB);
  if (!sh || sh.getLastRow() < 2) return null;
  return objectsFromGrid_(sh.getDataRange().getValues());
}
function objectsFromGrid_(grid) {
  if (!grid || !grid.length) return [];
  var h = grid[0].map(function (x) { return String(x == null ? '' : x).trim(); });
  var out = [];
  for (var i = 1; i < grid.length; i++) {
    var o = { __row: i + 1 };
    var any = false;
    for (var c = 0; c < h.length; c++) {
      o[h[c]] = grid[i][c];
      if (grid[i][c] !== '' && grid[i][c] != null) any = true;
    }
    if (any) out.push(o);
  }
  return out;
}
function personFromIndex_(o) {
  var tab = o['分頁'] || '待核實';
  return {
    key: o['穩定ID'], stableId: o['穩定ID'], legacyKey: o['舊資料鍵'] || '',
    sourceKey: o['來源鍵'] || '', district: o['來源區'] || '', tier: o['分級'] || CONFIG.TIER[tab] || '',
    tab: tab, row: Number(o['列號']) || 0, name: o['姓名'], norm: o['正規化姓名'] || normalizeName_(o['姓名']),
    seq: Number(o['同名序']) || 0, group: o['群組'] || '', area: o['大區'] || '', small: o['小區'] || '', rank: o['排'] || '',
    att: o['出席'], absent: o['缺席'], attendanceStatus: o['出席狀態'] || 'verified', by: o['認領者'] || '',
    sourceTab: o['來源表'] || '', sourceRow: Number(o['來源列']) || 0, active: o['有效'] || 'Y', mergedInto: o['併入'] || ''
  };
}
function readAll_(ss) {
  var idx = indexObjects_(ss);
  if (!idx) return readLegacy_(ss);
  var out = {};
  CONFIG.TABS.forEach(function (t) { out[t] = []; });
  idx.forEach(function (o) {
    var p = personFromIndex_(o);
    if (p.active === 'N' || p.mergedInto) return;
    if (!out[p.tab]) out[p.tab] = [];
    out[p.tab].push(p);
  });
  return out;
}
function listPeople_(ss) {
  var all = readAll_(ss), out = [];
  Object.keys(all).forEach(function (t) { (all[t] || []).forEach(function (p) { out.push(p); }); });
  return out;
}
function allIndexPeople_(ss) {
  var idx = indexObjects_(ss);
  if (!idx) return listPeople_(ss);
  return idx.map(personFromIndex_);
}

function resolvePerson_(ss, key) {
  var all = allIndexPeople_(ss);
  var hit = [];
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    if (p.stableId === key || p.legacyKey === key || p.key === key) hit.push(p);
  }
  if (indexObjects_(ss)) {
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) throw new Error('資料鍵對到多筆');
    throw new Error('資料鍵無效');
  }
  var parsed = parseLegacyKey_(key);
  var sh = ss.getSheetByName(parsed.tab);
  if (!sh || parsed.row > sh.getLastRow()) throw new Error('資料鍵無效');
  var r = sh.getRange(parsed.row, 1, 1, CONFIG.STABLE_COL).getValues()[0];
  return {
    key: key, stableId: r[5] || '', legacyKey: key, name: r[0], group: r[1], att: r[2], absent: r[3], by: r[4] || '',
    tab: parsed.tab, row: parsed.row, tier: CONFIG.TIER[parsed.tab],
    attendanceStatus: parsed.tab === '待核實' ? 'pending' : 'verified', district: parsed.tab === '待核實' ? '' : '2-4',
    active: 'Y', mergedInto: ''
  };
}
function parseLegacyKey_(key) {
  var k = String(key).split('|'), row = parseInt(k[1], 10);
  if (k.length !== 2 || CONFIG.TABS.indexOf(k[0]) < 0 || !(row >= 2)) throw new Error('資料鍵無效');
  return { tab: k[0], row: row };
}
function locateRow_(sh, person) {
  if (!sh) return 0;
  var last = sh.getLastRow();
  if (person.stableId && last >= 2) {
    var ids = sh.getRange(2, CONFIG.STABLE_COL, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (ids[i][0] === person.stableId) return i + 2;
  }
  if (person.row && person.row <= last) {
    var r = sh.getRange(person.row, 1, 1, CONFIG.STABLE_COL).getValues()[0];
    if (r[0] === person.name && (!person.stableId || !r[5] || r[5] === person.stableId)) return person.row;
  }
  return 0;
}
function writeClaimCell_(ss, person, value) {
  var sh = ss.getSheetByName(person.tab);
  var row = locateRow_(sh, person);
  if (!row) return;
  var name = sh.getRange(row, 1).getValues()[0][0];
  if (name !== person.name) return;
  sh.getRange(row, CONFIG.CLAIM_COL).setValue(value);
  if (person.stableId) sh.getRange(row, CONFIG.STABLE_COL).setValue(person.stableId);
}
function updateIndexClaim_(ss, stableId, value) {
  var sh = ss.getSheetByName(CONFIG.INDEX_TAB);
  if (!sh || !stableId || sh.getLastRow() < 2) return;
  var grid = sh.getDataRange().getValues();
  var col = grid[0].indexOf('認領者');
  var idCol = grid[0].indexOf('穩定ID');
  if (col < 0 || idCol < 0) return;
  for (var i = 1; i < grid.length; i++) if (grid[i][idCol] === stableId) sh.getRange(i + 1, col + 1).setValue(value);
}
function submit_(ss, saint, claims, releases) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var done = [], conflicts = [], released = [];
  try {
    releases.forEach(function (c) {
      var p = resolvePerson_(ss, c.key);
      if (p.name !== c.name) { conflicts.push({ key: c.key, name: c.name, reason: '資料已變動' }); return; }
      if (p.by === saint) {
        writeClaimCell_(ss, p, '');
        updateIndexClaim_(ss, p.stableId, '');
        released.push(p.stableId || c.key);
      }
    });
    claims.forEach(function (c) {
      var p = resolvePerson_(ss, c.key);
      if (p.name !== c.name) { conflicts.push({ key: c.key, name: c.name, reason: '資料已變動' }); return; }
      if (p.active === 'N') { conflicts.push({ key: c.key, name: c.name, reason: '這筆已合併，不能認領' }); return; }
      if (p.by && p.by !== saint) { conflicts.push({ key: c.key, name: c.name, reason: '已被 ' + p.by + ' 認領' }); return; }
      writeClaimCell_(ss, p, saint);
      updateIndexClaim_(ss, p.stableId, saint);
      done.push(p.stableId || c.key);
    });
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok: true, claimed: done, released: released, conflicts: conflicts, data: readAll_(ss) };
}

function visitSheet_(ss) {
  var sh = ss.getSheetByName(CONFIG.VISIT_TAB);
  if (!sh) { sh = ss.insertSheet(CONFIG.VISIT_TAB); sh.appendRow(VISIT_HEADER); }
  return sh;
}
function readVisits_(ss) {
  var sh = ss.getSheetByName(CONFIG.VISIT_TAB);
  if (!sh) return [];
  var v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (!r[3]) continue;
    out.push({ row: i + 1, ts: r[0], saint: r[1], tab: r[2], name: r[3], date: dayStr_(r[4]), method: r[5], status: r[6], note: r[7], key: r[8] || '', oldKey: r[9] || '' });
  }
  return out;
}
function aliasKeys_(ss, p) {
  var ids = {};
  if (p.stableId) ids[p.stableId] = 1;
  if (p.legacyKey) ids[p.legacyKey] = 1;
  if (p.key) ids[p.key] = 1;
  allIndexPeople_(ss).forEach(function (x) {
    if (x.mergedInto && x.mergedInto === p.stableId) {
      if (x.stableId) ids[x.stableId] = 1;
      if (x.legacyKey) ids[x.legacyKey] = 1;
    }
  });
  return ids;
}
function sameVisit_(rec, p, ids) {
  if (rec.key && ids && ids[rec.key]) return true;
  if (rec.key) return false;
  return rec.name === p.name && rec.tab === p.tab;
}
function visitStatus_(p, recs, today, ids) {
  var mine = recs.filter(function (r) { return sameVisit_(r, p, ids) && r.date; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  var last = mine.length ? mine[0] : null;
  var history = mine.slice(0, 5).map(function (r) { return { date: r.date, saint: r.saint, method: r.method, status: r.status, note: r.note }; });
  if (p.attendanceStatus === 'pending' || p.tab === '待核實' || p.tier === '待核實') {
    return { last: last ? last.date : '', lastStatus: last ? last.status : '', due: '', never: !last, overdue: -9999, cycle: null, pending: true, remind: false, history: history };
  }
  var cycle = CONFIG.CYCLE[p.tab];
  var due = last ? numDay_(dayNum_(last.date) + cycle) : today;
  return { last: last ? last.date : '', lastStatus: last ? last.status : '', due: due, never: !last, overdue: dayNum_(today) - dayNum_(due), cycle: cycle, pending: false, remind: true, history: history };
}
function claimedBy_(ss, saint) {
  var out = [];
  listPeople_(ss).forEach(function (p) { if (!saint || p.by === saint) out.push(p); });
  return out;
}
function myVisits_(ss, saint) {
  visitSheet_(ss);
  var today = today_(), recs = readVisits_(ss);
  return claimedBy_(ss, saint).map(function (p) {
    var s = visitStatus_(p, recs, today, aliasKeys_(ss, p));
    for (var k in s) p[k] = s[k];
    return p;
  }).sort(function (a, b) { return b.overdue - a.overdue || (a.name < b.name ? -1 : 1); });
}
function cleanText_(s, max) {
  s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function record_(ss, saint, req) {
  var p = resolvePerson_(ss, req.key);
  if (CONFIG.METHODS.indexOf(req.method) < 0) throw new Error('請選擇回訪方式');
  if (CONFIG.STATUSES.indexOf(req.status) < 0) throw new Error('請選擇狀況');
  var date = dayStr_(req.date), today = today_();
  if (!date || date !== String(req.date)) throw new Error('回訪日期格式不正確');
  if (date > today) throw new Error('回訪日期不能是未來');
  if (dayNum_(today) - dayNum_(date) > 365) throw new Error('回訪日期太久以前');
  var note = cleanText_(req.note, 200);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    p = resolvePerson_(ss, req.key);
    if (p.name !== req.name) return { ok: false, error: '資料已變動，請重新整理' };
    if (p.by !== saint) return { ok: false, error: '這位不是您認領的，無法填寫' };
    var row = [new Date(), saint, p.tab, req.name, date, req.method, req.status, note, p.stableId || req.key];
    if (p.legacyKey && p.legacyKey !== (p.stableId || req.key)) row.push(p.legacyKey);
    visitSheet_(ss).appendRow(row);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok: true, today: today, people: myVisits_(ss, saint) };
}

function sheetValues_(sh) {
  if (!sh || !sh.getLastRow()) return [];
  return sh.getDataRange().getValues();
}
function writeGrid_(sh, grid) {
  sh.clear();
  if (!grid || !grid.length) return;
  var cols = 0;
  grid.forEach(function (r) { if (r.length > cols) cols = r.length; });
  var padded = grid.map(function (r) { var x = r.slice(); while (x.length < cols) x.push(''); return x; });
  sh.getRange(1, 1, padded.length, cols).setValues(padded);
}
function backupAll_(ss) {
  var id = today_().replace(/-/g, '') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var names = [];
  BACKUP_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var dest = ss.insertSheet('備份_' + id + '__' + name);
    writeGrid_(dest, sheetValues_(sh));
    names.push(name);
  });
  var man = ss.insertSheet('備份清單_' + id);
  var grid = [['原分頁', '備份分頁']];
  names.forEach(function (n) { grid.push([n, '備份_' + id + '__' + n]); });
  writeGrid_(man, grid);
  return { ok: true, backupId: id, sheets: names };
}
function restoreBackup_(ss, backupId, opts) {
  var man = ss.getSheetByName('備份清單_' + backupId);
  if (!man) return { ok: false, wrote: false, error: '找不到這次備份' };
  var rows = man.getDataRange().getValues().slice(1);
  var plan = rows.map(function (r) { return { name: r[0], backup: r[1] }; }).filter(function (x) { return x.name && x.backup; });
  if (!opts || opts.confirm !== true || opts.confirmText !== '確認回復') return { ok: true, dryRun: true, wrote: false, backupId: backupId, sheets: plan.map(function (p) { return p.name; }) };
  plan.forEach(function (p) {
    var src = ss.getSheetByName(p.backup);
    if (!src) throw new Error('備份分頁遺失：' + p.backup);
    var dest = ss.getSheetByName(p.name);
    if (!dest) dest = ss.insertSheet(p.name);
    writeGrid_(dest, sheetValues_(src));
  });
  return { ok: true, wrote: true, dryRun: false, backupId: backupId, sheets: plan.map(function (p) { return p.name; }) };
}

function parseAttendanceGrid_(grid, district) {
  if (!grid || grid.length < 3) throw new Error(district + ' 出席表不足三列');
  var header = grid[2].map(function (x) { return String(x == null ? '' : x).trim(); });
  for (var c = 0; c < ATTENDANCE_HEADER.length; c++) {
    if (header[c] !== ATTENDANCE_HEADER[c]) throw new Error(district + ' 表頭不符：第 ' + (c + 1) + ' 欄應為「' + ATTENDANCE_HEADER[c] + '」');
  }
  for (var w = 0; w < WEEK_HEADERS.length; w++) {
    var got = dayStr_(header[10 + w]);
    if (got !== WEEK_HEADERS[w]) throw new Error(district + ' 週次表頭不符，第 ' + (w + 1) + ' 週應為 ' + WEEK_HEADERS[w]);
  }
  var rows = [];
  for (var r = 3; r < grid.length; r++) {
    var raw = grid[r][1];
    if (raw == null || String(raw).trim() === '') continue;
    var weeks = [];
    for (var k = 0; k < 43; k++) weeks.push(grid[r][10 + k]);
    var att = attendanceCount_(grid[r][6]), abs = absenceWeeks_(grid[r][9]);
    if (!att.ok || !abs.ok) throw new Error(district + ' 原始出席的「出席」或「缺席週」無法解析（出席應為次數或「次數 / 43」，缺席週應為整數）。已停止，沒有改判為 D');
    rows.push({
      sourceRow: r + 1, name: String(raw).trim(), rawName: String(raw), group: grid[r][5] == null ? '' : grid[r][5],
      area: grid[r][2] == null ? '' : grid[r][2], small: grid[r][3] == null ? '' : grid[r][3], rank: grid[r][4] == null ? '' : grid[r][4],
      att: att.n, absent: abs.n, weeks: weeks, district: district, allZero: weeksAllZero_(weeks)
    });
  }
  return rows;
}
function sigOf_(tier, name, group, att, absent) {
  return [tier, String(name), String(group), String(att), String(absent)].join('||');
}
function activeManifest_() {
  var raw = PropertiesService.getScriptProperties().getProperty('MIGRATION_MANIFEST_JSON');
  if (!raw) return ROSTER_MANIFEST_V1;
  try {
    var m = JSON.parse(raw);
    if (!m || !(m.manifestVersion >= 1) || !m.districts || !m.id) return { invalid: true, error: 'MIGRATION_MANIFEST_JSON 格式不對，已停止' };
    var gates = m.gates || [];
    if (gates.indexOf('claims') >= 0 || gates.indexOf('visits') >= 0) return { invalid: true, error: 'manifest 不可把認領或回訪人數當成門檻，已停止' };
    return m;
  } catch (e) { return { invalid: true, error: 'MIGRATION_MANIFEST_JSON 無法解析，已停止' }; }
}
function structureMismatches_(counts, manifest) {
  if (!manifest) return [];
  if (manifest.invalid) return [manifest.error];
  var bad = [], d = counts['2-4'] || {}, e = manifest.districts || {}, e24 = e['2-4'] || {};
  if (d.A !== e24.A || d.B !== e24.B || d.C !== e24.C || d.D !== e24.D || d.total !== e24.total) bad.push('名單結構與 manifest ' + manifest.id + ' 的 2-4 不符，已停止且不會寫入');
  if (counts['2-6'] !== (e['2-6'] || {}).total) bad.push('名單結構與 manifest 的 2-6 不符：現況 ' + counts['2-6'] + '，manifest ' + (e['2-6'] || {}).total + '，已停止');
  if (counts['2-7'] !== (e['2-7'] || {}).total) bad.push('名單結構與 manifest 的 2-7 不符：現況 ' + counts['2-7'] + '，manifest ' + (e['2-7'] || {}).total + '，已停止');
  if (manifest.candidates != null && counts.candidates !== manifest.candidates) bad.push('候選人數與 manifest ' + manifest.id + ' 不符：現況 ' + counts.candidates + '，manifest ' + manifest.candidates + '，已停止且不會寫入');
  if (manifest.sameNameGroups != null && (counts.sameNameGroups !== manifest.sameNameGroups || counts.sameNameRows !== manifest.sameNameRows)) bad.push('精確同名（NFKC 後只去首尾空白；去全部空白結果相同）應為 ' + manifest.sameNameGroups + ' 組 ' + manifest.sameNameRows + ' 列，現況 ' + counts.sameNameGroups + ' 組 ' + counts.sameNameRows + ' 列，已停止且不會自動合併');
  if (manifest.reviewNameGroups != null && (counts.reviewNameGroups !== manifest.reviewNameGroups || counts.reviewNameRows !== manifest.reviewNameRows)) bad.push('擴大同名候選（NFKC、去全部空白，再去尾端數字及相鄰連字號或底線）應為 ' + manifest.reviewNameGroups + ' 組 ' + manifest.reviewNameRows + ' 列，現況 ' + counts.reviewNameGroups + ' 組 ' + counts.reviewNameRows + ' 列，已停止且不會自動合併');
  if (counts.pendingAsD) bad.push('新區不可判為 D');
  if (counts.pendingNotPending) bad.push('新區出席狀態必須是待核實');
  return bad;
}
function mismatchesAgainstExpected_(counts) { return structureMismatches_(counts, ROSTER_MANIFEST_V1); }
function liveDelta_(counts, manifest) {
  var rc = manifest && manifest.referenceClaims, rv = manifest && manifest.referenceVisits;
  var note = '認領現況 ' + counts.claims + '、回訪現況 ' + counts.visits + '。';
  if (!manifest) return { claims: counts.claims, visits: counts.visits, note: note };
  note += (manifest.asOf || manifest.id) + ' 的參考認領 ' + rc + '、參考回訪 ' + rv + ' 只供對照，不是上限，也不會寫回正式表。';
  if (rc != null && counts.claims > rc) note += '認領比參考多，多出來的全部保留。';
  if (rc != null && counts.claims < rc) note += '認領比參考少，請確認是取消而不是遺失；程式不會把參考值寫回去。';
  if (rv != null && counts.visits > rv) note += '回訪比參考多，全部保留。';
  if (rv != null && counts.visits < rv) note += '回訪比參考少，請確認沒有漏讀；程式不會刪除或回寫參考筆數。';
  return { claims: counts.claims, visits: counts.visits, referenceClaims: rc, referenceVisits: rv, note: note };
}
function buildMigrationPlan_(input) {
  input = input || {};
  var errors = [], warnings = (input.warnings || []).slice();
  var existing = input.existingIndex || [];
  var bySource = {}, byLegacy = {}, seqMax = {};
  existing.forEach(function (e) {
    if (e.sourceKey) bySource[e.sourceKey] = e;
    if (e.legacyKey) byLegacy[e.legacyKey] = e;
    var nk = (e.district || '') + '|' + (e.norm || '');
    seqMax[nk] = Math.max(seqMax[nk] || 0, Number(e.seq) || 0);
  });
  function nextId(district, norm) {
    var nk = district + '|' + norm;
    var seq = (seqMax[nk] || 0) + 1;
    seqMax[nk] = seq;
    return { id: district + '|' + idPart_(norm) + '|' + seq, seq: seq };
  }
  var legacy = input.legacy || {};
  var legacyPeople = [], badAttend = 0, badLegacy = 0;
  LEGACY_TABS.forEach(function (tab) {
    (legacy[tab] || []).forEach(function (r) {
      if (!r.name) return;
      var attL = attendanceCount_(r.att), absL = absenceWeeks_(r.absent);
      if (!attL.ok || !absL.ok) badLegacy++;
      legacyPeople.push({
        legacyKey: tab + '|' + r.row, tab: tab, tier: CONFIG.TIER[tab], row: r.row,
        name: String(r.name).trim(), rawName: String(r.name), norm: normalizeName_(r.name), group: r.group,
        att: attL.ok ? attL.n : r.att, absent: absL.ok ? absL.n : r.absent, by: r.by || ''
      });
    });
  });
  if (badLegacy) errors.push('正式 A/C/D 有 ' + badLegacy + ' 列的出席次數或連續缺席週數無法解析，已停止');
  var src24 = (input.source24 || []).map(function (r) {
    var att = attendanceCount_(r.att), abs = absenceWeeks_(r.absent);
    if (!att.ok || !abs.ok) { badAttend++; return null; }
    var tier = classifyVerified_(att.n, abs.n);
    return {
      sourceRow: r.sourceRow, name: String(r.name).trim(), rawName: r.rawName != null ? String(r.rawName) : String(r.name),
      norm: normalizeName_(r.name), group: r.group, att: att.n, absent: abs.n,
      area: r.area || '', small: r.small || '', rank: r.rank || '', tier: tier, weeks: r.weeks || []
    };
  }).filter(function (r) { return r; });
  if (badAttend) errors.push('2-4 原始出席有 ' + badAttend + ' 列的「出席」或「缺席週」無法解析，已停止，沒有把這些列改判為 D');
  var srcCount = { A: 0, B: 0, C: 0, D: 0 };
  src24.forEach(function (r) { srcCount[r.tier]++; });
  var legCount = { A: (legacy['A 優先'] || []).filter(function (r) { return r.name; }).length, C: (legacy['C 近期斷線'] || []).filter(function (r) { return r.name; }).length, D: (legacy['D 全年未出席'] || []).filter(function (r) { return r.name; }).length };
  if (src24.length && (srcCount.A !== legCount.A || srcCount.C !== legCount.C || srcCount.D !== legCount.D)) {
    errors.push('2-4 原始出席分級與正式分頁不一致：來源 A' + srcCount.A + ' C' + srcCount.C + ' D' + srcCount.D + '，正式分頁 A' + legCount.A + ' C' + legCount.C + ' D' + legCount.D + '，已停止');
  }
  var buckets = {}, legBuckets = {};
  src24.forEach(function (r) { if (r.tier === 'B') return; var s = sigOf_(r.tier, r.name, r.group, r.att, r.absent); (buckets[s] = buckets[s] || []).push(r); });
  legacyPeople.forEach(function (p) { var s = sigOf_(p.tier, p.name, p.group, p.att, p.absent); (legBuckets[s] = legBuckets[s] || []).push(p); });
  var link = {}, sigMismatch = 0, sigMismatchRows = 0;
  Object.keys(legBuckets).forEach(function (s) {
    var Ls = legBuckets[s], Rs = buckets[s] || [];
    if (!src24.length) return;
    if (Ls.length !== Rs.length) { sigMismatch++; sigMismatchRows += Math.abs(Ls.length - Rs.length); return; }
    if (Ls.length === 1) link[Ls[0].legacyKey] = Rs[0];
    else warnings.push('同簽名 ' + Ls.length + ' 筆保留原列，不依排序猜測來源列');
  });
  var unmatched = { A: 0, C: 0, D: 0 };
  if (src24.length) Object.keys(buckets).forEach(function (s) {
    if (legBuckets[s]) return;
    var tier = s.split('||')[0];
    if (unmatched[tier] != null) unmatched[tier] += buckets[s].length;
  });
  if (sigMismatch) errors.push('同簽名群組 ' + sigMismatch + ' 組人數不一致（列差合計 ' + sigMismatchRows + '），已停止，沒有依姓名配對');
  if (unmatched.A || unmatched.C || unmatched.D) errors.push('原始出席有正式分頁沒有的簽名：A ' + unmatched.A + '、C ' + unmatched.C + '、D ' + unmatched.D + '，已停止');
  var people = [];
  function freeze(district, norm, legacyKey, sourceKey) {
    var prev = (legacyKey && byLegacy[legacyKey]) || (sourceKey && bySource[sourceKey]);
    if (prev && prev.stableId) return { id: prev.stableId, seq: Number(prev.seq) || 0 };
    return nextId(district, norm);
  }
  legacyPeople.forEach(function (p) {
    var src = link[p.legacyKey];
    var sk = src ? sourceKey_('2-4', '原始出席', src.sourceRow) : sourceKey_('2-4', p.tab, p.row);
    var id = freeze('2-4', p.norm, p.legacyKey, sk);
    people.push({
      stableId: id.id, seq: id.seq, legacyKey: p.legacyKey, sourceKey: sk, district: '2-4', tier: p.tier, tab: p.tab, row: p.row,
      name: p.name, norm: p.norm, group: p.group, att: p.att, absent: p.absent, by: p.by, attendanceStatus: 'verified',
      area: src ? src.area : '', small: src ? src.small : '', rank: src ? src.rank : '',
      sourceTab: src ? '原始出席' : p.tab, sourceRow: src ? src.sourceRow : p.row, active: 'Y', mergedInto: ''
    });
  });
  if (!input.sourceB) {
    src24.filter(function (r) { return r.tier === 'B'; }).sort(function (a, b) { return a.sourceRow - b.sourceRow; }).forEach(function (r) {
      var sk = sourceKey_('2-4', '原始出席', r.sourceRow);
      var prev = bySource[sk];
      var id = freeze('2-4', r.norm, '', sk);
      people.push({
        stableId: id.id, seq: id.seq, legacyKey: '', sourceKey: sk, district: '2-4', tier: 'B', tab: 'B 穩定', row: 0,
        name: r.name, norm: r.norm, group: r.group, att: r.att, absent: r.absent, by: prev && prev.by ? prev.by : '', attendanceStatus: 'verified',
        area: r.area, small: r.small, rank: r.rank, sourceTab: '原始出席', sourceRow: r.sourceRow, active: 'Y', mergedInto: ''
      });
    });
  }
  (input.sourceB || []).slice().sort(function (a, b) { return a.sourceRow - b.sourceRow; }).forEach(function (r) {
    var norm = normalizeName_(r.name);
    var sk = sourceKey_('2-4', 'B 穩定', r.sourceRow);
    var prev = bySource[sk];
    var id = freeze('2-4', norm, '', sk);
    people.push({
      stableId: id.id, seq: id.seq, legacyKey: '', sourceKey: sk, district: '2-4', tier: 'B', tab: 'B 穩定', row: 0,
      name: String(r.name).trim(), norm: norm, group: r.group, att: r.att, absent: r.absent, by: prev && prev.by ? prev.by : '', attendanceStatus: 'verified',
      area: r.area || '', small: r.small || '', rank: r.rank || '', sourceTab: 'B 穩定', sourceRow: r.sourceRow, active: 'Y', mergedInto: ''
    });
  });
  function addPending(rows, district) {
    (rows || []).slice().sort(function (a, b) { return a.sourceRow - b.sourceRow; }).forEach(function (r) {
      var norm = normalizeName_(r.name);
      var sk = sourceKey_(district, '出席', r.sourceRow);
      var prev = bySource[sk];
      var id = freeze(district, norm, '', sk);
      if (!r.allZero && r.weeks) warnings.push(district + ' 第 ' + r.sourceRow + ' 列不是全零，仍標為待核實，不自動分級');
      people.push({
        stableId: id.id, seq: id.seq, legacyKey: '', sourceKey: sk, district: district, tier: '待核實', tab: '待核實', row: 0,
        name: String(r.name).trim(), norm: norm, group: r.group, att: r.att, absent: r.absent, by: prev && prev.by ? prev.by : '', attendanceStatus: 'pending',
        area: r.area || '', small: r.small || '', rank: r.rank || '', sourceTab: '出席', sourceRow: r.sourceRow, active: 'Y', mergedInto: ''
      });
    });
  }
  addPending(input.source26, '2-6');
  addPending(input.source27, '2-7');
  var seenSource = {};
  people = people.filter(function (p) {
    if (seenSource[p.sourceKey]) return false;
    seenSource[p.sourceKey] = 1;
    return true;
  });
  var byLeg = {}, byId = {};
  people.forEach(function (p) { byId[p.stableId] = p; if (p.legacyKey) byLeg[p.legacyKey] = p; });
  var visitMap = [];
  (input.visits || []).forEach(function (v) {
    var p = byLeg[v.key] || byId[v.key];
    if (!p) { errors.push('回訪鍵無法對應'); return; }
    if (String(p.name) !== String(v.name)) { errors.push('回訪鍵姓名不符，拒絕改接'); return; }
    visitMap.push({ oldKey: v.key, name: v.name, stableId: p.stableId, already: v.key === p.stableId });
  });
  var exactKeys = [], nospaceKeys = [], reviewKeys = [];
  people.forEach(function (p) {
    var raw = p.rawName != null ? p.rawName : p.name;
    exactKeys.push(normalizeName_(raw));
    nospaceKeys.push(normalizeName_(raw).replace(/[\s\u3000]+/g, ''));
    reviewKeys.push(reviewNameKey_(raw));
  });
  var exactGroups = nameGroupStats_(exactKeys), nospaceGroups = nameGroupStats_(nospaceKeys), reviewGroups = nameGroupStats_(reviewKeys);
  var groups = {};
  people.forEach(function (p, i) { var k = exactKeys[i]; (groups[k] = groups[k] || []).push(p.stableId); });
  var sameNameGroups = Object.keys(groups).filter(function (k) { return groups[k].length > 1; }).sort().map(function (k) { return { name: k, ids: groups[k] }; });
  var pendingAsD = people.some(function (p) { return (p.district === '2-6' || p.district === '2-7') && p.tier === 'D'; });
  var pendingNotPending = people.some(function (p) { return (p.district === '2-6' || p.district === '2-7') && p.attendanceStatus !== 'pending'; });
  var counts = {
    '2-4': {
      A: people.filter(function (p) { return p.district === '2-4' && p.tier === 'A'; }).length,
      B: people.filter(function (p) { return p.district === '2-4' && p.tier === 'B'; }).length,
      C: people.filter(function (p) { return p.district === '2-4' && p.tier === 'C'; }).length,
      D: people.filter(function (p) { return p.district === '2-4' && p.tier === 'D'; }).length
    },
    '2-6': people.filter(function (p) { return p.district === '2-6'; }).length,
    '2-7': people.filter(function (p) { return p.district === '2-7'; }).length,
    sameNameGroups: exactGroups.groups,
    sameNameRows: exactGroups.rows,
    reviewNameGroups: reviewGroups.groups,
    reviewNameRows: reviewGroups.rows,
    claims: people.filter(function (p) { return p.by; }).length,
    visits: visitMap.length,
    pendingAsD: pendingAsD,
    pendingNotPending: pendingNotPending
  };
  counts['2-4'].total = counts['2-4'].A + counts['2-4'].B + counts['2-4'].C + counts['2-4'].D;
  counts.candidates = people.length;
  var manifest = input.manifest || (input.enforceExpected || input.enforceStructure ? ROSTER_MANIFEST_V1 : null);
  var expectedErrors = manifest ? structureMismatches_(counts, manifest) : [];
  var plan = {
    ok: errors.length === 0 && expectedErrors.length === 0,
    errors: errors.concat(expectedErrors), warnings: warnings, people: people, visitMap: visitMap,
    sameNameGroups: sameNameGroups, counts: counts, wrote: false,
    manifestId: manifest && manifest.id || '',
    liveDelta: manifest ? liveDelta_(counts, manifest) : liveDelta_(counts, null),
    diagnosis: { sourceGrade: srcCount, legacyGrade: legCount, signatureMismatchGroups: sigMismatch, unmatchedAttendance: unmatched, sameNameNoSpace: nospaceGroups }
  };
  plan.fingerprint = planFingerprint_(plan);
  return plan;
}
function planFingerprint_(plan) {
  var lines = (plan.people || []).map(function (p) {
    return [p.stableId, p.legacyKey, p.sourceKey, p.name, p.by, p.tier, p.district, p.attendanceStatus].join('\t');
  }).sort();
  var vs = (plan.visitMap || []).map(function (v) { return v.oldKey + '\t' + v.name + '\t' + v.stableId; }).sort();
  var s = lines.join('\n') + '\n--\n' + vs.join('\n');
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return ('00000000' + h.toString(16)).slice(-8) + '-' + (plan.people || []).length + '-' + (plan.visitMap || []).length;
}
function readLegacyRows_(ss) {
  var out = {};
  LEGACY_TABS.forEach(function (tab) {
    out[tab] = [];
    var sh = ss.getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2) return;
    var header = sh.getRange(1, 1, 1, 8).getValues()[0].map(function (x) { return String(x == null ? '' : x).trim(); });
    function colOf_(names) { for (var n = 0; n < names.length; n++) { var at = header.indexOf(names[n]); if (at >= 0) return at; } return -1; }
    var attCol = colOf_(['出席次數/43', '出席次數', '出席']);
    var absCol = colOf_(['連續缺席週數', '缺席週', '缺席']);
    if (attCol < 0 || absCol < 0 || header[absCol] === '目前連續缺席週數') {
      throw new Error(tab + ' 的出席或缺席欄不對。正式表用「出席次數/43」與「連續缺席週數」，不能改用「目前連續缺席週數」。已停止');
    }
    var width = Math.max(CONFIG.CLAIM_COL, attCol + 1, absCol + 1);
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
    v.forEach(function (r, i) {
      if (!r[0]) return;
      out[tab].push({ row: i + 2, name: r[0], group: r[1], att: r[attCol], absent: r[absCol], by: r[4] || '' });
    });
  });
  return out;
}
function existingFromIndex_(ss) {
  var idx = indexObjects_(ss);
  if (!idx) return [];
  return idx.map(personFromIndex_);
}
function parseGradeTab_(grid) {
  if (!grid || !grid.length) throw new Error('B 穩定沒有表頭，已停止');
  var h = grid[0].map(function (x) { return String(x == null ? '' : x).trim(); });
  if (h[0] !== '姓名' || h[1] !== '群組' || h[2] !== '出席' || h[3] !== '缺席') {
    throw new Error('B 穩定第 1 列應為「姓名、群組、出席、缺席」，可再加「大區、小區、排」。已停止');
  }
  var hasArea = h[4] === '大區' && h[5] === '小區' && h[6] === '排';
  var rows = [];
  for (var i = 1; i < grid.length; i++) {
    if (grid[i][0] == null || String(grid[i][0]).trim() === '') continue;
      var attB = attendanceCount_(grid[i][2]), absB = absenceWeeks_(grid[i][3]);
    if (!attB.ok || !absB.ok) throw new Error('B 穩定的「出席」或「缺席」無法解析（出席可為次數或「次數 / 43」）。已停止');
    rows.push({
      sourceRow: i + 1, name: String(grid[i][0]).trim(), rawName: String(grid[i][0]), group: grid[i][1] == null ? '' : grid[i][1],
      att: attB.n, absent: absB.n,
      area: hasArea ? (grid[i][4] || '') : '', small: hasArea ? (grid[i][5] || '') : '', rank: hasArea ? (grid[i][6] || '') : ''
    });
  }
  return rows;
}
function collectMigrationInput_(ss) {
  var props = PropertiesService.getScriptProperties();
  var id24 = props.getProperty('SOURCE_24_SHEET_ID');
  var id26 = props.getProperty('SOURCE_26_SHEET_ID');
  var id27 = props.getProperty('SOURCE_27_SHEET_ID');
  if (!id24 || !id26 || !id27) return { error: '尚未設定 SOURCE_24_SHEET_ID、SOURCE_26_SHEET_ID 或 SOURCE_27_SHEET_ID，已停止。B 不在正式認領表。' };
  var bTab = props.getProperty('SOURCE_24_B_TAB') || 'B 穩定';
  var attTab = props.getProperty('SOURCE_24_ATTENDANCE_TAB') || '原始出席';
  var tab26 = props.getProperty('SOURCE_26_TAB') || '出席';
  var tab27 = props.getProperty('SOURCE_27_TAB') || '出席';
  var ss24, ss26, ss27;
  try {
    ss24 = SpreadsheetApp.openById(id24);
    ss26 = SpreadsheetApp.openById(id26);
    ss27 = SpreadsheetApp.openById(id27);
  } catch (e) { return { error: '無法開啟來源工作簿，已停止' }; }
  var bSheet = ss24.getSheetByName(bTab);
  if (!bSheet) return { error: '2-4 來源沒有分頁「' + bTab + '」。正式認領表只有 A/C/D，B 必須來自這個分頁。已停止' };
  var sh26 = ss26.getSheetByName(tab26), sh27 = ss27.getSheetByName(tab27);
  if (!sh26 || !sh27) return { error: '2-6 或 2-7 來源缺少出席分頁「' + tab26 + '」／「' + tab27 + '」，已停止' };
  var warnings = [];
  var source24 = [];
  var attSheet = ss24.getSheetByName(attTab);
  try {
    var sourceB = parseGradeTab_(bSheet.getDataRange().getValues());
    if (attSheet) source24 = parseAttendanceGrid_(attSheet.getDataRange().getValues(), '2-4');
    else warnings.push('2-4 來源沒有「' + attTab + '」。A/C/D 只沿用正式表現況；B 只讀「' + bTab + '」第 1 列表頭、第 2 列起。');
    return {
      legacy: readLegacyRows_(ss),
      source24: source24,
      sourceB: sourceB,
      source26: parseAttendanceGrid_(sh26.getDataRange().getValues(), '2-6'),
      source27: parseAttendanceGrid_(sh27.getDataRange().getValues(), '2-7'),
      visits: readVisits_(ss).map(function (v) { return { key: v.key, name: v.name, tab: v.tab }; }),
      existingIndex: existingFromIndex_(ss),
      warnings: warnings,
      sourceSpec: { sheet24: 'SOURCE_24_SHEET_ID', bTab: bTab, bHeaderRow: 1, bDataStartRow: 2, attendanceTab: attSheet ? attTab : '', attendanceHeaderRow: 3, tab26: tab26, tab27: tab27, newHeaderRow: 3, newDataStartRow: 4 }
    };
  } catch (e2) { return { error: String(e2.message || e2) }; }
}
function safeMigrationReport_(plan, input) {
  var c = plan.counts || {}, d = c['2-4'] || {};
  return {
    ok: !!plan.ok, wrote: false, apiVersion: API_VERSION, fingerprint: plan.fingerprint || '',
    manifestId: plan.manifestId || '',
    counts: { A: d.A, B: d.B, C: d.C, D: d.D, total24: d.total, source26: c['2-6'], source27: c['2-7'], candidates: c.candidates, sameNameGroups: c.sameNameGroups, sameNameRows: c.sameNameRows, reviewNameGroups: c.reviewNameGroups, reviewNameRows: c.reviewNameRows, claims: c.claims, visits: c.visits },
    sourceGrade: plan.diagnosis && plan.diagnosis.sourceGrade, legacyGrade: plan.diagnosis && plan.diagnosis.legacyGrade,
    signatureMismatchGroups: plan.diagnosis && plan.diagnosis.signatureMismatchGroups,
    unmatchedAttendance: plan.diagnosis && plan.diagnosis.unmatchedAttendance,
    sourceSpec: input && input.sourceSpec || null,
    errors: plan.errors || [], warnings: plan.warnings || [],
    liveDeltaNote: plan.liveDelta && plan.liveDelta.note || ''
  };
}
function logActionResult_(action, res) {
  var line = {
    action: action, ok: !!(res && res.ok), wrote: !!(res && res.wrote),
    stage: res && res.stage || '', error: res && res.error || '', errors: (res && res.errors) || [],
    fingerprint: (res && (res.fingerprint || res.currentFingerprint)) || '',
    expectedFingerprint: res && res.expectedFingerprint || '', backupId: res && res.backupId || ''
  };
  ['wouldWrite', 'flagConsumed', 'fingerprintMatches', 'confirmPresent', 'confirmMatches', 'expectedFingerprintLength', 'legacyNameMismatch', 'legacyTrimOnly', 'legacyClaimMismatch', 'legacyMissingRow'].forEach(function (k) {
    if (res && res[k] != null) line[k] = res[k];
  });
  Logger.log(JSON.stringify(line));
  return res;
}
function migrationStage_(res) {
  var e = (res && res.error) || '';
  if (res && res.wrote) return 'wrote';
  if (e.indexOf('原分頁') >= 0) return 'legacy-snapshot';
  if (e.indexOf('計畫') >= 0) return 'live-coverage';
  if (e.indexOf('回訪') >= 0) return 'visit-snapshot';
  return 'stopped';
}
function legacySnapshotDetail_(ss, plan) {
  var nameMismatch = 0, trimOnly = 0, claimMismatch = 0, missingRow = 0, byTab = {};
  (plan.people || []).forEach(function (p) { if (p.legacyKey) (byTab[p.tab] = byTab[p.tab] || []).push(p); });
  Object.keys(byTab).forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    var values = sh ? sh.getDataRange().getValues() : [];
    byTab[tab].forEach(function (p) {
      if (!sh || p.row < 1 || p.row > values.length) { missingRow++; return; }
      var r = values[p.row - 1];
      var raw = r[0] == null ? '' : String(r[0]);
      var planName = p.name == null ? '' : String(p.name);
      if (raw.trim() !== planName.trim()) nameMismatch++;
      else if (raw !== planName) trimOnly++;
      if ((r[4] || '') !== (p.by || '')) claimMismatch++;
    });
  });
  return { nameMismatch: nameMismatch, trimOnly: trimOnly, claimMismatch: claimMismatch, missingRow: missingRow };
}
function migrationDryRun() {
  var input = collectMigrationInput_(openSs_());
  if (input.error) { Logger.log(input.error); return { ok: false, wrote: false, error: input.error }; }
  input.manifest = activeManifest_();
  var plan = buildMigrationPlan_(input);
  var report = safeMigrationReport_(plan, input);
  Logger.log(JSON.stringify(report));
  return report;
}
function migrationConfirm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRATION_CONFIRM') !== '確認遷移') {
    logActionResult_('migrationConfirm', { ok: false, wrote: false, stage: 'confirm-text', error: '確認文字不符，未刪除旗標，未寫入' });
    throw new Error('請先 dry-run，再把 MIGRATION_CONFIRM 設為「確認遷移」');
  }
  var expect = props.getProperty('MIGRATION_FINGERPRINT');
  props.deleteProperty('MIGRATION_CONFIRM');
  var ss;
  try { ss = openSs_(); } catch (e) {
    logActionResult_('migrationConfirm', { ok: false, wrote: false, stage: 'sheet', error: '無法開啟正式表，未寫入' });
    throw e;
  }
  var input = collectMigrationInput_(ss);
  if (input.error) return logActionResult_('migrationConfirm', { ok: false, wrote: false, stage: 'input', error: input.error });
  input.manifest = activeManifest_();
  var plan = buildMigrationPlan_(input);
  if (!plan.ok) return logActionResult_('migrationConfirm', { ok: false, wrote: false, stage: 'plan', errors: plan.errors, fingerprint: plan.fingerprint });
  if (!expect || expect !== plan.fingerprint) return logActionResult_('migrationConfirm', { ok: false, wrote: false, stage: 'fingerprint', error: '與剛剛的 dry-run 指紋不同，未寫入。請重新 dry-run，不要用舊計畫覆蓋現況。', fingerprint: plan.fingerprint, expectedFingerprint: expect || '' });
  var res = applyMigration_(ss, plan, { confirm: true, confirmText: '確認遷移' });
  res.stage = migrationStage_(res);
  return logActionResult_('migrationConfirm', res);
}
function migrationConfirmReadiness() {
  var props = PropertiesService.getScriptProperties();
  var keys = [];
  try { keys = props.getKeys(); } catch (e1) { keys = []; }
  var confirmVal = props.getProperty('MIGRATION_CONFIRM');
  var expect = props.getProperty('MIGRATION_FINGERPRINT');
  var report = {
    ok: false, wrote: false, wouldWrite: false, flagConsumed: false, apiVersion: API_VERSION,
    confirmPresent: !(confirmVal == null || confirmVal === ''),
    confirmMatches: confirmVal === '確認遷移',
    fingerprintPresent: !(expect == null || expect === ''),
    expectedFingerprint: expect || '',
    expectedFingerprintLength: expect ? String(expect).length : 0,
    currentFingerprint: '', fingerprintMatches: false,
    migrationKeys: keys.filter(function (k) { return k.indexOf('MIGRATION_') === 0; }),
    stage: '', error: '', errors: [],
    legacyNameMismatch: 0, legacyTrimOnly: 0, legacyClaimMismatch: 0, legacyMissingRow: 0,
    note: '只讀。沒有刪除確認旗標，也沒有寫入正式表。旗標現在不存在，不能用來判斷上一次確認停在哪裡，因為通過文字檢查後就會先刪除旗標。'
  };
  var ss;
  try { ss = openSs_(); } catch (e2) { report.stage = 'sheet'; report.error = '無法開啟正式表'; logActionResult_('migrationConfirmReadiness', report); return report; }
  var input = collectMigrationInput_(ss);
  if (input.error) { report.stage = 'input'; report.error = input.error; logActionResult_('migrationConfirmReadiness', report); return report; }
  input.manifest = activeManifest_();
  var plan = buildMigrationPlan_(input);
  report.currentFingerprint = plan.fingerprint || '';
  report.fingerprintMatches = !!expect && expect === plan.fingerprint;
  if (!plan.ok) { report.stage = 'plan'; report.errors = plan.errors || []; logActionResult_('migrationConfirmReadiness', report); return report; }
  if (!expect || expect !== plan.fingerprint) { report.stage = 'fingerprint'; report.error = '儲存的指紋與現時計畫不同，確認會在寫入前停止'; logActionResult_('migrationConfirmReadiness', report); return report; }
  var legacyProblem = validateLegacySnapshot_(ss, plan);
  var detail = legacySnapshotDetail_(ss, plan);
  report.legacyNameMismatch = detail.nameMismatch;
  report.legacyTrimOnly = detail.trimOnly;
  report.legacyClaimMismatch = detail.claimMismatch;
  report.legacyMissingRow = detail.missingRow;
  if (legacyProblem) { report.stage = 'legacy-snapshot'; report.error = legacyProblem; logActionResult_('migrationConfirmReadiness', report); return report; }
  var coverageProblem = validateLiveCoverage_(ss, plan);
  if (coverageProblem) { report.stage = 'live-coverage'; report.error = coverageProblem; logActionResult_('migrationConfirmReadiness', report); return report; }
  var visitProblem = validateVisitSnapshot_(ss, plan);
  if (visitProblem) { report.stage = 'visit-snapshot'; report.error = visitProblem; logActionResult_('migrationConfirmReadiness', report); return report; }
  report.stage = 'ready';
  report.ok = true;
  report.wouldWrite = true;
  report.note += '現時門檻都能通過。這仍不是已寫入；不要依此直接重跑確認。';
  logActionResult_('migrationConfirmReadiness', report);
  return report;
}
function applyMigration_(ss, plan, opts) {
  if (!plan || !plan.ok) return { ok: false, wrote: false, error: '計畫有錯誤，拒絕寫入', errors: plan && plan.errors };
  if (!opts || opts.confirm !== true || opts.confirmText !== '確認遷移') {
    return { ok: true, dryRun: true, wrote: false, fingerprint: plan.fingerprint, counts: plan.counts, warnings: plan.warnings };
  }
  var legacyProblem = validateLegacySnapshot_(ss, plan);
  if (legacyProblem) return { ok: false, wrote: false, error: legacyProblem };
  var coverageProblem = validateLiveCoverage_(ss, plan);
  if (coverageProblem) return { ok: false, wrote: false, error: coverageProblem };
  var visitProblem = validateVisitSnapshot_(ss, plan);
  if (visitProblem) return { ok: false, wrote: false, error: visitProblem };
  var backup = backupAll_(ss);
  plan.people.forEach(function (p) {
    if (!p.legacyKey) return;
    var sh = ss.getSheetByName(p.tab);
    sh.getRange(1, CONFIG.STABLE_COL).setValue('穩定ID');
    sh.getRange(p.row, CONFIG.STABLE_COL).setValue(p.stableId);
  });
  var bRows = plan.people.filter(function (p) { return p.tab === 'B 穩定'; });
  var pRows = plan.people.filter(function (p) { return p.tab === '待核實'; });
  writePeopleSheet_(ss, 'B 穩定', bRows);
  writePeopleSheet_(ss, '待核實', pRows);
  writeIndex_(ss, plan.people);
  writeVisitKeys_(ss, plan);
  return { ok: true, wrote: true, dryRun: false, backupId: backup.backupId, fingerprint: plan.fingerprint, counts: plan.counts };
}
function validateLegacySnapshot_(ss, plan) {
  var bad = '';
  plan.people.forEach(function (p) {
    if (bad || !p.legacyKey) return;
    var sh = ss.getSheetByName(p.tab);
    if (!sh || p.row > sh.getLastRow()) { bad = '原分頁列號已變'; return; }
    var r = sh.getRange(p.row, 1, 1, CONFIG.CLAIM_COL).getValues()[0];
    var rawName = r[0] == null ? '' : String(r[0]);
    var planName = p.name == null ? '' : String(p.name);
    if (rawName.trim() !== planName.trim()) bad = '原分頁姓名已變，中止以免錯接';
    else if ((r[4] || '') !== (p.by || '')) bad = '原分頁認領已變，中止';
  });
  return bad;
}
function validateLiveCoverage_(ss, plan) {
  var legacy = readLegacyRows_(ss), known = {};
  plan.people.forEach(function (p) { if (p.legacyKey) known[p.legacyKey] = p; });
  var tabs = Object.keys(legacy);
  for (var t = 0; t < tabs.length; t++) {
    var rows = legacy[tabs[t]];
    for (var i = 0; i < rows.length; i++) {
      var key = tabs[t] + '|' + rows[i].row;
      var hit = known[key];
      if (!hit) return '正式表有計畫裡沒有的列 ' + key + '，已停止，不會用舊候選覆蓋';
      if ((rows[i].by || '') !== (hit.by || '')) return '正式表的認領比計畫新，已停止，不會覆蓋';
    }
  }
  var tierProblem = '';
  ['B 穩定', '待核實'].forEach(function (tab) {
    if (tierProblem) return;
    var sh = ss.getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2) return;
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, CONFIG.STABLE_COL).getValues();
    values.forEach(function (r) {
      if (tierProblem || !r[0]) return;
      var hit = null;
      plan.people.forEach(function (p) { if (r[5] && p.stableId === r[5]) hit = p; });
      if (!hit) tierProblem = '分頁「' + tab + '」有計畫外的資料，已停止';
      else if ((r[4] || '') !== (hit.by || '')) tierProblem = '分頁「' + tab + '」的認領與計畫不同，已停止，不會覆蓋';
    });
  });
  return tierProblem;
}
function validateVisitSnapshot_(ss, plan) {
  var visits = readVisits_(ss);
  if (visits.length !== plan.visitMap.length) return '回訪筆數與計畫不一致，中止';
  for (var i = 0; i < visits.length; i++) {
    var v = visits[i], hit = null;
    for (var j = 0; j < plan.visitMap.length; j++) if (plan.visitMap[j].oldKey === v.key && plan.visitMap[j].name === v.name) hit = plan.visitMap[j];
    if (!hit) return '有回訪對不到計畫，中止';
  }
  return '';
}
function writePeopleSheet_(ss, tab, rows) {
  var sh = ss.getSheetByName(tab);
  if (!sh) sh = ss.insertSheet(tab);
  var header = ['姓名', '群組', '出席', '缺席', '我要認領', '穩定ID', '來源區', '大區', '小區', '排', '出席狀態'];
  var grid = [header];
  rows.forEach(function (p, i) {
    p.row = i + 2;
    p.tab = tab;
    grid.push([p.name, p.group, p.att, p.absent, p.by || '', p.stableId, p.district, p.area || '', p.small || '', p.rank || '', p.attendanceStatus]);
  });
  writeGrid_(sh, grid);
}
function indexGrid_(people) {
  var grid = [INDEX_HEADER];
  people.forEach(function (p) {
    grid.push([p.stableId, p.legacyKey, p.sourceKey, p.district, p.tier, p.tab, p.row || '', p.name, p.norm, p.seq, p.group, p.area || '', p.small || '', p.rank || '', p.att, p.absent, p.attendanceStatus, p.by || '', p.sourceTab, p.sourceRow, p.active || 'Y', p.mergedInto || '']);
  });
  return grid;
}
function writeIndex_(ss, people) {
  var idx = ss.getSheetByName(CONFIG.INDEX_TAB);
  if (!idx) idx = ss.insertSheet(CONFIG.INDEX_TAB);
  writeGrid_(idx, indexGrid_(people));
  var mapSh = ss.getSheetByName(CONFIG.KEYMAP_TAB);
  if (!mapSh) mapSh = ss.insertSheet(CONFIG.KEYMAP_TAB);
  var keys = [['舊資料鍵', '穩定ID', '姓名', '來源區', '分頁', '列號']];
  var src = [['穩定ID', '來源鍵', '來源區', '來源表', '來源列', '姓名', '舊資料鍵']];
  people.forEach(function (p) {
    if (p.legacyKey) keys.push([p.legacyKey, p.stableId, p.name, p.district, p.tab, p.row || '']);
    src.push([p.stableId, p.sourceKey, p.district, p.sourceTab, p.sourceRow, p.name, p.legacyKey]);
  });
  writeGrid_(mapSh, keys);
  var srcSh = ss.getSheetByName(CONFIG.SOURCEMAP_TAB);
  if (!srcSh) srcSh = ss.insertSheet(CONFIG.SOURCEMAP_TAB);
  writeGrid_(srcSh, src);
}
function writeVisitKeys_(ss, plan) {
  var sh = ss.getSheetByName(CONFIG.VISIT_TAB);
  if (!sh) return;
  var grid = sh.getDataRange().getValues();
  if (!grid.length) return;
  if (grid[0].length < 10) grid[0][9] = '舊資料鍵';
  else if (!grid[0][9]) grid[0][9] = '舊資料鍵';
  for (var i = 1; i < grid.length; i++) {
    var key = grid[i][8], name = grid[i][3], hit = null;
    for (var j = 0; j < plan.visitMap.length; j++) if (plan.visitMap[j].oldKey === key && plan.visitMap[j].name === name) hit = plan.visitMap[j];
    if (!hit) throw new Error('寫入回訪時對應消失，已停止');
    if (!hit.already) {
      if (!grid[i][9]) grid[i][9] = key;
      grid[i][8] = hit.stableId;
    }
  }
  writeGrid_(sh, grid);
}

function mergePeople_(ss, opts) {
  opts = opts || {};
  var idx = indexObjects_(ss);
  if (!idx) return { ok: false, wrote: false, error: '尚未建立名單索引，不能合併' };
  var people = idx.map(personFromIndex_);
  var keep = null, merge = null;
  people.forEach(function (p) { if (p.stableId === opts.keepId) keep = p; if (p.stableId === opts.mergeId) merge = p; });
  if (!keep || !merge || keep.stableId === merge.stableId) return { ok: false, wrote: false, error: '要指定兩個不同的穩定ID' };
  if (keep.active === 'N' || merge.active === 'N') return { ok: false, wrote: false, error: '有一方已經合併過' };
  if (keep.by && merge.by && keep.by !== merge.by) return { ok: false, wrote: false, error: '兩邊都有不同認領者，拒絕合併' };
  var preview = { keepId: keep.stableId, mergeId: merge.stableId, keepName: keep.name, mergeName: merge.name, keepBy: keep.by, mergeBy: merge.by };
  if (!(opts.confirm === true && opts.confirmText === '確認合併')) return { ok: true, dryRun: true, wrote: false, preview: preview };
  var moved = '';
  if (merge.by && !keep.by) { keep.by = merge.by; merge.by = ''; moved = keep.by; }
  merge.active = 'N';
  merge.mergedInto = keep.stableId;
  people.forEach(function (p) { if (p.stableId === keep.stableId) { p.by = keep.by; p.active = 'Y'; p.mergedInto = ''; } });
  writeIndex_(ss, people);
  writeClaimCell_(ss, keep, keep.by || '');
  writeClaimCell_(ss, merge, '');
  var log = ss.getSheetByName(CONFIG.MERGE_TAB);
  if (!log) { log = ss.insertSheet(CONFIG.MERGE_TAB); log.appendRow(['時間', '保留ID', '併入ID', '保留姓名', '併入姓名', '認領']); }
  log.appendRow([new Date(), keep.stableId, merge.stableId, keep.name, merge.name, moved || keep.by || '']);
  return { ok: true, wrote: true, dryRun: false, preview: preview };
}

function poolsFrom_(list) {
  var pools = { A: [], B: [], CD: [] };
  (list || []).forEach(function (p) {
    if (!p) return;
    if (p.attendanceStatus === 'pending' || p.tier === '待核實' || p.tab === '待核實') return;
    if (p.tier === 'A') pools.A.push(p);
    else if (p.tier === 'B') pools.B.push(p);
    else if (p.tier === 'C' || p.tier === 'D') pools.CD.push(p);
  });
  return pools;
}
function drawSample_(pools, counts, rng) {
  counts = counts || SAMPLE_SPEC.counts;
  rng = rng || Math.random;
  function take(list, n) {
    var copy = (list || []).slice(), out = [], k = Math.min(n, copy.length);
    for (var i = 0; i < k; i++) {
      var idx = Math.floor(rng() * copy.length);
      if (idx >= copy.length) idx = copy.length - 1;
      if (idx < 0) idx = 0;
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  }
  var drawn = { A: take(pools.A, counts.A), B: take(pools.B, counts.B), CD: take(pools.CD, counts.CD) };
  drawn.list = drawn.A.concat(drawn.B).concat(drawn.CD);
  return drawn;
}
function sampleKeys_(list) { return (list || []).map(function (p) { return p.stableId || p.key; }); }

function buildReminders_(ss, today) {
  today = today || today_();
  var recs = readVisits_(ss), until = nextRunDay_(today), ws = weekStart_(today);
  var people = listPeople_(ss).filter(function (p) { return p.by; });
  var per = {};
  saints_().forEach(function (s) { per[s] = { saint: s, overdue: [], due: [], total: 0, week: 0 }; });
  people.forEach(function (p) {
    var st = visitStatus_(p, recs, today, aliasKeys_(ss, p));
    var x = per[p.by];
    if (!x || st.remind === false) return;
    p.st = st; st.today = today; x.total++;
    if (st.never || st.due === today || (st.due < until && st.due >= today)) x.due.push(p);
    else if (st.due < today) x.overdue.push(p);
  });
  recs.forEach(function (r) { if (r.date >= ws && r.date <= today && per[r.saint]) per[r.saint].week++; });
  saints_().forEach(function (s) {
    per[s].overdue.sort(function (a, b) { return b.st.overdue - a.st.overdue; });
    per[s].due.sort(function (a, b) { return a.st.due < b.st.due ? -1 : 1; });
  });
  var all = readAll_(ss), unclaimed = {};
  CONFIG.TABS.forEach(function (t) { unclaimed[t] = (all[t] || []).filter(function (p) { return !p.by; }).length; });
  return { today: today, until: until, weekStart: ws, per: per, unclaimed: unclaimed, weekTotal: recs.filter(function (r) { return r.date >= ws && r.date <= today; }).length };
}
function unclaimedPeople_(ss) { return listPeople_(ss).filter(function (p) { return !p.by; }); }

function txt_(t, o) { var x = { type: 'text', text: String(t), wrap: true }; for (var k in (o || {})) x[k] = o[k]; return x; }
function personRow_(p, kind) {
  var tag = '推薦';
  if (p.st) tag = kind === 'over' ? '逾期 ' + p.st.overdue + ' 天' : p.st.never ? '尚未回訪' : (p.st.due === p.st.today ? '今天' : md_(p.st.due) + ' 到期');
  var mark = p.tier === '待核實' ? '待' : p.tier;
  var row = { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', contents: [
    { type: 'box', layout: 'vertical', width: '26px', height: '20px', cornerRadius: '4px', backgroundColor: TIER_COLOR[p.tier] || '#888888', justifyContent: 'center', contents: [txt_(mark, { size: 'xs', color: '#FFFFFF', align: 'center', weight: 'bold' })] },
    txt_(p.name, { size: 'md', weight: 'bold', flex: 4, color: '#222222' }),
    txt_(tag, { size: 'sm', flex: 4, align: 'end', color: kind === 'over' ? '#C62828' : '#8A5A00' })
  ] };
  var id = p.stableId || p.key;
  var base = String(cfg_('LIFF_URL') || '').split('?')[0];
  if (id && base) row.action = { type: 'uri', label: '填寫回訪', uri: base + '?k=' + encodeURIComponent(id) };
  return row;
}
function sampleSections_(people) {
  var over = [], due = [], plain = [];
  people.forEach(function (p) {
    if (p.st && p.st.overdue > 0) over.push(p);
    else if (p.st) due.push(p);
    else plain.push(p);
  });
  var body = [];
  function block(title, color, bg, list, kind) {
    if (!list.length) return;
    var rows = list.map(function (p) { return personRow_(p, kind); });
    body.push({ type: 'box', layout: 'vertical', backgroundColor: bg, cornerRadius: '10px', paddingAll: '12px', margin: 'md', contents: [txt_(title, { weight: 'bold', color: color, size: 'md' })].concat(rows) });
  }
  block('已逾期', '#C62828', '#FDECEA', over, 'over');
  block('該回訪', '#8A5A00', '#FFF4DC', due, 'due');
  block('這次推薦', '#1F6F5C', '#E7F6F1', plain, 'plain');
  return body;
}
function countLine_(list) {
  var a = 0, b = 0, cd = 0;
  list.forEach(function (p) { if (p.tier === 'A') a++; else if (p.tier === 'B') b++; else if (p.tier === 'C' || p.tier === 'D') cd++; });
  return '這次 A ' + a + '、B ' + b + '、C/D ' + cd + '（池不足不跨級補齊）';
}
function sampleBubble_(title, whoLine, people, buttonLabel, uri) {
  var body = sampleSections_(people);
  body.push(txt_(countLine_(people), { size: 'xs', color: '#666666', margin: 'md' }));
  body.push(txt_(SAMPLE_SPEC.assumption, { size: 'xs', color: '#888888', margin: 'sm', wrap: true }));
  body.push(txt_('這不是完整名單。完整名單請打開小頁面。', { size: 'xs', color: '#888888', margin: 'sm' }));
  return { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#1F6F5C', paddingAll: '16px', contents: [
      txt_(title, { color: '#FFFFFF', weight: 'bold', size: 'xl' }),
      txt_(whoLine, { color: '#D7F2EA', size: 'sm', margin: 'sm' })] },
    body: { type: 'box', layout: 'vertical', paddingAll: '12px', contents: body },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#06C755', height: 'md', action: { type: 'uri', label: buttonLabel, uri: uri } }] } };
}
function flex_(alt, bubble) { return { type: 'flex', altText: String(alt).slice(0, 400), contents: bubble }; }

function sampleSheet_(ss, create) {
  var sh = ss.getSheetByName(CONFIG.SAMPLE_TAB);
  if (!sh && create) { sh = ss.insertSheet(CONFIG.SAMPLE_TAB); sh.appendRow(SAMPLE_HEADER); }
  return sh;
}
function rememberSample_(ss, today, pool, target, keys) {
  var sh = sampleSheet_(ss, true);
  sh.appendRow([today, pool, target, JSON.stringify(keys), '已抽出']);
}
function savedSampleKeys_(ss, today, pool) {
  var sh = sampleSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (dayStr_(v[i][0]) === today && v[i][1] === pool && v[i][2] === '*') {
      try { return JSON.parse(v[i][3]); } catch (e) { return null; }
    }
  }
  return null;
}
function peopleByKeys_(ss, keys) {
  var all = listPeople_(ss), out = [];
  (keys || []).forEach(function (k) {
    for (var i = 0; i < all.length; i++) if ((all[i].stableId || all[i].key) === k) { out.push(all[i]); break; }
  });
  return out;
}
function sentToday_(ss, type, who, today) {
  var sh = ss.getSheetByName(CONFIG.LOG_TAB);
  if (!sh || sh.getLastRow() < 2) return false;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (v[i][1] === type && v[i][2] === who && v[i][5] === '成功' && dayStr_(v[i][0]) === today) return true;
  }
  return false;
}
function planPersonalSamples_(ss, today, rng) {
  var R = buildReminders_(ss, today), out = {};
  saints_().forEach(function (s) {
    var pool = R.per[s].overdue.concat(R.per[s].due);
    out[s] = drawSample_(poolsFrom_(pool), SAMPLE_SPEC.counts, rng || Math.random);
  });
  return { R: R, samples: out };
}
function sendPersonalSamples_(ss, today) {
  var planned = planPersonalSamples_(ss, today, Math.random);
  var bind = bindings_(ss), skipped = [], left = quotaLeft_(), sent = 0;
  saints_().forEach(function (s) {
    var sample = planned.samples[s].list;
    if (!sample.length) { skipped.push(s + '（沒有可抽的回訪）'); return; }
    var to, who = s;
    if (s === adminSaint_() || bind[s] === adminUserId_()) { to = adminUserId_(); who = s + '（管理者）'; }
    else if (!bind[s]) { skipped.push(s + '（尚未綁定）'); return; }
    else to = bind[s];
    if (sentToday_(ss, '個人抽樣', who, today)) { skipped.push(s + '（同日已送出）'); return; }
    if (left !== null && sent >= left) { log_(ss, '個人抽樣', who, to, '', '略過', '本月免費則數不足'); return; }
    var msg = flex_('本人已認領回訪：' + countLine_(sample), sampleBubble_('本人已認領回訪', s + ' 平安！' + md_(today) + '（週' + weekday_(today) + '）', sample, '填寫回訪', cfg_('LIFF_URL') + '?v=1'));
    if (push_(ss, '個人抽樣', who, to, [msg])) sent++;
  });
  if (skipped.length) log_(ss, '個人抽樣', '（未推播）', '', '', '略過', skipped.join('、'));
  return planned;
}
function pushGroupReminder() {
  var ss = openSs_(), today = today_(), props = PropertiesService.getScriptProperties(), names = groupNames_();
  if (!groupOn_()) { log_(ss, '群組抽樣', names.join('、'), '', '', '略過', 'GROUP_PUSH_ENABLED 不是 true'); return 0; }
  if (!isRunWeekday_(weekday_(today))) { log_(ss, '群組抽樣', names.join('、'), '', '', '略過', '不是週一、四、六'); return 0; }
  if (!props.getProperty('JOSEPH_TOKEN')) { log_(ss, '群組抽樣', names.join('、'), '', '', '失敗', '尚未設定指令碼屬性 JOSEPH_TOKEN'); return 0; }
  var pending = names.filter(function (n) { return !sentToday_(ss, '群組抽樣', n, today); });
  if (!pending.length) { log_(ss, '群組抽樣', '（全部）', '', '', '略過', '同日已送出'); return 0; }
  var keys = savedSampleKeys_(ss, today, SAMPLE_SPEC.groupPool);
  var sample = keys ? peopleByKeys_(ss, keys) : null;
  if (!sample) {
    sample = drawSample_(poolsFrom_(unclaimedPeople_(ss)), SAMPLE_SPEC.counts, Math.random).list;
    if (!sample.length) { log_(ss, '群組抽樣', '（空池）', '', '', '略過', '沒有可抽的未認領名單'); return 0; }
    rememberSample_(ss, today, SAMPLE_SPEC.groupPool, '*', sampleKeys_(sample));
  }
  var G = resolveGroups_(ss);
  G.missing.forEach(function (n) {
    if (pending.indexOf(n) >= 0) log_(ss, '群組抽樣', n, '', '', '失敗', '找不到這個群組的 ID：請確認 Joseph 在群組裡、名稱完全相同、Webhook 已開啟，並在該群組傳一則訊息');
  });
  var msg = [flex_('未認領推薦：' + countLine_(sample), sampleBubble_('未認領推薦', '弟兄姊妹平安！' + md_(today) + '（週' + weekday_(today) + '）兩群同一份抽樣', sample, '打開小頁面（完整名單）', cfg_('LIFF_URL')))];
  var left = quotaLeft_(), n = 0;
  pending.forEach(function (name) {
    var gid = G.found[name];
    if (!gid) return;
    var cnt = lineGet_('/v2/bot/group/' + encodeURIComponent(gid) + '/members/count');
    var members = cnt.code === 200 ? cnt.body.count : null;
    if (members !== null && left !== null && members > left) { log_(ss, '群組抽樣', name, gid, '', '略過', '本月剩 ' + left + ' 則，群組 ' + members + ' 人，不足'); return; }
    if (push_(ss, '群組抽樣', name, gid, msg)) {
      n++; if (left !== null && members !== null) left -= members;
    }
  });
  return n;
}
function previewRemindersToAdmin() {
  var ss = openSs_(), today = today_();
  var personal = planPersonalSamples_(ss, today, Math.random);
  var group = drawSample_(poolsFrom_(unclaimedPeople_(ss)), SAMPLE_SPEC.counts, Math.random).list;
  var msgs = [];
  if (group.length) msgs.push(flex_('預覽 未認領推薦', sampleBubble_('未認領推薦', '預覽（不寫送出紀錄）', group, '打開小頁面', cfg_('LIFF_URL'))));
  saints_().forEach(function (s) {
    var list = personal.samples[s].list;
    if (list.length) msgs.push(flex_('預覽 本人已認領回訪 ' + s, sampleBubble_('本人已認領回訪', s, list, '填寫回訪', cfg_('LIFF_URL') + '?v=1')));
  });
  if (!msgs.length) return false;
  return pushRaw_(adminUserId_(), msgs.slice(0, 5));
}

function pauseReminderTriggers() {
  var n = 0, kept = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'sendReminders' || f === 'sendMonthlySummary') { ScriptApp.deleteTrigger(t); n++; }
    else kept++;
  });
  Logger.log('已暫停 ' + n + ' 個本系統提醒／月報觸發，沒有建立新觸發，也不會發送。遷移與前端確認完成前不要執行 setupTriggers。其他觸發保留 ' + kept + ' 個。');
  return { paused: n, created: 0, kept: kept };
}
function releaseReadiness() {
  var props = PropertiesService.getScriptProperties();
  var required = ['SHEET_ID', 'SAINTS', 'ADMIN_SAINT', 'ADMIN_USER_ID', 'JOSEPH_TOKEN'];
  var missing = required.filter(function (k) { return !props.getProperty(k); });
  var reminder = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'sendReminders' || f === 'sendMonthlySummary') reminder++;
  });
  var report = {
    ok: missing.length === 0, apiVersion: API_VERSION, nameEntry: NAME_ENTRY, missingProperties: missing,
    groupPushEnabled: props.getProperty('GROUP_PUSH_ENABLED') === 'true', reminderTriggers: reminder,
    manifest: ROSTER_MANIFEST_V1.id,
    note: '此檢查不讀取名單、不發送。nameEntry 為 row-stable-id 才是姓名直達修正，apiVersion 2026-11-release-7 不是這次。遷移完成前 reminderTriggers 應為 0。'
  };
  Logger.log(JSON.stringify(report));
  return report;
}
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var others = 0;
  triggers.forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'sendReminders' || f === 'sendMonthlySummary') ScriptApp.deleteTrigger(t);
    else others++;
  });
  var MAP = { '日': 'SUNDAY', '一': 'MONDAY', '二': 'TUESDAY', '三': 'WEDNESDAY', '四': 'THURSDAY', '五': 'FRIDAY', '六': 'SATURDAY' };
  CONFIG.RUN_DAYS.split('').forEach(function (d) {
    ScriptApp.newTrigger('sendReminders').timeBased().onWeekDay(ScriptApp.WeekDay[MAP[d]]).atHour(CONFIG.RUN_HOUR).nearMinute(0).inTimezone(CONFIG.TZ).create();
  });
  ScriptApp.newTrigger('sendMonthlySummary').timeBased().onMonthDay(1).atHour(CONFIG.MONTHLY_HOUR).nearMinute(0).inTimezone(CONFIG.TZ).create();
  try { var ss = openSs_(); visitSheet_(ss); logSheet_(ss); } catch (e) {}
  Logger.log('已建立每週一、四、六的 sendReminders，以及每月 1 日的月報。時區是 Asia/Taipei。nearMinute(0) 依 Google 文件是指定分鐘加減約 15 分鐘，不是準時，也不是「09 分」。' + CONFIG.SCHEDULE_NOTE + ' 其他觸發保留 ' + others + ' 個。');
}
function groupOn_() { return PropertiesService.getScriptProperties().getProperty('GROUP_PUSH_ENABLED') === 'true'; }
function sendReminders() {
  var today = today_(), wd = weekday_(today);
  if (!isRunWeekday_(wd)) { Logger.log('今天週' + wd + ' 不是一、四、六，不推播'); return; }
  var ss = openSs_();
  sendPersonalSamples_(ss, today);
  pushGroupReminder();
}

function logSheet_(ss) {
  var sh = ss.getSheetByName(CONFIG.LOG_TAB);
  if (!sh) { sh = ss.insertSheet(CONFIG.LOG_TAB); sh.appendRow(LOG_HEADER); }
  return sh;
}
function log_(ss, type, who, userId, code, result, note) {
  try { logSheet_(ss).appendRow([new Date(), type, who, userId, code, result, String(note || '').slice(0, 300)]); } catch (e) {}
}
function lineErr_(text) {
  try { var j = JSON.parse(text); return (j.message || '') + (j.details ? ' ' + JSON.stringify(j.details) : ''); } catch (e) { return String(text).slice(0, 200); }
}
function pushRaw_(to, messages) {
  var token = PropertiesService.getScriptProperties().getProperty('JOSEPH_TOKEN');
  if (!token) return false;
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, 'X-Line-Retry-Key': Utilities.getUuid() },
    payload: JSON.stringify({ to: to, messages: messages })
  });
  return res.getResponseCode() === 200;
}
function push_(ss, type, who, to, messages) {
  var token = PropertiesService.getScriptProperties().getProperty('JOSEPH_TOKEN');
  if (!token) { log_(ss, type, who, to, '', '失敗', '尚未設定指令碼屬性 JOSEPH_TOKEN'); return false; }
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, 'X-Line-Retry-Key': Utilities.getUuid() },
      payload: JSON.stringify({ to: to, messages: messages })
    });
    var code = res.getResponseCode(), ok = code === 200, hint = '';
    if (code === 400) hint = '（常見原因：對方沒加 Joseph 好友、封鎖 Joseph，或 userId 不屬於 Joseph 的 Provider）';
    if (code === 429) hint = '（本月免費則數已用完或請求過多）';
    if (code === 401) hint = '（JOSEPH_TOKEN 無效或已過期）';
    log_(ss, type, who, to, code, ok ? '成功' : '失敗', ok ? messages.length + ' 則訊息物件' : lineErr_(res.getContentText()) + hint);
    return ok;
  } catch (e) { log_(ss, type, who, to, '', '失敗', String(e)); return false; }
}
function quotaLeft_() {
  var token = PropertiesService.getScriptProperties().getProperty('JOSEPH_TOKEN');
  if (!token) return null;
  try {
    var h = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
    var q = JSON.parse(UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota', h).getContentText());
    var c = JSON.parse(UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota/consumption', h).getContentText());
    if (q.type !== 'limited' || typeof c.totalUsage !== 'number') return null;
    return q.value - c.totalUsage;
  } catch (e) { return null; }
}
function bindings_(ss) {
  var sh = bindSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2) return {};
  var v = sh.getDataRange().getValues(), m = {};
  for (var i = 1; i < v.length; i++) if (v[i][2] && (v[i][4] || 'saint') !== 'observer') m[v[i][2]] = v[i][0];
  return m;
}
function checkPushTargets() {
  var ss = openSs_(), bind = bindings_(ss);
  var token = PropertiesService.getScriptProperties().getProperty('JOSEPH_TOKEN');
  if (!token) { Logger.log('尚未設定 JOSEPH_TOKEN'); return; }
  var lines = [], targets = [[adminSaint_() + '（管理者）', adminUserId_()]];
  Object.keys(bind).forEach(function (s) { targets.push([s, bind[s]]); });
  targets.forEach(function (t) {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(t[1]), { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    var ok = res.getResponseCode() === 200;
    lines.push(t[0] + '：' + (ok ? '可以收到' : '收不到（' + res.getResponseCode() + '：沒加 Joseph 好友，或 userId 不屬於 Joseph 的 Provider）'));
    log_(ss, '檢查', t[0], t[1], res.getResponseCode(), ok ? '可推播' : '不可推播', '');
  });
  Logger.log(lines.join('\n'));
}

function buildMonthly_(ss, today) {
  today = today || today_();
  var p = today.split('-'), y = +p[0], m = +p[1] - 1; if (m === 0) { m = 12; y--; }
  var from = y + '-' + ('0' + m).slice(-2) + '-01', to = numDay_(dayNum_(today.slice(0, 8) + '01') - 1);
  var recs = readVisits_(ss), inMonth = recs.filter(function (r) { return r.date >= from && r.date <= to; });
  var perSaint = {};
  saints_().forEach(function (s) { perSaint[s] = { records: 0, people: {} }; });
  inMonth.forEach(function (r) { if (perSaint[r.saint]) { perSaint[r.saint].records++; perSaint[r.saint].people[r.tab + '|' + r.name] = 1; } });
  var byPerson = {};
  recs.filter(function (r) { return r.date && r.date <= to; }).forEach(function (r) {
    var k = r.tab + '|' + r.name + '|' + (r.key || ''); (byPerson[k] = byPerson[k] || []).push(r);
  });
  var improved = [];
  Object.keys(byPerson).forEach(function (k) {
    var L = byPerson[k].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts < b.ts ? -1 : 1); });
    var last = L[L.length - 1]; if (last.date < from) return;
    var prev = L.length > 1 ? L[L.length - 2] : null, sc = CONFIG.STATUS_SCORE;
    if ((prev && sc[last.status] > sc[prev.status]) || (!prev && last.status === '願意來聚會')) improved.push({ name: last.name, tier: CONFIG.TIER[last.tab] || last.tab, from: prev ? prev.status : '（首次）', to: last.status, saint: last.saint });
  });
  var all = readAll_(ss), unclaimed = {}, claimed = 0, visitedClaimed = 0;
  CONFIG.TABS.forEach(function (t) {
    unclaimed[t] = (all[t] || []).filter(function (x) { return !x.by; }).length;
    (all[t] || []).forEach(function (x) {
      if (!x.by) return; claimed++;
      if (inMonth.some(function (r) { return sameVisit_(r, x, aliasKeys_(ss, x)); })) visitedClaimed++;
    });
  });
  return { from: from, to: to, total: inMonth.length, perSaint: perSaint, improved: improved, unclaimed: unclaimed, claimed: claimed, visitedClaimed: visitedClaimed };
}
function cell_(t, o) { var x = txt_(t, { size: 'sm', flex: 2, align: 'center' }); for (var k in (o || {})) x[k] = o[k]; return x; }
function monthlyBubble_(M) {
  var saints = saints_();
  var rows = saints.map(function (s) {
    var x = M.perSaint[s];
    return { type: 'box', layout: 'horizontal', margin: 'sm', contents: [cell_(s, { flex: 3, align: 'start' }), cell_(x.records), cell_(Object.keys(x.people).length)] };
  });
  var imp = M.improved.slice(0, 10).map(function (p) { return txt_('🌱 ' + p.name + '（' + p.tier + '）' + p.from + ' → ' + p.to + '・' + p.saint, { size: 'sm', margin: 'sm', color: '#1B5E20' }); });
  if (!imp.length) imp.push(txt_('本月沒有狀況改善的紀錄', { size: 'sm', color: '#888888', margin: 'sm' }));
  if (M.improved.length > 10) imp.push(txt_('…另外 ' + (M.improved.length - 10) + ' 位', { size: 'xs', color: '#666666' }));
  var un = CONFIG.TABS.map(function (t) { return (CONFIG.TIER[t] || t) + ' ' + M.unclaimed[t]; }).join('・');
  return { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#5B3E8E', paddingAll: '16px', contents: [
      txt_('🗓️ 回訪月報', { color: '#FFFFFF', weight: 'bold', size: 'xl' }),
      txt_(md_(M.from) + ' – ' + md_(M.to) + '・共 ' + M.total + ' 筆回訪', { color: '#E3D8F5', size: 'sm', margin: 'sm' }),
      txt_('已認領 ' + M.claimed + ' 位，其中 ' + M.visitedClaimed + ' 位本月有回訪', { color: '#E3D8F5', size: 'sm' })] },
    body: { type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
      { type: 'box', layout: 'vertical', backgroundColor: '#F4F0FA', cornerRadius: '10px', paddingAll: '12px', contents: [
        { type: 'box', layout: 'horizontal', contents: [cell_('聖徒', { flex: 3, align: 'start', weight: 'bold' }), cell_('回訪次數', { weight: 'bold' }), cell_('人數', { weight: 'bold' })] },
        { type: 'separator', margin: 'sm' }].concat(rows) },
      { type: 'box', layout: 'vertical', backgroundColor: '#EEF7EE', cornerRadius: '10px', paddingAll: '12px', margin: 'md', contents: [txt_('狀況改善 ' + M.improved.length + ' 位', { weight: 'bold' })].concat(imp) },
      { type: 'box', layout: 'vertical', backgroundColor: '#F7F7F7', cornerRadius: '10px', paddingAll: '12px', margin: 'md', contents: [txt_('尚未認領', { weight: 'bold' }), txt_(un, { size: 'sm', margin: 'sm', wrap: true })] }] } };
}
function sendMonthlySummary() {
  var ss = openSs_(), M = buildMonthly_(ss);
  push_(ss, '月報', adminSaint_() + '（管理者）', adminUserId_(), [flex_('回訪月報：上月共 ' + M.total + ' 筆回訪', monthlyBubble_(M))]);
}

function isWebhook_(b) { return !!b && typeof b === 'object' && Array.isArray(b.events) && typeof b.destination === 'string' && !b.action; }
function groupSheet_(ss) {
  var sh = ss.getSheetByName(CONFIG.GROUP_TAB);
  if (!sh) { sh = ss.insertSheet(CONFIG.GROUP_TAB); sh.appendRow(GROUP_HEADER); }
  return sh;
}
function handleWebhook_(e, body) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('WEBHOOK_KEY'), bot = props.getProperty('JOSEPH_BOT_USERID');
  if (key && (!e.parameter || e.parameter.k !== key)) return;
  if (!bot || body.destination !== bot) return;
  if (!body.events.length) return;
  var ss = openSs_(), sh = groupSheet_(ss);
  var seen = {}; sh.getDataRange().getValues().slice(1).forEach(function (r) { seen[r[2]] = 1; });
  body.events.forEach(function (ev) {
    var src = ev.source || {}, id = src.groupId || src.roomId || '', t = ev.type;
    if (src.type === 'group' || src.type === 'room') {
      if (t === 'message' && seen[id]) return;
      if (['join', 'leave', 'memberJoined', 'memberLeft', 'message'].indexOf(t) < 0) return;
      sh.appendRow([new Date(), t, id, src.type, new Date(ev.timestamp || Date.now())]); seen[id] = 1;
    } else if (src.type === 'user' && (t === 'follow' || t === 'unfollow')) {
      sh.appendRow([new Date(), t, src.userId || '', 'user', new Date(ev.timestamp || Date.now())]);
    }
  });
}
function setupJoseph() {
  var props = PropertiesService.getScriptProperties(), token = props.getProperty('JOSEPH_TOKEN');
  if (!token) throw new Error('請先在指令碼屬性新增 JOSEPH_TOKEN');
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('JOSEPH_TOKEN 無效（' + res.getResponseCode() + '）');
  var info = JSON.parse(res.getContentText());
  props.setProperty('JOSEPH_BOT_USERID', info.userId);
  if (!props.getProperty('WEBHOOK_KEY')) props.setProperty('WEBHOOK_KEY', Utilities.getUuid().replace(/-/g, ''));
  groupSheet_(openSs_());
  Logger.log('Joseph：' + (info.displayName || '') + '（' + (info.basicId || '') + '）\n請把下面這串貼到 LINE Developers → Joseph 的 Messaging API → Webhook URL：\n' + cfg_('EXEC_URL') + '?k=' + props.getProperty('WEBHOOK_KEY'));
}
function lineGet_(path) {
  var token = PropertiesService.getScriptProperties().getProperty('JOSEPH_TOKEN');
  var res = UrlFetchApp.fetch('https://api.line.me' + path, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  return { code: res.getResponseCode(), body: (function () { try { return JSON.parse(res.getContentText()); } catch (e) { return {}; } })() };
}
function groupNames_() {
  var p = PropertiesService.getScriptProperties().getProperty('GROUP_NAMES');
  return (p ? String(p).split(/[,，、]/) : CONFIG.GROUP_NAMES).map(function (x) { return String(x).trim(); }).filter(String);
}
function resolveGroups_(ss) {
  var props = PropertiesService.getScriptProperties(), names = groupNames_(), cache = {}, found = {}, missing = [], nameOf = {};
  try { cache = JSON.parse(props.getProperty('GROUP_IDS') || '{}'); } catch (e) {}
  function current(id) {
    if (!(id in nameOf)) { var g = lineGet_('/v2/bot/group/' + encodeURIComponent(id) + '/summary'); nameOf[id] = g.code === 200 ? g.body.groupName : null; }
    return nameOf[id];
  }
  var ids = [], last = {};
  var gs = ss.getSheetByName(CONFIG.GROUP_TAB);
  (gs && gs.getLastRow() ? gs.getDataRange().getValues().slice(1) : []).reverse().forEach(function (r) {
    if (r[3] !== 'group' || r[2] in last) return;
    last[r[2]] = r[1]; if (r[1] !== 'leave') ids.push(r[2]);
  });
  names.forEach(function (n) {
    if (cache[n] && last[cache[n]] !== 'leave' && current(cache[n]) === n) { found[n] = cache[n]; return; }
    for (var i = 0; i < ids.length; i++) if (current(ids[i]) === n) { found[n] = ids[i]; return; }
    missing.push(n);
  });
  props.setProperty('GROUP_IDS', JSON.stringify(found));
  return { found: found, missing: missing };
}
