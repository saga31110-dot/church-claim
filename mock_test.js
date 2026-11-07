// 後端模擬測試（node mock_test.js）— 不連網、不讀正式試算表、不推播、不使用憑證
const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
function Sheet(rows){this.v=(rows||[]).map(r=>r.slice());}
Sheet.prototype={
  getLastRow(){return this.v.length},
  clear(){this.v=[];},
  deleteRow(r){this.v.splice(r-1,1);},
  getDataRange(){const s=this;return{getValues:()=>s.v.length?s.v.map(r=>r.slice()):[]}},
  appendRow(r){this.v.push(r.slice())},
  getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;return{
    getValues:()=>{const out=[];for(let i=0;i<nr;i++){const src=s.v[r-1+i]||[];const y=[];for(let j=0;j<nc;j++)y.push(src[c-1+j]==null?'':src[c-1+j]);out.push(y);}return out;},
    setValue:val=>{while(s.v.length<r)s.v.push([]);while(s.v[r-1].length<c)s.v[r-1].push('');s.v[r-1][c-1]=val;},
    setValues:grid=>{for(let i=0;i<grid.length;i++){for(let j=0;j<grid[i].length;j++){while(s.v.length<r+i)s.v.push([]);while(s.v[r-1+i].length<c+j)s.v[r-1+i].push('');s.v[r-1+i][c-1+j]=grid[i][j];}}}
  }}
};
function makeSs(seed){
  const bag={};
  Object.entries(seed||{}).forEach(([n,rows])=>{bag[n]=new Sheet(rows);});
  return {getSheetByName:n=>bag[n]||null,insertSheet(n){if(bag[n])throw new Error('exists '+n);bag[n]=new Sheet([]);return bag[n];},names:()=>Object.keys(bag),bag};
}
const H=['姓名','群組','出席','缺席','我要認領'];
const ss=makeSs({'A 優先':[H,['甲','青職',5,2,''],['乙','大學',3,4,'']],'C 近期斷線':[H,['丙','青壯',2,20,'']],'D 全年未出席':[H,['丁','青職',0,43,''],['丁','大學',0,43,'']]});
const sheets=ss.bag;
let tokens={tok1:{sub:'U1',name:'一號',aud:'123'},tok2:{sub:'U2',name:'二號',aud:'123'},tok3:{sub:'U3',name:'三號',aud:'999'},tok4:{sub:'U4',name:'四號',aud:'123'},tok9:{sub:'U9',name:'觀察者甲',aud:'123'},tok10:{sub:'U10',name:'聖徒五本人',aud:'123'},tok11:{sub:'U11',name:'觀察者乙',aud:'123'},tokAdmin:{sub:'U_ADMIN_TEST',name:'管理者帳',aud:'123'},tokBad:{sub:'Ubad',name:'惡意',aud:'123'}};
let NOW=Date.parse('2026-11-09T00:30:00Z');
const RealDate=Date;
class FakeDate extends RealDate{constructor(...a){a.length?super(...a):super(NOW)} static now(){return NOW}}
FakeDate.UTC=RealDate.UTC;
const fmt=(d,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const pushes=[],fetches=[];let props={LOGIN_CHANNEL_ID:'123',JOSEPH_TOKEN:'test-token',SHEET_ID:'TEST_SHEET',SAINTS:'管理者,聖徒二,聖徒三,聖徒四,聖徒五,聖徒六',ADMIN_SAINT:'管理者',ADMIN_USER_ID:'U_ADMIN_TEST'};
let quota={value:200,used:50};
const triggers=[];const GROUPS={Cgood:{name:'一杯好咖啡',count:12},Cother:{name:'別的群組',count:5},Cpillar:{name:'2-4柱子們',count:6}};
function tb(fn){const t={fn,spec:{},getHandlerFunction:()=>fn};const b={timeBased:()=>b,onWeekDay:d=>(t.spec.day=d,b),onMonthDay:d=>(t.spec.mday=d,b),atHour:h=>(t.spec.hour=h,b),nearMinute:m=>(t.spec.min=m,b),inTimezone:z=>(t.spec.tz=z,b),create:()=>{triggers.push(t);return t}};return b;}
const workbooks={TEST_SHEET:ss};
const ctx={Date:FakeDate,Math,SpreadsheetApp:{openById:id=>{if(!workbooks[id]) throw new Error('refused spreadsheet '+id); return workbooks[id];},flush(){}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]},getKeys:()=>Object.keys(props)})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Logger:{log:s=>ctx._log.push(String(s))},_log:[],
 Utilities:{formatDate:(d,tz,f)=>{assert.strictEqual(f,'yyyy-MM-dd');return fmt(d,tz)},getUuid:()=>require('crypto').randomUUID()},
 ScriptApp:{WeekDay:{SUNDAY:'SUN',MONDAY:'MON',TUESDAY:'TUE',WEDNESDAY:'WED',THURSDAY:'THU',FRIDAY:'FRI',SATURDAY:'SAT'},getProjectTriggers:()=>triggers.slice(),deleteTrigger:t=>{const i=triggers.indexOf(t);if(i>=0)triggers.splice(i,1);},
   newTrigger:fn=>tb(fn)},
 UrlFetchApp:{fetch:(u,o)=>{o=o||{};fetches.push(u);
   const R=(code,body)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(body)});
   if(u.includes('/oauth2/v2.1/verify')){const t=tokens[o.payload.id_token];return t?R(200,t):R(400,{error_description:'Invalid IdToken.'});}
   if(o.headers&&o.headers.Authorization!=='Bearer '+props.JOSEPH_TOKEN) return R(401,{message:'Authentication failed'});
   if(u.endsWith('/v2/bot/info')) return R(200,{userId:'UbotJoseph',basicId:'@236bktjr',displayName:'召會助理Joseph'});
   let gm=u.match(/\/v2\/bot\/group\/([^/]+)\/(summary|members\/count)$/);
   if(gm){const g=GROUPS[decodeURIComponent(gm[1])];if(!g) return R(404,{message:'Not found'});return gm[2]==='summary'?R(200,{groupId:gm[1],groupName:g.name}):R(200,{count:g.count});}
   if(u.endsWith('/message/quota')) return R(200,{type:'limited',value:quota.value});
   if(u.endsWith('/quota/consumption')) return R(200,{totalUsage:quota.used});
   if(u.includes('/v2/bot/profile/')) return u.endsWith(encodeURIComponent(props.ADMIN_USER_ID))?R(200,{}):R(404,{message:'Not found'});
   if(u.endsWith('/message/push')){const p=JSON.parse(o.payload);assert(o.headers['X-Line-Retry-Key']);
     assert(p.messages.length>=1&&p.messages.length<=5,'1–5 message objects');
     p.messages.forEach(m=>{assert(m.altText.length<=400);assert(JSON.stringify(m.contents).length<30000,'bubble < 30KB')});
     if(p.to==='U2'||p.to==='Ubad') return R(400,{message:'Failed to send messages'});
     pushes.push(p);quota.used++;return R(200,{});}
   throw new Error('unexpected '+u);}},
 ContentService:{MimeType:{JSON:1},createTextOutput:s=>({s,setMimeType(){return this}})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'Code.gs'),'utf8'),ctx);
const call=b=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(b)}}).s);
const eqJ=(a,b)=>assert.strictEqual(JSON.stringify(a),JSON.stringify(b));
const ok=m=>console.log('✔ '+m);
const setNow=day=>{NOW=Date.parse(day+'T00:30:00Z');};
const log=()=>sheets['推播紀錄']?sheets['推播紀錄'].v.slice(1):[];
function root(){return path.join(__dirname);}

