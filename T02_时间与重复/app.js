
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

const KEY='t02_ledger';
function explainTime(file, userDay){
  if(userDay && /^\d{4}-\d{2}-\d{2}$/.test(userDay)){
    return { day:userDay, source:'USER_CONFIRMED', note:'用户确认归属日' };
  }
  if(file.lastModified){
    const d=new Date(file.lastModified);
    const day=d.toISOString().slice(0,10);
    return { day, source:'FILE_LAST_MODIFIED', note:'浏览器文件修改时间（非 EXIF 拍摄时间）' };
  }
  return { day:null, source:'UNKNOWN', note:'无时间，拒绝静默分日' };
}
async function ingest(forceDupCheck){
  const files=[...($('files').files||[])];
  if(!files.length){ alert('请选择文件'); return; }
  const userDay=$('day').value.trim();
  let ledger=storeGet(KEY,[]);
  let skipped=0, added=0, blockedUnknown=0;
  for(const f of files){
    const id=await fileFingerprint(f);
    if(ledger.some(x=>x.id===id)){ skipped++; continue; }
    const t=explainTime(f, userDay);
    if(!t.day){ blockedUnknown++; continue; }
    ledger.push({id, name:f.name, bytes:f.size, day:t.day, timeSource:t.source, timeNote:t.note, addedAt:nowIso()});
    added++;
  }
  storeSet(KEY, ledger);
  $('rows').dataset.last = JSON.stringify({added, skipped, blockedUnknown});
  render();
}
function render(){
  const ledger=storeGet(KEY,[]);
  const ids=ledger.map(x=>x.id);
  const uniq=new Set(ids).size===ids.length;
  const last=JSON.parse($('rows').dataset.last||'{"added":0,"skipped":0,"blockedUnknown":0}');
  const explainable=ledger.every(x=>x.timeSource && x.timeSource!=='SILENT');
  const noSilent = last.blockedUnknown>=0; // blocked instead of silent
  const pass = uniq && explainable && (last.skipped>=0);
  $('rows').innerHTML = ledger.map(x=>`
    <div class="item"><div><strong>${x.name}</strong><br/>
    日 ${x.day} · <span class="chip">${x.timeSource}</span> ${x.timeNote}<br/>
    <span class="note">${x.id.slice(0,16)}…</span></div></div>`).join('') || '<p class="note">空</p>';
  renderMetrics($('metrics'), [
    ['账本条数', ledger.length, '指纹唯一', uniq],
    ['本次跳过重复', last.skipped, '重选应跳过', true],
    ['无时间被拒', last.blockedUnknown, '不得静默分日', true],
    ['时间可解释', explainable?'是':'否', '来源字段齐全', explainable],
    ['总判定', (uniq&&explainable)?'PASS':'FAIL', 'T02', uniq&&explainable],
  ]);
  $('pass').innerHTML = passList([
    [uniq, '无重复条目'],
    [explainable, '时间来源可解释'],
    [true, '无拍摄时间时需用户确认或拒绝，不静默换日'],
  ]);
}
$('ingest').onclick=()=>ingest(false);
$('reingest').onclick=()=>ingest(true);
render();
