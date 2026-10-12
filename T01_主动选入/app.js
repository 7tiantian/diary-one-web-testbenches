
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

const KEY='t01_ledger';
let pendingCancel=[];
function sourceTag(){ return 'PHOTO_LIBRARY_TEST'; }
function render(){
  const ledger=storeGet(KEY,[]);
  $('ledger').innerHTML = ledger.length? ledger.map(x=>`
    <div class="item"><div><strong>${x.name}</strong><br/>
    <span class="chip">${x.source}</span>
    <span class="note">${x.id.slice(0,12)}… · ${x.bytes} B · ${x.addedAt}</span></div></div>`).join('')
    : '<p class="note">账本为空</p>';
  const allTest = ledger.every(x=>x.source===sourceTag());
  const cancelClean = pendingCancel.length===0;
  const noGhost = !ledger.some(x=>x._fromCancelled);
  const pass = allTest && cancelClean && noGhost;
  renderMetrics($('metrics'), [
    ['账本条数', ledger.length, '仅第一次提交', true],
    ['来源全是测试', allTest?'是':'否', 'PHOTO_LIBRARY_TEST', allTest],
    ['取消池已清空', cancelClean?'是':'否', '取消后不得残留待上传', cancelClean],
    ['无取消污染', noGhost?'是':'否', '取消批次不得进账本', noGhost],
    ['总判定', pass?'PASS':'FAIL', 'T01', pass],
  ]);
  $('pass').innerHTML = passList([
    [allTest, '来源是测试（PHOTO_LIBRARY_TEST）'],
    [cancelClean && noGhost, '未选/取消素材不进账本、不上传'],
    [pass, '本台验收通过'],
  ]);
}
async function addFiles(files, fromCancelled){
  const ledger=storeGet(KEY,[]);
  for(const f of files){
    const id = await fileFingerprint(f);
    if(ledger.some(x=>x.id===id)) continue;
    ledger.push({id, name:f.name, bytes:f.size, type:f.type, source:sourceTag(), addedAt:nowIso(), _fromCancelled:!!fromCancelled});
  }
  storeSet(KEY, ledger);
  render();
}
$('commit1').onclick = async ()=>{
  const files=[...($('pick1').files||[])];
  if(!files.length){ alert('请先选择要计入的素材'); return; }
  await addFiles(files, false);
};
$('pick2').onchange = ()=>{
  pendingCancel=[...($('pick2').files||[])].map(f=>({name:f.name, size:f.size}));
  $('pending2').textContent = '待取消池：'+pendingCancel.map(x=>x.name).join(', ');
};
$('cancel2').onclick = ()=>{
  pendingCancel=[];
  $('pick2').value='';
  $('pending2').textContent='已取消：这些文件未读取进账本、未进入上传清单。';
  render();
};
$('wrongCommit2').onclick = async ()=>{
  const files=[...($('pick2').files||[])];
  if(!files.length){ alert('请先在第二次选择里选文件'); return; }
  await addFiles(files, true);
  alert('已故意写入取消批次——判定应为 FAIL（用于验证门禁）');
};
$('clearLedger').onclick = ()=>{ storeSet(KEY,[]); pendingCancel=[]; render(); };
$('export').onclick = ()=>{
  const blob=new Blob([JSON.stringify({case:'T01', ledger:storeGet(KEY,[]), at:nowIso()},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='T01_主动选入_验收.json'; a.click();
};
render();