['Code.gs','index.html'].forEach(f=>{
  const t=fs.readFileSync(path.join(root(),f),'utf8');
  assert(!/SAINTS:\s*\[/.test(t),f+' 不應內嵌聖徒名單');
  assert(!/ADMIN_USER_ID:\s*['"]U/.test(t),f+' 不應內嵌管理者 userId');
  assert(!/SHEET_ID:\s*['"]1/.test(t),f+' 不應內嵌試算表 ID');
  assert(!/U[0-9a-f]{32}/.test(t),f+' 不應內嵌 LINE userId');
});
ok('程式不含內嵌聖徒名單、綁定 userId、試算表 ID');

assert.strictEqual(ctx.CONFIG.LOGIN_CHANNEL_ID,'2012397222');
assert.strictEqual(ctx.CONFIG.LIFF_URL,'https://liff.line.me/2012397222-u2XpUCRQ');
assert(ctx.CONFIG.EXEC_URL.endsWith('/exec'));
assert.strictEqual(ctx.CONFIG.RUN_DAYS,'一四六');
assert.strictEqual(ctx.CONFIG.RUN_HOUR,9);
assert.strictEqual(ctx.CONFIG.MONTHLY_HOUR,8);
assert(/加減約 15 分鐘/.test(ctx.CONFIG.SCHEDULE_NOTE)&&/08:45/.test(ctx.CONFIG.SCHEDULE_NOTE)&&/Asia\/Taipei/.test(ctx.CONFIG.SCHEDULE_NOTE)&&/不是「09 分」/.test(ctx.CONFIG.SCHEDULE_NOTE));
assert.strictEqual(ctx.SAMPLE_SPEC.counts.A,2);
assert.strictEqual(ctx.SAMPLE_SPEC.counts.B,2);
assert.strictEqual(ctx.SAMPLE_SPEC.counts.CD,4);
assert(ctx.SAMPLE_SPEC.groupPool==='未認領推薦'&&ctx.SAMPLE_SPEC.personalPool==='本人已認領回訪');
assert(ctx.SAMPLE_SPEC.assumption.includes('待教授調整'));
assert.strictEqual(ctx.WEEK_HEADERS.length,43);
assert.strictEqual(ctx.WEEK_HEADERS[0],'2025-12-29');
assert.strictEqual(ctx.WEEK_HEADERS[42],'2026-10-19');
for(let i=1;i<43;i++) assert.strictEqual(ctx.dayNum_(ctx.WEEK_HEADERS[i])-ctx.dayNum_(ctx.WEEK_HEADERS[i-1]),7);
const structureOk={'2-4':{A:35,B:16,C:37,D:599,total:687},'2-6':248,'2-7':71,candidates:1006,sameNameGroups:12,sameNameRows:25,reviewNameGroups:14,reviewNameRows:30,claims:139,visits:22,pendingAsD:false,pendingNotPending:false};
assert.strictEqual(ctx.mismatchesAgainstExpected_(structureOk).length,0);
assert.strictEqual(ctx.structureMismatches_(Object.assign({},structureOk,{claims:200,visits:40}),ctx.ROSTER_MANIFEST_V1).length,0);
assert(ctx.liveDelta_(Object.assign({},structureOk,{claims:200,visits:40}),ctx.ROSTER_MANIFEST_V1).note.includes('比參考多'));
assert(ctx.mismatchesAgainstExpected_(Object.assign({},structureOk,{pendingAsD:true})).some(s=>/D/.test(s)));
assert.strictEqual(ctx.attendanceCount_('26 / 43').ok, true);
assert.strictEqual(ctx.attendanceCount_('26 / 43').n, 26);
assert.strictEqual(ctx.classifyVerified_(26, 4), 'A');
assert.strictEqual(ctx.classifyVerified_(ctx.attendanceCount_('0 / 43').n, 43), 'D');
assert.strictEqual(ctx.attendanceCount_('很多').ok, false);
assert.strictEqual(ctx.reviewNameKey_('甲-2'), '甲');
assert.strictEqual(ctx.reviewNameKey_('甲_2'), '甲');
assert.notStrictEqual(ctx.normalizeName_('甲2'), ctx.normalizeName_('甲3'));
assert.strictEqual(ctx.nameGroupStats_(['甲','甲','乙']).groups, 1);
assert.strictEqual(ctx.nameGroupStats_(['甲','甲','乙']).rows, 2);
assert(ctx.structureMismatches_(Object.assign({}, structureOk, { sameNameGroups: 14, sameNameRows: 30 }), ctx.ROSTER_MANIFEST_V1).some(function (e) { return e.indexOf('精確同名') >= 0; }));
assert.strictEqual(ctx.classifyVerified_(5,0),'B');
assert.strictEqual(ctx.classifyVerified_(5,1),'B');
assert.strictEqual(ctx.classifyVerified_(5,2),'A');
assert.strictEqual(ctx.classifyVerified_(5,12),'A');
assert.strictEqual(ctx.classifyVerified_(1,13),'C');
assert.strictEqual(ctx.classifyVerified_(0,43),'D');
assert.strictEqual(ctx.classifyVerified_(0,0),'D');
assert.strictEqual(ctx.CONFIG.CYCLE['B 穩定'],30);
ok('公開 LIFF／channel、一四六 09:00、月報 08:00、43 週；名單結構有門檻，認領／回訪沒有');

let r=call({action:'init',idToken:'bad'});assert(!r.ok);ok('bad token rejected: '+r.error);
r=call({action:'init',idToken:'tok3'});assert(!r.ok);ok('wrong aud rejected: '+r.error);
r=call({action:'init',idToken:'tok1'});assert(r.ok&&!r.bound&&r.data===null&&r.readOnly===false);
r=call({action:'submit',idToken:'tok1',claims:[{key:'A 優先|2',name:'甲'}]});assert(!r.ok&&/未綁定/.test(r.error));ok('unbound submit rejected');
r=call({action:'visits',idToken:'tok1'});assert(!r.ok);ok('unbound visits rejected');
r=call({action:'bind',idToken:'tok1',saint:'路人'});assert(!r.ok);
r=call({action:'bind',idToken:'tok1',saint:'管理者'});assert(r.ok&&r.role==='saint'&&r.readOnly===false);
r=call({action:'bind',idToken:'tok2',saint:'管理者'});assert(!r.ok);ok('dup saint bind rejected');
r=call({action:'bind',idToken:'tok2',saint:'聖徒二'});assert(r.ok);
r=call({action:'submit',idToken:'tok1',userId:'U2',claims:[{key:'A 優先|2',name:'甲'},{key:'D 全年未出席|3',name:'丁'}]});
assert(r.ok&&r.claimed.length===2);assert(sheets['A 優先'].v[1][4]==='管理者'&&sheets['D 全年未出席'].v[2][4]==='管理者'&&sheets['D 全年未出席'].v[1][4]==='');ok('userId from body ignored; claims by token');
r=call({action:'submit',idToken:'tok2',claims:[{key:'A 優先|2',name:'甲'},{key:'A 優先|3',name:'乙'}],releases:[{key:'D 全年未出席|3',name:'丁'}]});
assert(r.conflicts.length===1&&r.claimed.length===1&&r.released.length===0&&sheets['D 全年未出席'].v[2][4]==='管理者');ok('conflict: '+r.conflicts[0].reason);
r=call({action:'submit',idToken:'tok1',releases:[{key:'D 全年未出席|3',name:'丁'}]});assert(r.released.length===1&&sheets['D 全年未出席'].v[2][4]==='');
r=call({action:'submit',idToken:'tok1',claims:[{key:'C 近期斷線|2',name:'錯名'}]});assert(r.conflicts[0].reason==='資料已變動');
r=call({action:'submit',idToken:'tok1',claims:[{key:'原始出席|2',name:'x'}]});assert(!r.ok);
r=call({action:'init',idToken:'tok1'});
['key','name','group','att','absent','by','tier','attendanceStatus','district'].forEach(k=>assert(k in r.data['A 優先'][0]));
assert.strictEqual(r.data['A 優先'][0].attendanceStatus,'verified');
eqJ(Object.keys(r.data),['A 優先','B 穩定','C 近期斷線','D 全年未出席','待核實']);ok('claim flow keeps legacy keys and exposes B／待核實 tabs');
r=call({action:'submit',idToken:'tok1',claims:[{key:'C 近期斷線|2',name:'丙'},{key:'D 全年未出席|3',name:'丁'}]});assert(r.claimed.length===2);

r=call({action:'visits',idToken:'tok1'});assert(r.ok&&r.today==='2026-11-09');
assert(sheets['回訪紀錄'].v[0][0]==='時間戳'&&sheets['回訪紀錄'].v[0][8]==='資料鍵');ok('回訪紀錄 tab auto-created');
eqJ(r.people.map(p=>p.name+':'+p.tier+':'+p.never+':'+p.due).sort(),['丁:D:true:2026-11-09','丙:C:true:2026-11-09','甲:A:true:2026-11-09']);ok('never visited → due today');
const rec=(tok,o)=>call(Object.assign({action:'record',idToken:tok},o));
r=rec('tok1',{key:'A 優先|2',name:'甲',date:'2026-11-01',method:'見面',status:'順利聯繫',note:'=HYPERLINK("x")'});assert(r.ok);
let last=sheets['回訪紀錄'].v.at(-1);eqJ(last.slice(1),['管理者','A 優先','甲','2026-11-01','見面','順利聯繫',"'=HYPERLINK(\"x\")",'A 優先|2']);ok('record appended; formula injection neutralised');
let p=r.people.find(x=>x.name==='甲');assert(p.due==='2026-11-08'&&p.overdue===1&&p.last==='2026-11-01');ok('A: 11/1 + 7 = 11/8 → 逾期 1 天');
r=rec('tok1',{key:'A 優先|2',name:'甲',date:'2026-11-10',method:'見面',status:'順利聯繫'});assert(!r.ok&&/未來/.test(r.error));ok('future date rejected');
r=rec('tok1',{key:'A 優先|2',name:'甲',date:'2026/11/05',method:'見面',status:'順利聯繫'});assert(!r.ok);ok('bad date format rejected');
r=rec('tok1',{key:'A 優先|2',name:'甲',date:'2026-11-05',method:'飛鴿',status:'順利聯繫'});assert(!r.ok);ok('bad method rejected');
r=rec('tok1',{key:'A 優先|2',name:'甲',date:'2026-11-05',method:'電話',status:'很好'});assert(!r.ok);ok('bad status rejected');
r=rec('tok1',{key:'A 優先|2',name:'乙',date:'2026-11-05',method:'電話',status:'順利聯繫'});assert(!r.ok&&/變動/.test(r.error));ok('name mismatch rejected');
r=rec('tok1',{key:'A 優先|3',name:'乙',date:'2026-11-05',method:'電話',status:'順利聯繫'});assert(!r.ok&&/不是您認領/.test(r.error));ok('cannot record someone claimed by another saint');
r=rec('tok1',{key:'原始出席|2',name:'x',date:'2026-11-05',method:'電話',status:'順利聯繫'});assert(!r.ok);
r=rec('tok4',{key:'A 優先|2',name:'甲',date:'2026-11-05',method:'電話',status:'順利聯繫'});assert(!r.ok&&/綁定/.test(r.error));ok('unbound record rejected');
sheets['回訪紀錄'].v.push([new RealDate(),'管理者','C 近期斷線','丙',new RealDate(Date.parse('2026-10-26T16:00:00Z')),'電話','未聯繫上','','C 近期斷線|2']);
r=rec('tok1',{key:'C 近期斷線|2',name:'丙',date:'2026-11-09',method:'LINE',status:'願意來聚會',note:'下週主日會來'});
p=r.people.find(x=>x.name==='丙');assert(p.due==='2026-11-23'&&p.overdue===-14&&p.history.length===2&&p.history[0].status==='願意來聚會');ok('C: 11/9 + 14 = 11/23; Date cell read in Asia/Taipei');
sheets['回訪紀錄'].v.push([new RealDate(),'聖徒二','D 全年未出席','丁','2026-10-01','見面','順利聯繫','','D 全年未出席|2']);
r=call({action:'visits',idToken:'tok1'});p=r.people.find(x=>x.name==='丁');assert(p.never);ok('duplicate name: other row record not mixed in');
r=rec('tok1',{key:'D 全年未出席|3',name:'丁',date:'2026-10-05',method:'其他',status:'未聯繫上'});p=r.people.find(x=>x.name==='丁');
assert(p.due==='2026-11-04'&&p.overdue===5);ok('D: 10/5 + 30 = 11/4 → 逾期 5 天');
eqJ(r.people.map(x=>x.name),['丁','甲','丙']);ok('sorted most-overdue first');

triggers.push({fn:'keepMe',spec:{hour:1},getHandlerFunction:()=>'keepMe'});
ctx.setupTriggers();ctx.setupTriggers();
assert(triggers.some(t=>t.fn==='keepMe'));
const weekly=triggers.filter(t=>t.fn==='sendReminders');
eqJ(weekly.map(t=>t.spec.day).sort(),['MON','SAT','THU']);
assert(weekly.every(t=>t.spec.hour===9&&t.spec.min===0&&t.spec.tz==='Asia/Taipei'));
const monthly=triggers.filter(t=>t.fn==='sendMonthlySummary');
assert.strictEqual(monthly.length,1);
assert.strictEqual(monthly[0].spec.hour,8);
assert.strictEqual(monthly[0].spec.mday,1);
assert(!weekly.some(t=>t.spec.day==='WED'||t.spec.day==='FRI'||t.spec.hour===8));
assert(/15 分鐘/.test(ctx._log.at(-1))&&/08:45/.test(ctx._log.at(-1))&&/Asia\/Taipei/.test(ctx._log.at(-1))&&/不是「09 分」/.test(ctx._log.at(-1)));
assert(weekly.every(t=>t.spec.tz==='Asia/Taipei'&&t.spec.min===0&&t.spec.hour===9));
props.GROUP_PUSH_DAYS='一三五';props.PERSONAL_DAYS='一三五';ctx.setupTriggers();
assert(triggers.filter(t=>t.fn==='sendReminders').every(t=>['MON','THU','SAT'].includes(t.spec.day)&&t.spec.hour===9));
delete props.GROUP_PUSH_DAYS;delete props.PERSONAL_DAYS;
ok('setupTriggers：只留週一四六 09:00＋每月 1 日 08:00，清掉舊觸發，保留其他函式');
const paused=ctx.pauseReminderTriggers();
assert.strictEqual(paused.created,0);
assert.strictEqual(triggers.filter(t=>t.fn==='sendReminders'||t.fn==='sendMonthlySummary').length,0);
assert(triggers.some(t=>t.fn==='keepMe'));
ctx.setupTriggers();
assert(triggers.filter(t=>t.fn==='sendReminders').length===3);ok('pauseReminderTriggers 只刪提醒與月報，不建立新觸發');
const health=JSON.parse(ctx.doGet().s);
assert.strictEqual(health.apiVersion,'2026-11-name-link-1');
assert.strictEqual(health.nameEntry,'row-stable-id');
assert(health.features.indexOf('observer')>=0&&health.features.indexOf('pending-not-D')>=0&&health.features.indexOf('name-link')>=0);
assert(health.features.indexOf('co-care')<0&&health.features.indexOf('claimed-group-sample')<0);
assert(health.apiVersion!=='2026-11-release-7');
let ready=ctx.releaseReadiness();
assert(ready.ok&&ready.reminderTriggers>0&&ready.nameEntry==='row-stable-id'&&ready.apiVersion==='2026-11-name-link-1');
const savedSheet=props.SHEET_ID;delete props.SHEET_ID;
ready=ctx.releaseReadiness();
assert(!ready.ok&&String(ready.missingProperties).includes('SHEET_ID'));
props.SHEET_ID=savedSheet;ok('doGet apiVersion and readiness check do not read a roster');
assert.strictEqual(ctx.nextRunDay_('2026-11-09'),'2026-11-12');
assert.strictEqual(ctx.nextRunDay_('2026-11-12'),'2026-11-14');
assert.strictEqual(ctx.nextRunDay_('2026-11-14'),'2026-11-16');
assert.strictEqual(ctx.nextRunDay_('2026-11-11'),'2026-11-12');
assert.strictEqual(ctx.weekStart_('2026-11-13'),'2026-11-09');
assert.strictEqual(ctx.weekday_('2026-11-09'),'一');ok('next-run Mon/Thu/Sat and weekday math');

let R=ctx.buildReminders_(ss);
assert.strictEqual(R.per['管理者'].overdue.map(x=>x.name).join(),'丁,甲');
assert.strictEqual(R.per['管理者'].due.length,0);
assert.strictEqual(R.weekTotal,1);
eqJ(R.unclaimed,{'A 優先':0,'B 穩定':0,'C 近期斷線':0,'D 全年未出席':1,'待核實':0});
let planned=ctx.planPersonalSamples_(ss,'2026-11-09');
assert(planned.samples['管理者'].list.some(x=>x.name==='甲')&&planned.samples['聖徒二'].list.some(x=>x.name==='乙'));
assert(planned.samples['聖徒三'].list.length===0);
ctx.sendReminders();
assert.strictEqual(pushes.length,1);
assert.strictEqual(pushes[0].to,'U_ADMIN_TEST');
assert.strictEqual(pushes[0].messages.length,1);
assert(log().some(l=>l[2]==='聖徒二'&&l[5]==='失敗'));
const bubble=JSON.stringify(pushes[0].messages[0].contents);
assert(bubble.includes('已逾期')&&bubble.includes('liff.line.me/2012397222-u2XpUCRQ?v=1'));
assert(bubble.includes('本人已認領回訪')&&!bubble.includes('回訪總覽')&&!bubble.includes('還在等人認領'));
ok('個人抽樣不含總覽；管理者一則、未綁定或無回訪略過、推不到的帳號只記失敗');
pushes.length=0;quota.used=200;ctx.sendReminders();assert.strictEqual(pushes.length,0);assert(log().some(l=>l[5]==='略過'&&/則數/.test(l[6])));ok('quota exhausted → skip, no push');quota.used=60;
delete props.JOSEPH_TOKEN;ctx.sendReminders();assert(log().some(l=>/JOSEPH_TOKEN/.test(l[6])));props.JOSEPH_TOKEN='test-token';ok('missing JOSEPH_TOKEN → logged');
NOW=Date.parse('2026-11-10T23:30:00Z');assert.strictEqual(ctx.today_(),'2026-11-11');ok('today_() uses Asia/Taipei');
setNow('2026-11-09');
NOW=Date.parse('2026-11-10T02:00:00Z');rec('tok1',{key:'A 優先|2',name:'甲',date:'2026-11-10',method:'見面',status:'願意來聚會'});
R=ctx.buildReminders_(ss,'2026-11-14');assert(!R.per['管理者'].due.some(x=>x.name==='甲')&&!R.per['管理者'].overdue.some(x=>x.name==='甲'));
R=ctx.buildReminders_(ss,'2026-11-16');assert(R.per['管理者'].due.some(x=>x.name==='甲'));
R=ctx.buildReminders_(ss,'2026-11-19');assert(R.per['管理者'].overdue.some(x=>x.name==='甲'&&x.st.overdue===2));ok('due window follows Mon/Thu/Sat: 11/14 hidden, 11/16 due, 11/19 overdue 2');
setNow('2026-11-09');
ctx.checkPushTargets();assert(ctx._log.at(-1).includes('可以收到')&&ctx._log.at(-1).includes('聖徒二：收不到'));ok('checkPushTargets uses script-property admin id');
const beforePreview=log().length;const beforeSample=sheets['抽樣紀錄']?sheets['抽樣紀錄'].v.length:0;
pushes.length=0;ctx.previewRemindersToAdmin();assert(pushes.length===1&&pushes[0].to==='U_ADMIN_TEST');
assert.strictEqual(log().length,beforePreview);assert.strictEqual(sheets['抽樣紀錄']?sheets['抽樣紀錄'].v.length:0,beforeSample);ok('preview pushes to admin and writes no send／sample record');

const M=ctx.buildMonthly_(ss,'2026-12-01');
assert.strictEqual(M.from,'2026-11-01');assert.strictEqual(M.to,'2026-11-30');
assert.strictEqual(M.perSaint['管理者'].records,3);assert.strictEqual(Object.keys(M.perSaint['管理者'].people).length,2);
eqJ(M.improved.map(x=>x.name+':'+x.from+'→'+x.to).sort(),['丙:未聯繫上→願意來聚會','甲:順利聯繫→願意來聚會']);
assert.strictEqual(M.claimed,4);assert.strictEqual(M.visitedClaimed,2);ok('monthly keeps Nov range and existing visit totals');
assert.strictEqual(ctx.buildMonthly_(ss,'2027-01-01').from,'2026-12-01');ok('January run → December range');
pushes.length=0;ctx.sendMonthlySummary();assert(pushes.length===1&&pushes[0].to==='U_ADMIN_TEST'&&pushes[0].messages.length===1);ok('monthly summary pushed to admin only, schedule unchanged');

const hook=(body,k)=>ctx.doPost({parameter:k?{k}:{},postData:{contents:JSON.stringify(body)}});
let wr=hook({destination:'UbotJoseph',events:[]});assert.strictEqual(wr,undefined);ok('webhook returns nothing');
ctx.setupJoseph();assert.strictEqual(props.JOSEPH_BOT_USERID,'UbotJoseph');assert(/^[0-9a-f]{32}$/.test(props.WEBHOOK_KEY));
assert(ctx._log.at(-1).includes(ctx.CONFIG.EXEC_URL+'?k='+props.WEBHOOK_KEY));ok('setupJoseph prints webhook on the same /exec');
const K=props.WEBHOOK_KEY;const gev=(type,gid,extra)=>Object.assign({type,timestamp:Date.parse('2026-11-05T07:00:00Z'),source:{type:'group',groupId:gid,userId:'Usomeone'},replyToken:'r'},extra||{});
hook({destination:'UbotJoseph',events:[gev('join','Cfake')]});hook({destination:'Uother',events:[gev('join','Cfake')]},K);
assert.strictEqual(sheets['群組紀錄'].v.length,1);ok('webhook without key / wrong destination ignored');
hook({destination:'UbotJoseph',events:[gev('message','Cgood',{message:{type:'text',text:'私密內容'}}),gev('message','Cgood',{message:{type:'text',text:'第二則'}}),gev('message','Cother',{message:{type:'text',text:'x'}}),
  {type:'follow',timestamp:1,source:{type:'user',userId:'Ufriend'}},{type:'message',timestamp:1,source:{type:'user',userId:'Ufriend'},message:{type:'text',text:'hi'}}]},K);
const Glog=sheets['群組紀錄'].v;assert.strictEqual(Glog.length,4);assert(!JSON.stringify(Glog).includes('私密內容')&&!JSON.stringify(Glog).includes('hi'));
eqJ(Glog.slice(1).map(row=>row[1]+':'+row[2]+':'+row[3]),['message:Cgood:group','message:Cother:group','follow:Ufriend:user']);ok('group IDs recorded once, no message text');
assert(!fetches.some(u=>u.includes('/reply')));ok('never auto-replies');
r=call({action:'init',idToken:'tok1'});assert(r.ok&&r.bound);r=call({action:'init'});assert(!r.ok&&/ID token/.test(r.error));ok('LIFF POSTs still distinguished from webhook');

pushes.length=0;assert.strictEqual(ctx.pushGroupReminder(),0);assert(log().at(-1)[6].includes('GROUP_PUSH_ENABLED'));ok('group sample stays off unless GROUP_PUSH_ENABLED=true');
props.GROUP_PUSH_ENABLED='true';
setNow('2026-11-12');
eqJ(ctx.groupNames_(),['一杯好咖啡','2-4柱子們']);
assert.strictEqual(ctx.pushGroupReminder(),1);eqJ(pushes.map(p=>p.to),['Cgood']);
const firstGroup=JSON.stringify(pushes[0].messages);
assert(log().some(l=>l[1]==='群組抽樣'&&l[2]==='2-4柱子們'&&l[5]==='失敗'&&/找不到這個群組的 ID/.test(l[6])));
assert(!pushes.some(p=>p.to==='Cother'));
const gb=JSON.stringify(pushes[0].messages[0].contents);
assert(gb.includes('未認領推薦')&&gb.includes('2012397222-u2XpUCRQ')&&!gb.includes('回訪總覽')&&!gb.includes('還在等人認領'));
ok('one group missing → logged, the other gets the shared unclaimed sample');
hook({destination:'UbotJoseph',events:[gev('join','Cpillar')]},K);
pushes.length=0;assert.strictEqual(ctx.pushGroupReminder(),1);eqJ(pushes.map(p=>p.to),['Cpillar']);
assert.strictEqual(JSON.stringify(pushes[0].messages),firstGroup);ok('same-day second group reuses the sample and does not resend the first group');
setNow('2026-11-14');GROUPS.Cpillar.name='改名了';pushes.length=0;assert.strictEqual(ctx.pushGroupReminder(),1);eqJ(pushes.map(p=>p.to),['Cgood']);
assert(log().some(l=>l[2]==='2-4柱子們'&&l[5]==='失敗'));GROUPS.Cpillar.name='2-4柱子們';ok('renamed cached group is not pushed');
setNow('2026-11-16');quota.used=185;pushes.length=0;assert.strictEqual(ctx.pushGroupReminder(),1);eqJ(pushes.map(p=>p.to),['Cgood']);
assert(log().at(-1)[2]==='2-4柱子們'&&log().at(-1)[6].includes('本月剩 3 則，群組 6 人'));
setNow('2026-11-19');quota.used=195;pushes.length=0;assert.strictEqual(ctx.pushGroupReminder(),0);assert(log().slice(-2).every(l=>l[5]==='略過'));quota.used=60;ok('quota checked per group');
setNow('2026-11-21');props.GROUP_NAMES='2-4柱子們';pushes.length=0;assert.strictEqual(ctx.pushGroupReminder(),1);eqJ(pushes.map(p=>p.to),['Cpillar']);
props.GROUP_NAMES='一杯好咖啡, 2-4柱子們';eqJ(ctx.groupNames_(),['一杯好咖啡','2-4柱子們']);delete props.GROUP_NAMES;ok('GROUP_NAMES override still works');
const runOn=iso=>{NOW=Date.parse(iso);pushes.length=0;ctx.sendReminders();return {personal:pushes.filter(p=>String(p.to).startsWith('U')).length,groups:pushes.filter(p=>String(p.to).startsWith('C')).map(p=>p.to)};};
let w=runOn('2026-11-23T00:30:00Z');assert(w.personal>0);eqJ(w.groups,['Cgood','Cpillar']);assert.strictEqual(JSON.stringify(pushes.filter(p=>String(p.to).startsWith('C'))[0].messages),JSON.stringify(pushes.filter(p=>String(p.to).startsWith('C'))[1].messages));ok('Monday: personal + both groups share one sample');
const again=pushes.length;w=runOn('2026-11-23T00:30:00Z');assert.strictEqual(w.personal+w.groups.length,0);ok('same-day rerun sends nothing');
w=runOn('2026-11-25T00:30:00Z');assert.strictEqual(w.personal+w.groups.length,0);ok('Wednesday sends nothing even if old property said so');
w=runOn('2026-11-26T00:30:00Z');assert(w.personal>0&&w.groups.length===2);ok('Thursday sends personal and both groups');
w=runOn('2026-11-10T00:30:00Z');assert.strictEqual(w.personal+w.groups.length,0);ok('Tuesday sends nothing');
props.GROUP_PUSH_ENABLED='false';w=runOn('2026-11-28T00:30:00Z');assert.strictEqual(w.groups.length,0);props.GROUP_PUSH_ENABLED='true';ok('flag off: Saturday has no group push');
hook({destination:'UbotJoseph',events:[gev('leave','Cgood')]},K);delete GROUPS.Cgood;setNow('2026-11-30');pushes.length=0;assert.strictEqual(ctx.pushGroupReminder(),1);eqJ(pushes.map(p=>p.to),['Cpillar']);ok('after leave, only the remaining allowed group is pushed');

function seqRng(xs){let i=0;return()=>xs[i++ % xs.length];}
let pools=ctx.poolsFrom_([
  {tier:'A',attendanceStatus:'verified',tab:'A 優先',name:'A1',key:'a1'},{tier:'A',attendanceStatus:'verified',tab:'A 優先',name:'A2',key:'a2'},{tier:'A',attendanceStatus:'verified',tab:'A 優先',name:'A3',key:'a3'},
  {tier:'B',attendanceStatus:'verified',tab:'B 穩定',name:'B1',key:'b1'},{tier:'B',attendanceStatus:'verified',tab:'B 穩定',name:'B2',key:'b2'},{tier:'B',attendanceStatus:'verified',tab:'B 穩定',name:'B3',key:'b3'},
  {tier:'C',attendanceStatus:'verified',tab:'C 近期斷線',name:'C1',key:'c1'},{tier:'D',attendanceStatus:'verified',tab:'D 全年未出席',name:'D1',key:'d1'},{tier:'D',attendanceStatus:'verified',tab:'D 全年未出席',name:'D2',key:'d2'},{tier:'D',attendanceStatus:'verified',tab:'D 全年未出席',name:'D3',key:'d3'},
  {tier:'D',attendanceStatus:'pending',tab:'待核實',name:'P1',key:'p1'},{tier:'待核實',attendanceStatus:'pending',tab:'待核實',name:'P2',key:'p2'}
]);
let drawn=ctx.drawSample_(pools,ctx.SAMPLE_SPEC.counts,seqRng([0,0.99,0.5,0.2,0.1,0.3,0.4,0.7]));
assert.strictEqual(drawn.A.length,2);assert.strictEqual(drawn.B.length,2);assert.strictEqual(drawn.CD.length,4);assert.strictEqual(drawn.list.length,8);
assert(!drawn.list.some(p=>p.attendanceStatus==='pending'||p.tier==='待核實'));
assert.strictEqual(new Set(drawn.list.map(p=>p.key)).size,8);
assert.strictEqual(pools.A.length,3);ok('full pool draws A2 B2 CD4, no pending, no duplicates, source pool untouched');
drawn=ctx.drawSample_(ctx.poolsFrom_([{tier:'A',attendanceStatus:'verified',tab:'A 優先',key:'a',name:'onlyA'},{tier:'C',attendanceStatus:'verified',tab:'C 近期斷線',key:'c',name:'onlyC'},{tier:'待核實',attendanceStatus:'pending',tab:'待核實',key:'p',name:'pend'}]),ctx.SAMPLE_SPEC.counts,()=>0);
assert.strictEqual(drawn.A.length,1);assert.strictEqual(drawn.B.length,0);assert.strictEqual(drawn.CD.length,1);assert(!drawn.list.some(p=>p.key==='p'));ok('short pool is not padded across tiers or from pending');
drawn=ctx.drawSample_(ctx.poolsFrom_([]),ctx.SAMPLE_SPEC.counts,()=>0);assert.strictEqual(drawn.list.length,0);ok('empty pool draws nothing');
const many=[];for(let i=0;i<10;i++) many.push({tier:'D',attendanceStatus:'verified',tab:'D 全年未出席',key:'d'+i,name:'D'+i});
drawn=ctx.drawSample_(ctx.poolsFrom_(many.concat([{tier:'A',attendanceStatus:'verified',tab:'A 優先',key:'ax',name:'AX'}])),ctx.SAMPLE_SPEC.counts,seqRng([0.1]));
assert.strictEqual(drawn.CD.length,4);assert.strictEqual(drawn.A.length,1);assert.strictEqual(new Set(drawn.CD.map(p=>p.key)).size,4);ok('CD shortage does not borrow A, and CD itself has no duplicates');

function withSs(local,fn){const prev=ctx.SpreadsheetApp.openById;ctx.SpreadsheetApp.openById=()=>local;try{return fn();}finally{ctx.SpreadsheetApp.openById=prev;}}
const HH=['姓名','群組','出席','缺席','我要認領'];
const priv=makeSs({'A 優先':[HH,['甲','G',5,4,''],['乙','G',3,4,'']],'B 穩定':[HH], 'C 近期斷線':[HH], 'D 全年未出席':[HH], '待核實':[HH,['待核人','新',0,43,'']]});
withSs(priv,()=>{
  let x=call({action:'bindObserver',idToken:'tok9'});assert(x.ok&&x.readOnly&&x.role==='observer'&&x.saint===null&&x.data);ok('observer binds without choosing a saint');
  x=call({action:'init',idToken:'tok9'});assert(x.bound&&x.readOnly&&x.saint===null);ok('observer session is read-only');
  x=call({action:'submit',idToken:'tok9',claims:[{key:'A 優先|2',name:'甲'}]});assert(!x.ok&&/觀察者/.test(x.error));assert(priv.bag['A 優先'].v[1][4]==='');ok('observer cannot claim');
  x=call({action:'record',idToken:'tok9',key:'A 優先|2',name:'甲',date:'2026-11-09',method:'電話',status:'順利聯繫'});assert(!x.ok&&/觀察者/.test(x.error));ok('observer cannot record');
  x=call({action:'bind',idToken:'tok9',saint:'聖徒五'});assert(!x.ok);ok('observer cannot self-promote into a saint');
  x=call({action:'bind',idToken:'tok10',saint:'聖徒五'});assert(x.ok&&x.role==='saint');ok('observer does not occupy the saint');
  x=call({action:'bindObserver',idToken:'tok10'});assert(!x.ok);ok('bound saint cannot switch itself to observer');
  x=call({action:'bindObserver',idToken:'tok11'});assert(x.ok&&x.role==='observer');ok('more than one observer is allowed');
  const namesBefore=priv.names().slice();
  x=ctx.collectMigrationInput_(priv);assert(x.error&&/SOURCE_24_SHEET_ID/.test(x.error));eqJ(priv.names(),namesBefore);ok('migration refuses before 2-4/2-6/2-7 source ids exist and writes nothing');
});

const repair=makeSs({'A 優先':[HH,['甲','G',5,4,'聖徒六'],['乙','G',3,6,'聖徒六']],'C 近期斷線':[HH],'D 全年未出席':[HH],'LINE綁定':[['userId','displayName','聖徒姓名','綁定時間','角色'],['U1','管理者顯示','管理者',new RealDate(),'saint'],['Ubad','占用顯示名','聖徒六',new RealDate(),'saint'],['U2','二號','聖徒二',new RealDate(),'saint']]});
withSs(repair,()=>{
  let x=call({action:'adminRepair',idToken:'tokBad',mode:'confirm',confirm:true,op:'deleteAll',saint:'聖徒六',expectDisplayName:'占用顯示名'});
  assert(!x.ok);assert.strictEqual(repair.bag['LINE綁定'].v.length,4);ok('non-admin cannot repair');
  x=ctx.repairBinding_(repair,{mode:'dry-run',op:'release',saint:'聖徒六',expectDisplayName:'占用顯示名'});
  assert(x.ok&&x.dryRun&&x.wrote===false&&x.report.claimCount===2&&x.report.visitCount===0&&x.report.displayName==='占用顯示名');
  assert.strictEqual(repair.bag['LINE綁定'].v.length,4);assert(repair.bag['A 優先'].v[1][4]==='聖徒六');ok('dry-run reports the occupied saint and writes nothing');
  x=ctx.repairBinding_(repair,{mode:'confirm',confirm:true,op:'release',saint:'聖徒六',expectDisplayName:'不是這個人'});
  assert(!x.ok&&x.wrote===false);assert.strictEqual(repair.bag['LINE綁定'].v.length,4);ok('wrong display name aborts');
  x=ctx.repairBinding_(repair,{mode:'confirm',confirm:true,op:'deleteAll',saint:'聖徒六',expectDisplayName:'占用顯示名'});
  assert(!x.ok&&x.wrote===false);assert.strictEqual(repair.bag['LINE綁定'].v.length,4);ok('unknown repair op does not delete');
  x=ctx.repairBinding_(repair,{mode:'confirm',confirm:true,op:'transfer',saint:'聖徒六',expectDisplayName:'占用顯示名',toUserId:'U1'});
  assert(!x.ok&&/已有綁定/.test(x.error));assert.strictEqual(repair.bag['LINE綁定'].v[2][0],'Ubad');ok('cannot transfer onto an already bound LINE');
  x=ctx.repairBinding_(repair,{mode:'confirm',confirm:true,op:'release',saint:'聖徒六',expectDisplayName:'占用顯示名'});
  assert(x.ok&&x.wrote&&x.claimsPreserved);
  assert(repair.bag['A 優先'].v[1][4]==='聖徒六'&&repair.bag['A 優先'].v[2][4]==='聖徒六');
  assert(repair.bag['LINE綁定'].v.some(row=>row[2]==='管理者')&&repair.bag['LINE綁定'].v.some(row=>row[2]==='聖徒二'));
  assert(!repair.bag['LINE綁定'].v.some(row=>row[2]==='聖徒六'));ok('release removes only that binding and keeps both claims');
  x=call({action:'bind',idToken:'tok4',saint:'聖徒六'});assert(x.ok&&x.saint==='聖徒六');
  x=call({action:'bind',idToken:'tokBad',saint:'聖徒六'});assert(!x.ok);
  assert.strictEqual(repair.bag['A 優先'].v[1][4],'聖徒六');ok('after release the saint can bind once; another LINE cannot take it');
});

function grid(rows){
  const header=['#','姓名','大區','小區','排','群組','出席','出席率','最近出席','缺席週'].concat(ctx.WEEK_HEADERS);
  const g=[['標題'],['副標'],header];
  rows.forEach(r=>{
    const line=['',r.name,r.area||'',r.small||'',r.rank||'',r.group,r.att,'', '',r.absent];
    const weeks=r.weeks||Array(43).fill(0);
    weeks.forEach(n=>line.push(n));
    g.push(line);
  });
  return g;
}
const legacy={
  'A 優先':[{row:2,name:'甲',group:'青職',att:5,absent:4,by:'管理者'}],
  'C 近期斷線':[{row:2,name:'丙',group:'青壯',att:1,absent:20,by:''}],
  'D 全年未出席':[{row:2,name:'丁',group:'青職',att:0,absent:43,by:'管理者'},{row:3,name:'丁',group:'大學',att:0,absent:43,by:''}]
};
const source24=[
  {sourceRow:4,name:'甲',group:'青職',att:5,absent:4},
  {sourceRow:5,name:'丙',group:'青壯',att:1,absent:20},
  {sourceRow:6,name:'丁',group:'青職',att:0,absent:43},
  {sourceRow:7,name:'丁',group:'大學',att:0,absent:43},
  {sourceRow:8,name:'穩',group:'青職',att:10,absent:0},
  {sourceRow:9,name:'穩二',group:'大學',att:8,absent:1}
];
let input={legacy,source24,source26:[
  {sourceRow:4,name:'王小明',group:'一',att:0,absent:43,allZero:true,weeks:Array(43).fill(0)},
  {sourceRow:4,name:'王小明',group:'一',att:0,absent:43,allZero:true,weeks:Array(43).fill(0)},
  {sourceRow:5,name:'王小明',group:'二',att:0,absent:43,allZero:true,weeks:Array(43).fill(0)},
  {sourceRow:6,name:'王 小明',group:'三',att:0,absent:43,allZero:true,weeks:Array(43).fill(0)},
  {sourceRow:7,name:'王小明2',group:'四',att:0,absent:43,allZero:true,weeks:Array(43).fill(0)}
],source27:[{sourceRow:4,name:'新区人',group:'五',att:0,absent:43,allZero:true,weeks:Array(43).fill(0)},{sourceRow:8,name:'有數字',group:'六',att:3,absent:1,allZero:false,weeks:[1].concat(Array(42).fill(0))}],
visits:[{key:'A 優先|2',name:'甲'},{key:'D 全年未出席|2',name:'丁'},{key:'D 全年未出席|3',name:'丁'}]};
let plan=ctx.buildMigrationPlan_(input);
assert(plan.ok,plan.errors.join(';'));
assert(plan.people.filter(p=>p.tier==='B').length===2);
assert(plan.people.filter(p=>p.district==='2-6').every(p=>p.tier==='待核實'&&p.attendanceStatus==='pending'));
assert(plan.people.filter(p=>p.district==='2-7').every(p=>p.attendanceStatus==='pending'&&p.tier!=='D'));
assert.strictEqual(plan.people.filter(p=>p.district==='2-6'&&p.name==='王小明').length,2);
assert.strictEqual(plan.people.filter(p=>p.norm==='王 小明'||p.norm==='王小明2'||p.norm==='王小明').length,4);
const ids26=plan.people.filter(p=>p.district==='2-6').map(p=>p.stableId);
assert.strictEqual(new Set(ids26).size,ids26.length);
assert(plan.warnings.some(w=>w.includes('2-7')));
const d2=plan.people.find(p=>p.legacyKey==='D 全年未出席|2');
const d3=plan.people.find(p=>p.legacyKey==='D 全年未出席|3');
assert(d2.stableId!==d3.stableId);
assert(plan.visitMap.find(v=>v.oldKey==='D 全年未出席|2').stableId===d2.stableId);
assert(plan.visitMap.find(v=>v.oldKey==='D 全年未出席|3').stableId===d3.stableId);
assert(plan.visitMap.find(v=>v.oldKey==='A 優先|2').stableId===plan.people.find(p=>p.legacyKey==='A 優先|2').stableId);
assert(plan.people.find(p=>p.legacyKey==='A 優先|2').by==='管理者');
ok('import keeps claims, separates same names and whitespace／digits, pending is not D, visits follow legacy keys');
const reversed=Object.assign({},input,{source26:input.source26.slice().reverse(),existingIndex:plan.people.map(p=>({stableId:p.stableId,sourceKey:p.sourceKey,legacyKey:p.legacyKey,norm:p.norm,seq:p.seq,district:p.district}))});
const plan2=ctx.buildMigrationPlan_(reversed);
assert(plan2.ok);
plan.people.forEach(p=>{const q=plan2.people.find(x=>x.sourceKey===p.sourceKey);assert(q&&q.stableId===p.stableId,p.sourceKey);});
ok('re-import after a reversed source order keeps stable IDs');
const bad=ctx.buildMigrationPlan_(Object.assign({},input,{visits:input.visits.concat([{key:'D 全年未出席|3',name:'甲'}])}));
assert(!bad.ok&&bad.errors.some(e=>/姓名不符/.test(e)));ok('visit whose name does not match the legacy row is rejected');
const ambLegacy={
  'A 優先':[{row:2,name:'同',group:'G',att:5,absent:4,by:'管理者'},{row:3,name:'同',group:'G',att:5,absent:4,by:''}],
  'C 近期斷線':[],'D 全年未出席':[]
};
const amb=ctx.buildMigrationPlan_({legacy:ambLegacy,source24:[
  {sourceRow:4,name:'同',group:'G',att:5,absent:4},{sourceRow:5,name:'同',group:'G',att:5,absent:4},{sourceRow:6,name:'新人',group:'G',att:9,absent:0}
],source26:[],source27:[],visits:[{key:'A 優先|2',name:'同'},{key:'A 優先|3',name:'同'}]});
assert(amb.ok,amb.errors.join(';'));
assert(amb.warnings.some(w=>/不依排序/.test(w)));
assert(amb.people.filter(p=>p.tier==='A').every(p=>String(p.sourceKey).includes('A 優先')));
assert(amb.visitMap.find(v=>v.oldKey==='A 優先|2').stableId!==amb.visitMap.find(v=>v.oldKey==='A 優先|3').stableId);ok('ambiguous same signature is not zipped by sort');
const mismatch=ctx.buildMigrationPlan_({legacy:ambLegacy,source24:[{sourceRow:4,name:'同',group:'G',att:5,absent:4}],source26:[],source27:[],visits:[]});
assert(!mismatch.ok);ok('unbalanced signature refuses the plan');
const frac=ctx.buildMigrationPlan_({legacy:{'A 優先':[{row:2,name:'甲',group:'g',att:26,absent:4,by:'管理者'}],'C 近期斷線':[],'D 全年未出席':[]},source24:[{sourceRow:4,name:'甲',group:'g',att:'26 / 43',absent:4,rank:''}],sourceB:[{sourceRow:2,name:'穩',group:'g',att:'40 / 43',absent:0}],source26:[],source27:[],visits:[]});
assert(frac.ok,frac.errors.join(';'));
assert.strictEqual(frac.diagnosis.sourceGrade.A,1);
assert.strictEqual(frac.diagnosis.sourceGrade.D,0);
assert.strictEqual(frac.diagnosis.signatureMismatchGroups,0);
assert.strictEqual(frac.diagnosis.unmatchedAttendance.D,0);
assert.strictEqual(frac.people.filter(p=>p.tier==='B').length,1);
const unparsed=ctx.buildMigrationPlan_({legacy:{'A 優先':[{row:2,name:'甲',group:'g',att:26,absent:4,by:''}],'C 近期斷線':[],'D 全年未出席':[]},source24:[{sourceRow:4,name:'甲',group:'g',att:'很多',absent:4}],sourceB:[],source26:[],source27:[],visits:[]});
assert(!unparsed.ok&&unparsed.errors.some(e=>/無法解析/.test(e))&&unparsed.diagnosis.sourceGrade.D===0);ok('出席「次數 / 43」依分子分級，無法解析時不改判成 D');
const secret=ctx.buildMigrationPlan_({legacy:{'A 優先':[{row:2,name:'示範秘密名',group:'g',att:5,absent:4,by:''}],'C 近期斷線':[],'D 全年未出席':[]},source24:[{sourceRow:4,name:'別人',group:'g',att:5,absent:4}],sourceB:[],source26:[],source27:[],visits:[]});
const rep=ctx.safeMigrationReport_(secret,{sourceSpec:{bTab:'B_正式匯入',bHeaderRow:1,newHeaderRow:3}});
assert(!secret.ok&&rep.wrote===false&&rep.errors.length>0);
assert(!JSON.stringify(rep).includes('示範秘密名')&&!JSON.stringify(rep).includes('別人'));
assert(rep.counts&&rep.sourceSpec.bTab==='B_正式匯入');ok('dry-run report lists the stop reason without names');
const tiny=ctx.buildMigrationPlan_(input);tiny.enforce=true;const enforced=ctx.buildMigrationPlan_(Object.assign({},input,{enforceExpected:true}));
assert(!enforced.ok&&enforced.errors.some(e=>/1006|248|14/.test(e))&&!enforced.errors.some(e=>/139|22/.test(e)));ok('structure manifest stops a mismatched roster and does not gate claim or visit counts');
const keptB=ctx.buildMigrationPlan_({legacy:{'A 優先':[],'C 近期斷線':[],'D 全年未出席':[]},source24:[{sourceRow:4,name:'穩',group:'g',att:10,absent:0}],source26:[],source27:[],visits:[],existingIndex:[{stableId:'2-4|穩|1',sourceKey:'2-4|原始出席|4',legacyKey:'',norm:'穩',seq:1,district:'2-4',by:'示範服事者甲'}]});
assert(keptB.ok,keptB.errors.join(';'));
assert.strictEqual(keptB.people.find(p=>p.tier==='B').by,'示範服事者甲');ok('re-import keeps a B claim instead of blanking it');
props.MIGRATION_MANIFEST_JSON=JSON.stringify({manifestVersion:1,id:'bad',districts:{},gates:['claims']});
assert(ctx.activeManifest_().invalid);delete props.MIGRATION_MANIFEST_JSON;ok('a manifest that gates claim counts is rejected');
function attGrid(rows){
  const header=['#','姓名','大區','小區','排','群組','出席','出席率','最近出席','缺席週'].concat(ctx.WEEK_HEADERS);
  const g=[['標題'],['副標'],header];
  rows.forEach(r=>{const line=['',r.name,'','','',r.group,r.att,'','',r.absent]; for(let i=0;i<43;i++) line.push(0); g.push(line);});
  return g;
}
const src24=makeSs({'B 穩定':[['姓名','群組','出席','缺席','大區','小區','排'],['示範B01','示範群組一',40,0,'大','小','1'],['甲','青職',40,1,'','','']],'錯誤表':[['名字','群']]});
const src26=makeSs({'出席':attGrid([{name:'示範P2601',group:'示範群組二',att:0,absent:43}])});
const src27=makeSs({'出席':attGrid([{name:'示範P2701',group:'示範群組三',att:0,absent:43}])});
workbooks.SRC24=src24; workbooks.SRC26=src26; workbooks.SRC27=src27;
props.SOURCE_24_SHEET_ID='SRC24'; props.SOURCE_26_SHEET_ID='SRC26'; props.SOURCE_27_SHEET_ID='SRC27';
const live=makeSs({'A 優先':[HH,['甲','青職',5,4,'管理者']],'C 近期斷線':[HH,['丙','青壯',1,20,'']],'D 全年未出席':[HH,['丁','大學',0,43,'']]});
const got=ctx.collectMigrationInput_(live);
assert(got.sourceB&&got.sourceB.length===2&&got.sourceB[0].sourceRow===2&&got.sourceB[0].area==='大', JSON.stringify(got.error||got.sourceSpec));
assert.strictEqual(got.source24.length,0);
assert.strictEqual(got.sourceSpec.bHeaderRow,1);
assert.strictEqual(got.sourceSpec.newHeaderRow,3);
const fromTabs=ctx.buildMigrationPlan_(got);
assert(fromTabs.ok||fromTabs.errors.join, fromTabs.errors&&fromTabs.errors.join(';'));
assert(!fromTabs.manifestId);
const bPeople=fromTabs.people.filter(p=>p.tier==='B');
assert.strictEqual(bPeople.length,2);
assert(bPeople.some(p=>p.name==='甲')&&fromTabs.people.filter(p=>p.name==='甲'&&p.tier==='A').length===1);
assert(bPeople.every(p=>p.sourceTab==='B 穩定'));
assert(fromTabs.people.some(p=>p.district==='2-6'&&p.attendanceStatus==='pending'&&p.tier!=='D'));
assert(fromTabs.warnings.some(w=>/沒有「原始出席」/.test(w)));ok('B comes from SOURCE_24 tab B 穩定 row 2, not from the live A/C/D workbook');
src24.bag['B 穩定'].v[0]=['名字','群','出席','缺席'];
const badHead=ctx.collectMigrationInput_(live);
assert(badHead.error&&/第 1 列/.test(badHead.error));ok('wrong B header stops before any write');
delete props.SOURCE_24_SHEET_ID; delete props.SOURCE_26_SHEET_ID; delete props.SOURCE_27_SHEET_ID;
const stale=makeSs({'A 優先':[HH,['甲','g',5,4,'管理者']],'C 近期斷線':[HH],'D 全年未出席':[HH]});
const stalePlan=ctx.buildMigrationPlan_({legacy:ctx.readLegacyRows_(stale),source24:[{sourceRow:4,name:'甲',group:'g',att:5,absent:4}],source26:[],source27:[],visits:[]});
assert(stalePlan.ok,stalePlan.errors.join(';'));
stale.bag['A 優先'].v.push(['乙','g',5,4,'聖徒二']);
const blocked=ctx.applyMigration_(stale,stalePlan,{confirm:true,confirmText:'確認遷移'});
assert(!blocked.ok&&blocked.wrote===false);
assert.strictEqual(stale.bag['A 優先'].v[2][4],'聖徒二');
assert(!stale.bag['名單索引']);ok('a newer claim outside the plan stops migration and is not overwritten');

const mig=makeSs({
  'A 優先':[HH,['甲','青職',5,4,'管理者']],
  'C 近期斷線':[HH,['丙','青壯',1,20,'']],
  'D 全年未出席':[HH,['丁','青職',0,43,'管理者'],['丁','大學',0,43,'']],
  '回訪紀錄':[['時間戳','聖徒','分頁','姓名','回訪日期','方式','狀況','備註','資料鍵'],
    [new RealDate(),'管理者','A 優先','甲','2026-11-01','見面','順利聯繫','','A 優先|2'],
    [new RealDate(),'管理者','D 全年未出席','丁','2026-10-05','其他','未聯繫上','','D 全年未出席|2'],
    [new RealDate(),'別人','D 全年未出席','丁','2026-10-01','見面','順利聯繫','','D 全年未出席|3']]
});
const migPlan=ctx.buildMigrationPlan_({
  legacy:ctx.readLegacyRows_(mig),
  source24:[
    {sourceRow:4,name:'甲',group:'青職',att:5,absent:4,area:'大',small:'小',rank:'1'},
    {sourceRow:5,name:'丙',group:'青壯',att:1,absent:20},
    {sourceRow:6,name:'丁',group:'青職',att:0,absent:43},
    {sourceRow:7,name:'丁',group:'大學',att:0,absent:43},
    {sourceRow:8,name:'穩',group:'青職',att:10,absent:1}
  ],
  source26:[{sourceRow:4,name:'新區甲',group:'N',att:0,absent:43,allZero:true}],
  source27:[],
  visits:[{key:'A 優先|2',name:'甲'},{key:'D 全年未出席|2',name:'丁'},{key:'D 全年未出席|3',name:'丁'}]
});
assert(migPlan.ok,migPlan.errors.join(';'));
let applied=ctx.applyMigration_(mig,migPlan,{confirm:false});
assert(applied.dryRun&&applied.wrote===false&&!mig.bag['名單索引']);ok('migration confirm flag false writes nothing');
const fp=migPlan.fingerprint;
const claimBefore=mig.bag['A 優先'].v[1][4];
applied=ctx.applyMigration_(mig,migPlan,{confirm:true,confirmText:'確認遷移'});
assert(applied.wrote&&applied.backupId);
assert.strictEqual(mig.bag['A 優先'].v[1][4],claimBefore);
assert.strictEqual(mig.bag['A 優先'].v[1][5],migPlan.people.find(p=>p.legacyKey==='A 優先|2').stableId);
assert.strictEqual(mig.bag['D 全年未出席'].v[1][0],'丁');
assert.strictEqual(mig.bag['D 全年未出席'].v[2][0],'丁');
const vrows=mig.bag['回訪紀錄'].v;
assert.strictEqual(vrows[1][8],migPlan.people.find(p=>p.legacyKey==='A 優先|2').stableId);
assert.strictEqual(vrows[1][9],'A 優先|2');
assert.strictEqual(vrows[2][8],migPlan.people.find(p=>p.legacyKey==='D 全年未出席|2').stableId);
assert.notStrictEqual(vrows[2][8],vrows[3][8]);ok('apply keeps claims and row order, and maps each visit to its own stable ID');
const bId=migPlan.people.find(p=>p.tier==='B').stableId;
assert(mig.bag['B 穩定'].v.some(row=>row[5]===bId));
assert(mig.bag['待核實'].v.some(row=>row[0]==='新區甲'&&row[10]==='pending'));
const againPlan=ctx.buildMigrationPlan_({
  legacy:ctx.readLegacyRows_(mig),source24:migPlan.people.filter(p=>p.district==='2-4'&&p.sourceTab==='原始出席').map(p=>({sourceRow:p.sourceRow,name:p.name,group:p.group,att:p.att,absent:p.absent})),
  source26:[{sourceRow:4,name:'新區甲',group:'N',att:0,absent:43,allZero:true}],source27:[],
  visits:ctx.readVisits_(mig).map(v=>({key:v.key,name:v.name})),existingIndex:ctx.existingFromIndex_(mig)
});
assert(againPlan.ok,againPlan.errors.join(';'));
assert.strictEqual(againPlan.people.find(p=>p.legacyKey==='D 全年未出席|3').stableId,migPlan.people.find(p=>p.legacyKey==='D 全年未出席|3').stableId);
ok('second plan reuses IDs and already-migrated visit keys');
const stableA=mig.bag['A 優先'].v[1][5];
const rowA=mig.bag['A 優先'].v[1].slice();
const rowWould=mig.bag['D 全年未出席'].v[1].slice();
mig.bag['D 全年未出席'].v[1]=mig.bag['D 全年未出席'].v[2].slice();
mig.bag['D 全年未出席'].v[2]=rowWould;
const swapped=ctx.resolvePerson_(mig,mig.bag['D 全年未出席'].v[2][5]);
assert.strictEqual(swapped.name,rowWould[0]);assert.strictEqual(swapped.stableId,rowWould[5]);ok('sorting legacy rows does not retarget a stable ID');
const dryRestore=ctx.restoreBackup_(mig,applied.backupId,{confirm:false});
assert(dryRestore.dryRun&&dryRestore.wrote===false);
mig.bag['A 優先'].v[1][4]='被改掉';
const restored=ctx.restoreBackup_(mig,applied.backupId,{confirm:true,confirmText:'確認回復'});
assert(restored.wrote);
assert.strictEqual(mig.bag['A 優先'].v[1][4],'管理者');
assert.strictEqual(mig.bag['回訪紀錄'].v[1][8],'A 優先|2');ok('restore dry-run writes nothing; confirm puts back claims and legacy visit keys');
assert.strictEqual(stableA,rowA[5]);

function person(extra){return Object.assign({legacyKey:'',sourceKey:'',district:'2-6',tier:'待核實',tab:'待核實',row:2,name:'同名',norm:'同名',seq:1,group:'一',area:'',small:'',rank:'',att:0,absent:43,attendanceStatus:'pending',by:'',sourceTab:'出席',sourceRow:4,active:'Y',mergedInto:''},extra);}
const mergeSs=makeSs({'待核實':[HH,['同名','一',0,43,''],['同名','二',0,43,'']]});
mergeSs.bag['待核實'].v[1][5]='2-6|同名|1';mergeSs.bag['待核實'].v[2][5]='2-6|同名|2';
ctx.writeIndex_(mergeSs,[person({stableId:'2-6|同名|1',sourceKey:'2-6|出席|4',sourceRow:4,row:2}),person({stableId:'2-6|同名|2',sourceKey:'2-6|出席|5',sourceRow:5,row:3,seq:2,group:'二',by:'聖徒二'})]);
let m=ctx.mergePeople_(mergeSs,{keepId:'2-6|同名|1',mergeId:'2-6|同名|2',confirm:true,confirmText:'不對'});
assert(m.dryRun&&m.wrote===false);assert.strictEqual(mergeSs.bag['待核實'].v[2][4],'');ok('merge dry-run does not move a claim');
const clash=makeSs({});
ctx.writeIndex_(clash,[person({stableId:'2-6|同名|1',by:'管理者'}),person({stableId:'2-6|同名|2',sourceKey:'2-6|出席|5',seq:2,by:'聖徒二'})]);
assert(!ctx.mergePeople_(clash,{keepId:'2-6|同名|1',mergeId:'2-6|同名|2',confirm:true,confirmText:'確認合併'}).ok);ok('merge refuses two different claimers');
m=ctx.mergePeople_(mergeSs,{keepId:'2-6|同名|1',mergeId:'2-6|同名|2',confirm:true,confirmText:'確認合併'});
assert(m.wrote);
assert(!ctx.readAll_(mergeSs)['待核實'].some(p=>p.stableId==='2-6|同名|2'));
assert.strictEqual(ctx.readAll_(mergeSs)['待核實'].find(p=>p.stableId==='2-6|同名|1').by,'聖徒二');
assert.strictEqual(ctx.allIndexPeople_(mergeSs).find(p=>p.stableId==='2-6|同名|2').mergedInto,'2-6|同名|1');
assert.strictEqual(ctx.allIndexPeople_(mergeSs).find(p=>p.stableId==='2-6|同名|1').stableId,'2-6|同名|1');
const keepP=ctx.allIndexPeople_(mergeSs).find(p=>p.stableId==='2-6|同名|1');
assert(ctx.sameVisit_({key:'2-6|同名|2',name:'同名',tab:'待核實'},keepP,ctx.aliasKeys_(mergeSs,keepP)));ok('manual merge keeps both IDs, moves the only claim, and visits still resolve');

const sortSs=makeSs({'A 優先':[HH,['甲','g',1,3,'管理者'],['乙','g',1,3,'']]});
sortSs.bag['A 優先'].v[1][5]='2-4|甲|1';sortSs.bag['A 優先'].v[2][5]='2-4|乙|1';
ctx.writeIndex_(sortSs,[
  person({stableId:'2-4|甲|1',legacyKey:'A 優先|2',sourceKey:'2-4|A 優先|2',district:'2-4',tier:'A',tab:'A 優先',row:2,name:'甲',norm:'甲',group:'g',att:1,absent:3,attendanceStatus:'verified',by:'管理者',sourceTab:'A 優先',sourceRow:2}),
  person({stableId:'2-4|乙|1',legacyKey:'A 優先|3',sourceKey:'2-4|A 優先|3',district:'2-4',tier:'A',tab:'A 優先',row:3,name:'乙',norm:'乙',seq:1,group:'g',att:1,absent:3,attendanceStatus:'verified',sourceTab:'A 優先',sourceRow:3})
]);
const top=sortSs.bag['A 優先'].v[1].slice();
sortSs.bag['A 優先'].v[1]=sortSs.bag['A 優先'].v[2].slice();
sortSs.bag['A 優先'].v[2]=top;
withSs(sortSs,()=>{
  call({action:'bind',idToken:'tok1',saint:'管理者'});
  const x=call({action:'submit',idToken:'tok1',claims:[{key:'2-4|乙|1',name:'乙'}]});
  assert(x.ok,JSON.stringify(x));
});
assert.strictEqual(sortSs.bag['A 優先'].v.find(row=>row[0]==='乙')[4],'管理者');
assert.strictEqual(sortSs.bag['A 優先'].v.find(row=>row[0]==='甲')[4],'管理者');ok('after a row sort, claim write follows the stable ID');

const crowd=[];
for(let i=0;i<20;i++) crowd.push({tier:'D',attendanceStatus:'verified',tab:'D 全年未出席',key:'n'+i,name:'名'+i,group:'g'});
const shown=ctx.drawSample_(ctx.poolsFrom_(crowd),ctx.SAMPLE_SPEC.counts,()=>0);
const shownText=JSON.stringify(ctx.sampleBubble_('未認領推薦','預覽',shown.list,'打開小頁面','https://liff.line.me/2012397222-u2XpUCRQ'));
shown.list.forEach(p=>assert(shownText.includes(p.name)));
crowd.filter(p=>shown.list.indexOf(p)<0).forEach(p=>assert(!shownText.includes(p.name)));
assert(!shownText.includes('另外')&&!shownText.includes('未認領 20'));ok('sample bubble lists only the draw, not the rest of the unclaimed pool');

const emptySs=makeSs({'待核實':[HH,['人','g',0,43,'']],'群組紀錄':[['記錄時間','事件類型','groupId／roomId／userId','來源類型','事件時間']]});
props.GROUP_PUSH_ENABLED='true';setNow('2026-12-07');
withSs(emptySs,()=>{assert.strictEqual(ctx.pushGroupReminder(),0);});
assert(emptySs.bag['推播紀錄'].v.some(row=>row[1]==='群組抽樣'&&/空池|沒有可抽/.test(String(row[6]))));ok('group push with only pending people logs an empty pool and does not send');

const bOnly=makeSs({'B 穩定':[HH,['穩','青職',10,1,'']]});
withSs(bOnly,()=>{
  call({action:'bind',idToken:'tok1',saint:'管理者'});
  let x=call({action:'submit',idToken:'tok1',claims:[{key:'B 穩定|2',name:'穩'}]});
  assert(x.ok&&bOnly.bag['B 穩定'].v[1][4]==='管理者');
  setNow('2026-11-09');
  x=rec('tok1',{key:'B 穩定|2',name:'穩',date:'2026-11-01',method:'電話',status:'順利聯繫'});
  const bp=x.people.find(n=>n.name==='穩');
  assert.strictEqual(bp.tier,'B');assert.strictEqual(bp.cycle,30);assert.strictEqual(bp.due,'2026-12-01');ok('B is claimable and uses the monthly cycle');
});

const savedConfirmProps={SHEET_ID:props.SHEET_ID,SOURCE_24_SHEET_ID:props.SOURCE_24_SHEET_ID,SOURCE_26_SHEET_ID:props.SOURCE_26_SHEET_ID,SOURCE_27_SHEET_ID:props.SOURCE_27_SHEET_ID,MIGRATION_MANIFEST_JSON:props.MIGRATION_MANIFEST_JSON,MIGRATION_CONFIRM:props.MIGRATION_CONFIRM,MIGRATION_FINGERPRINT:props.MIGRATION_FINGERPRINT};
const tinyManifest=JSON.stringify({manifestVersion:1,id:'fixture',districts:{'2-4':{A:1,B:0,C:0,D:0,total:1},'2-6':{total:0},'2-7':{total:0}},candidates:1,sameNameGroups:0,sameNameRows:0,reviewNameGroups:0,reviewNameRows:0});
function confirmSources(){
  workbooks.CONF24=makeSs({'B 穩定':[['姓名','群組','出席','缺席']]});
  workbooks.CONF26=makeSs({'出席':attGrid([])});
  workbooks.CONF27=makeSs({'出席':attGrid([])});
  props.SOURCE_24_SHEET_ID='CONF24'; props.SOURCE_26_SHEET_ID='CONF26'; props.SOURCE_27_SHEET_ID='CONF27';
  props.MIGRATION_MANIFEST_JSON=tinyManifest;
}
confirmSources();
props.MIGRATION_MANIFEST_JSON=JSON.stringify({manifestVersion:1,id:'fixture-3',districts:{'2-4':{A:3,B:0,C:0,D:0,total:3},'2-6':{total:0},'2-7':{total:0}},candidates:3,sameNameGroups:0,sameNameRows:0,reviewNameGroups:0,reviewNameRows:0});
const trimLive=makeSs({'A 優先':[HH,['甲 ','青職',5,4,''],[' 乙','青職',4,3,''],[' 丙 ','大學',1,8,'']],'C 近期斷線':[HH],'D 全年未出席':[HH]});
workbooks.CONF_LIVE=trimLive; props.SHEET_ID='CONF_LIVE';
let dry=ctx.migrationDryRun();
assert(dry.ok,JSON.stringify(dry.errors||dry.error));
props.MIGRATION_FINGERPRINT=dry.fingerprint;
props.MIGRATION_CONFIRM='不是';
ctx._log=[];
let confirmThrew=false;
try{ctx.migrationConfirm();}catch(e){confirmThrew=true;}
assert(confirmThrew&&props.MIGRATION_CONFIRM==='不是'&&ctx._log.some(l=>l.includes('confirm-text')&&l.includes('"wrote":false')&&!l.includes('不是')));
assert(!trimLive.names().some(n=>n.indexOf('備份')===0));ok('wrong confirm text throws, keeps the flag, and writes nothing');
const trimInput=ctx.collectMigrationInput_(trimLive); trimInput.manifest=JSON.parse(props.MIGRATION_MANIFEST_JSON);
const trimPlan=ctx.buildMigrationPlan_(trimInput);
assert(trimPlan.ok,trimPlan.errors.join(';'));
assert.strictEqual(ctx.validateLegacySnapshot_(trimLive,trimPlan),'');
function cloneLive(){const seed={}; trimLive.names().forEach(n=>{seed[n]=trimLive.bag[n].v.map(r=>r.slice());}); return makeSs(seed);}
const renamed=cloneLive(); renamed.bag['A 優先'].v[1][0]='丁';
assert(/姓名已變/.test(ctx.validateLegacySnapshot_(renamed,trimPlan)));
const renameBlocked=ctx.applyMigration_(renamed,trimPlan,{confirm:true,confirmText:'確認遷移'});
assert(renameBlocked.wrote===false&&/姓名已變/.test(renameBlocked.error)&&renamed.bag['A 優先'].v[1][0]==='丁'&&!renamed.names().some(n=>n.indexOf('備份')===0));
const claimed=cloneLive(); claimed.bag['A 優先'].v[2][4]='別人';
assert(/認領已變/.test(ctx.validateLegacySnapshot_(claimed,trimPlan)));
assert(ctx.applyMigration_(claimed,trimPlan,{confirm:true,confirmText:'確認遷移'}).wrote===false&&claimed.bag['A 優先'].v[2][4]==='別人');
const shortened=cloneLive(); shortened.bag['A 優先'].v.pop();
assert(/列號已變/.test(ctx.validateLegacySnapshot_(shortened,trimPlan)));
assert(ctx.applyMigration_(shortened,trimPlan,{confirm:true,confirmText:'確認遷移'}).wrote===false);
const internal=cloneLive(); internal.bag['A 優先'].v[1][0]='甲乙';
assert(/姓名已變/.test(ctx.validateLegacySnapshot_(internal,trimPlan)));ok('real rename, claim change, missing row, and internal space stay rejected');
props.MIGRATION_CONFIRM='確認遷移';
ctx._log=[];
ready=ctx.migrationConfirmReadiness();
assert(ready.wrote===false&&ready.flagConsumed===false&&ready.wouldWrite===true&&ready.stage==='ready');
assert(ready.confirmMatches===true&&ready.fingerprintMatches===true);
assert.strictEqual(ready.legacyTrimOnly,3);assert.strictEqual(ready.legacyNameMismatch,0);assert.strictEqual(ready.legacyClaimMismatch,0);
assert(props.MIGRATION_CONFIRM==='確認遷移');
assert(!JSON.stringify(ready).includes('確認遷移')&&!JSON.stringify(ready).includes('test-token'));ok('three trim-only names pass readiness and do not consume the flag');
ctx._log=[];
const trimWrote=ctx.migrationConfirm();
assert(trimWrote.wrote===true&&trimWrote.stage==='wrote');
assert.strictEqual(trimLive.bag['A 優先'].v[1][0],'甲 ');
assert.strictEqual(trimLive.bag['A 優先'].v[2][0],' 乙');
assert.strictEqual(trimLive.bag['A 優先'].v[3][0],' 丙 ');
assert.strictEqual(trimLive.bag['A 優先'].v[1][5],trimPlan.people.find(p=>p.legacyKey==='A 優先|2').stableId);
assert.strictEqual(trimLive.bag['A 優先'].v[2][5],trimPlan.people.find(p=>p.legacyKey==='A 優先|3').stableId);
assert.strictEqual(trimLive.bag['A 優先'].v[3][5],trimPlan.people.find(p=>p.legacyKey==='A 優先|4').stableId);ok('trim-only confirm keeps the original name cells and the original rows');
props.MIGRATION_MANIFEST_JSON=tinyManifest;
const cleanLive=makeSs({'A 優先':[HH,['甲','青職',5,4,'']],'C 近期斷線':[HH],'D 全年未出席':[HH]});
workbooks.CONF_LIVE=cleanLive;
dry=ctx.migrationDryRun();
assert(dry.ok,JSON.stringify(dry.errors||dry.error));
props.MIGRATION_FINGERPRINT='c457de74-1006-22';
props.MIGRATION_CONFIRM='確認遷移';
ctx._log=[];
const fpStop=ctx.migrationConfirm();
assert(fpStop.wrote===false&&fpStop.stage==='fingerprint'&&!props.MIGRATION_CONFIRM&&!cleanLive.names().some(n=>n.indexOf('備份')===0));
assert(ctx._log.some(l=>l.includes('c457de74-1006-22')&&l.includes(dry.fingerprint)&&l.includes('"wrote":false')));ok('stored fingerprint that differs from the current plan stops with both values logged');
props.MIGRATION_FINGERPRINT=dry.fingerprint;
props.MIGRATION_CONFIRM='確認遷移';
const passed=ctx.migrationConfirm();
assert(passed.wrote===true&&passed.stage==='wrote'&&cleanLive.names().some(n=>n.indexOf('備份')===0));ok('matching fingerprint and snapshot still writes');
props.RESTORE_CONFIRM='不是';
ctx._log=[];
confirmThrew=false;
try{ctx.restoreConfirm();}catch(e){confirmThrew=true;}
assert(confirmThrew&&props.RESTORE_CONFIRM==='不是'&&ctx._log.some(l=>l.includes('"wrote":false')&&l.includes('confirm-text')&&!l.includes('不是')));
props.RESTORE_CONFIRM='確認回復';
delete props.RESTORE_BACKUP_ID;
ctx._log=[];
confirmThrew=false;
try{ctx.restoreConfirm();}catch(e){confirmThrew=true;}
assert(confirmThrew&&!props.RESTORE_CONFIRM&&ctx._log.some(l=>l.includes('backup-id')&&l.includes('"wrote":false')));ok('restore completion is logged as not written when it stops');
['SHEET_ID','SOURCE_24_SHEET_ID','SOURCE_26_SHEET_ID','SOURCE_27_SHEET_ID','MIGRATION_MANIFEST_JSON','MIGRATION_CONFIRM','MIGRATION_FINGERPRINT'].forEach(k=>{if(savedConfirmProps[k]==null)delete props[k];else props[k]=savedConfirmProps[k];});

const linkPeople=[
  {name:'曾淳棋',tier:'A',stableId:'2-4|曾淳棋|1',key:'2-4|曾淳棋|1',st:{never:true,overdue:0,due:'2026-11-07',today:'2026-11-07'}},
  {name:'同名',tier:'A',stableId:'2-4|同名|1',key:'2-4|同名|1',st:{never:true,overdue:0,due:'2026-11-07',today:'2026-11-07'}},
  {name:'同名',tier:'C',stableId:'2-4|同名|2',key:'2-4|同名|2',st:{never:true,overdue:0,due:'2026-11-07',today:'2026-11-07'}}
];
const linkBubble=ctx.sampleBubble_('本人已認領回訪','李彥霆 平安！11/7（週六）',linkPeople,'填寫回訪','https://liff.line.me/2012397222-u2XpUCRQ?v=1');
const linkJson=JSON.stringify(linkBubble);
function linkUris(node,out){out=out||[];if(!node||typeof node!=='object')return out;if(node.action&&node.action.uri)out.push(node.action.uri);['header','body','footer'].forEach(k=>{if(node[k])linkUris(node[k],out);});if(Array.isArray(node.contents))node.contents.forEach(n=>linkUris(n,out));return out;}
const uris=linkUris(linkBubble);
assert.deepStrictEqual(uris,[
  'https://liff.line.me/2012397222-u2XpUCRQ?k='+encodeURIComponent('2-4|曾淳棋|1'),
  'https://liff.line.me/2012397222-u2XpUCRQ?k='+encodeURIComponent('2-4|同名|1'),
  'https://liff.line.me/2012397222-u2XpUCRQ?k='+encodeURIComponent('2-4|同名|2'),
  'https://liff.line.me/2012397222-u2XpUCRQ?v=1'
]);
assert(uris[1]!==uris[2]);
assert(linkJson.includes('暫定假設')&&linkJson.includes('這不是完整名單')&&linkJson.includes('本人已認領回訪')&&linkJson.includes('尚未回訪'));
assert.strictEqual(ctx.SAMPLE_SPEC.groupPool,'未認領推薦');
assert(!fs.readFileSync(path.join(__dirname,'Code.gs'),'utf8').includes('共同照顧'));
ok('each card row links its own stable ID and the old sample text stays');

const linkSs=makeSs({'A 優先':[H]});
ctx.writeIndex_(linkSs,[
  person({stableId:'2-4|同名|1',legacyKey:'A 優先|2',sourceKey:'2-4|A|2',district:'2-4',tier:'A',tab:'A 優先',row:2,name:'同名',norm:'同名',seq:1,group:'一',att:1,absent:1,attendanceStatus:'verified',by:'管理者',sourceTab:'A 優先',sourceRow:2}),
  person({stableId:'2-4|同名|2',legacyKey:'A 優先|3',sourceKey:'2-4|A|3',district:'2-4',tier:'A',tab:'A 優先',row:3,name:'同名',norm:'同名',seq:2,group:'二',att:1,absent:1,attendanceStatus:'verified',by:'聖徒二',sourceTab:'A 優先',sourceRow:3})
]);
withSs(linkSs,()=>{
  call({action:'bind',idToken:'tok1',saint:'管理者'});
  call({action:'bind',idToken:'tok2',saint:'聖徒二'});
  call({action:'bindObserver',idToken:'tok9'});
  let mine=call({action:'visits',idToken:'tok1'}).people;
  assert(mine.some(p=>p.key==='2-4|同名|1')&&!mine.some(p=>p.key==='2-4|同名|2'));
  const wrote=rec('tok1',{key:'2-4|同名|1',name:'同名',date:'2026-11-01',method:'見面',status:'順利聯繫',note:'只屬於一'});
  assert(wrote.ok&&wrote.people.find(p=>p.key==='2-4|同名|1').history.some(h=>h.note==='只屬於一'));
  const other=call({action:'visits',idToken:'tok2'}).people.find(p=>p.key==='2-4|同名|2');
  assert(other&&!other.history.some(h=>h.note==='只屬於一'));
  assert(!rec('tok2',{key:'2-4|同名|1',name:'同名',date:'2026-11-01',method:'電話',status:'順利聯繫'}).ok);
  assert(!call({action:'record',idToken:'tok9',key:'2-4|同名|1',name:'同名',date:'2026-11-01',method:'電話',status:'順利聯繫'}).ok);
  assert(!call({action:'record',idToken:'tok1',key:'2-4|沒有|1',name:'沒有',date:'2026-11-01',method:'電話',status:'順利聯繫'}).ok);
  linkSs.bag['A 優先']&&assert.strictEqual(linkSs.bag['名單索引'].v.find(r=>r[0]==='2-4|同名|1')[17],'管理者');
});
ok('primary claimant can record one stable ID; the same name, a stranger, an observer, and an unknown ID cannot');

console.log('\nALL BACKEND TESTS PASSED');
