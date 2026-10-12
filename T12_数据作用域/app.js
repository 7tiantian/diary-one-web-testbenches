
function $(id){ return document.getElementById(id); }
function metric(k,v,t,ok){
  return `<div class="metric"><div class="k">${k}</div><div class="v ${ok===true?'ok':ok===false?'bad':''}">${v}</div><div class="t">${t}</div></div>`;
}
function sha256Hex(buf){
  return crypto.subtle.digest('SHA-256', buf).then(h=>{
    return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');
  });
}
async function fileFingerprint(file){
  const buf = await file.arrayBuffer();
  return sha256Hex(buf);
}
function storeGet(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function storeSet(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function nowIso(){ return new Date().toISOString(); }
function passList(items){
  return `<ul class="check">${items.map(([ok,t])=>`<li><span class="${ok?'ok':'bad'}">${ok?'PASS':'FAIL'}</span>　${t}</li>`).join('')}</ul>`;
}
function renderMetrics(el, rows){ el.innerHTML = rows.map(r=>metric(...r)).join(''); }

const KEY='t12_scope';
function st(){ return storeGet(KEY,{ user:null, db:{}, openQueries:{}, lateApplied:false, polluted:false, oldQueryOpened:false }); }
function show(){
  const s=st();
  $('viewA').textContent = JSON.stringify({user:s.user, db:s.db, queries:s.openQueries},null,2);
  $('viewB').textContent = JSON.stringify({user:s.user, db:s.db, lateApplied:s.lateApplied, polluted:s.polluted, oldQueryOpened:s.oldQueryOpened},null,2);
  evalPass();
}
$('loginA').onclick=()=>{
  const u=$('userA').value.trim();
  storeSet(KEY,{
    user:u,
    db:{ [u]:{ chapters:['C-A1'], job:'job-A' } },
    openQueries:{ [u]:'search:只有我知道' },
    lateApplied:false, polluted:false, oldQueryOpened:false,
    pendingLate:{ user:u, job:'job-A', chapter:'C-A-LATE' }
  });
  show();
};
$('loginB').onclick=()=>{
  const s=st();
  const b=$('userB').value.trim();
  // wipe A local
  storeSet(KEY,{
    user:b,
    db:{ [b]:{ chapters:[], job:null } },
    openQueries:{},
    lateApplied:false, polluted:false, oldQueryOpened:false,
    pendingLate:s.pendingLate || null,
    prevUser:s.user,
  });
  show();
};
$('lateCallback').onclick=()=>{
  const s=st();
  const late=s.pendingLate;
  if(!late){ alert('无晚到回调'); return; }
  // 正确：若 late.user !== current user，拒绝写入
  if(late.user !== s.user){
    s.lateApplied=false; s.polluted=false;
  } else {
    s.db[s.user]=s.db[s.user]||{chapters:[]};
    s.db[s.user].chapters.push(late.chapter);
    s.polluted=true;
  }
  storeSet(KEY,s); show();
};
$('openOldQuery').onclick=()=>{
  const s=st();
  const prev=s.prevUser;
  if(prev && s.openQueries[prev]){
    s.oldQueryOpened=true; // 错误
  } else {
    s.oldQueryOpened=false;
    alert('旧查询已关闭，不可继续打开');
  }
  storeSet(KEY,s); show();
};
function evalPass(){
  const s=st();
  const isolated = s.user && !(s.db[s.prevUser] && s.db[s.user] && (s.db[s.user].chapters||[]).some(c=>String(c).includes('A')));
  const noPollution = s.polluted!==true && !(s.db[s.user]?.chapters||[]).includes('C-A-LATE');
  const noOld = s.oldQueryOpened!==true;
  const switched = !!s.prevUser && s.user && s.user!==s.prevUser;
  const pass = switched && noPollution && noOld;
  renderMetrics($('metrics'), [
    ['已换账号', switched?'是':'否', 'A→B', switched],
    ['晚到未污染', noPollution?'是':'否', '不越权', noPollution],
    ['旧查询不可开', noOld?'是':'否', 'T12', noOld],
    ['总判定', pass?'PASS':'FAIL', 'T12', pass],
  ]);
  $('pass').innerHTML=passList([
    [noPollution, '旧任务/媒体回调不污染新库、不越权'],
    [noOld, '旧查询不可继续打开'],
    [switched, '完成换账号作用域切换'],
  ]);
}
show();
