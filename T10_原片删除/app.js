
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

const KEY='t10_assets';
function seed(){
  storeSet(KEY,{
    originals:[
      {id:'MO1', kind:'MANUAL_ORIGINAL', name:'IMG_1001.jpg', status:'ACTIVE'},
      {id:'MO2', kind:'MANUAL_ORIGINAL', name:'IMG_1002.jpg', status:'ACTIVE'},
    ],
    derived:[
      {id:'DV1', from:'MO1', kind:'CHAPTER_DERIVED', chapterId:'C01', status:'ACTIVE'},
      {id:'DV2', from:'MO2', kind:'CHAPTER_DERIVED', chapterId:'C02', status:'ACTIVE'},
    ],
    lastDeleteScope:null,
  });
  render();
}
$('seed').onclick=seed;
$('del').onclick=()=>{
  const d=storeGet(KEY,null); if(!d) return;
  d.originals=d.originals.map(o=>o.id==='MO1'?{...o,status:'DELETED'}:o);
  // 派生保持 ACTIVE
  d.lastDeleteScope={ids:['MO1'], affectedDerived:false, at:nowIso()};
  storeSet(KEY,d); render();
};
$('wrongDel').onclick=()=>{
  const d=storeGet(KEY,null); if(!d) return;
  d.originals=d.originals.map(o=>o.id==='MO1'?{...o,status:'DELETED'}:o);
  d.derived=d.derived.map(x=>x.from==='MO1'?{...x,status:'DELETED'}:x);
  d.lastDeleteScope={ids:['MO1'], affectedDerived:true, at:nowIso()};
  storeSet(KEY,d); render();
};
function render(){
  const d=storeGet(KEY,null);
  $('view').textContent=d?JSON.stringify(d,null,2):'未构造';
  if(!d){ return; }
  const mo1gone=d.originals.find(o=>o.id==='MO1')?.status==='DELETED';
  const derivedOk=d.derived.every(x=>x.status==='ACTIVE');
  const scopeOk=d.lastDeleteScope && d.lastDeleteScope.affectedDerived===false;
  const pass=mo1gone && derivedOk && scopeOk;
  renderMetrics($('metrics'), [
    ['MO1 已删', mo1gone?'是':'否', '原片范围', mo1gone],
    ['派生仍可用', derivedOk?'是':'否', '不损坏', derivedOk],
    ['范围确认', scopeOk?'正确':'错误级联', 'T10', scopeOk],
    ['总判定', pass?'PASS':'FAIL', 'T10', pass],
  ]);
  $('pass').innerHTML=passList([
    [mo1gone && scopeOk, '删除范围正确（仅 Manual Original）'],
    [derivedOk, '既有派生媒体不损坏'],
  ]);
}
seed();
