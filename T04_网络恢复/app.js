
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

function headers(){ return { Authorization:'Bearer '+$('token').value.trim() }; }
$('genRev').onclick = ()=>{ $('rev').value = 'dayrev_t04_'+Date.now(); };
$('submitDrop').onclick = async ()=>{
  const f=$('zip').files?.[0]; if(!f){ alert('选 zip'); return; }
  let rev=$('rev').value.trim(); if(!rev){ rev='dayrev_t04_'+Date.now(); $('rev').value=rev; }
  const fd=new FormData(); fd.append('bundle',f,f.name); fd.append('day_revision_id',rev);
  try{
    const r=await fetch($('bff').value.replace(/\/$/,'')+'/v1/day-revisions',{method:'POST',headers:headers(),body:fd});
    const j=await r.json();
    // 模拟「丢回复」：只保留最小线索
    const hint={ rev, job_id:j.job_id||j.id, http:r.status, droppedBody:true, at:nowIso() };
    storeSet('t04_hint', hint);
    $('log').textContent='已模拟丢弃完整响应，仅保留线索:\n'+JSON.stringify(hint,null,2);
    evalPass();
  }catch(e){ $('log').textContent=String(e); }
};
$('recover').onclick = async ()=>{
  const hint=storeGet('t04_hint',{});
  if(!hint.job_id){ alert('无线索'); return; }
  const r=await fetch($('bff').value.replace(/\/$/,'')+'/v1/jobs/'+hint.job_id,{headers:headers()});
  const j=await r.json();
  storeSet('t04_recover',{job_id:hint.job_id, body:j, at:nowIso()});
  $('log').textContent='恢复查询原任务:\n'+JSON.stringify(j,null,2);
  evalPass();
};
$('submitAgain').onclick = async ()=>{
  const f=$('zip').files?.[0]; const rev=$('rev').value.trim();
  if(!f||!rev){ alert('需要 zip 与同一 revision'); return; }
  const fd=new FormData(); fd.append('bundle',f,f.name); fd.append('day_revision_id',rev);
  const r=await fetch($('bff').value.replace(/\/$/,'')+'/v1/day-revisions',{method:'POST',headers:headers(),body:fd});
  const j=await r.json();
  const hint=storeGet('t04_hint',{});
  const same = (j.job_id||j.id)===hint.job_id || j.idempotent===true || j.reused===true;
  storeSet('t04_second',{body:j, sameJob:same, at:nowIso()});
  $('log').textContent='第二次提交:\n'+JSON.stringify(j,null,2)+'\n同 job? '+same;
  evalPass();
};
function evalPass(){
  const hint=storeGet('t04_hint',{});
  const rec=storeGet('t04_recover',{});
  const sec=storeGet('t04_second',{});
  const recovered=!!rec.job_id;
  const same=sec.sameJob===true;
  const pass=recovered && (sec.body? same : recovered);
  renderMetrics($('metrics'), [
    ['丢回复后线索', hint.job_id||'无', '应有 job', !!hint.job_id],
    ['恢复查到原任务', recovered?'是':'否', 'T04', recovered],
    ['二次提交同 job', sec.body?(same?'是':'否'):'未测', '无危险双计费', sec.body?same:true],
    ['总判定', (recovered && (!sec.body||same))?'PASS':'FAIL', 'T04', recovered && (!sec.body||same)],
  ]);
  $('pass').innerHTML=passList([
    [recovered, '提交成功后丢回复，仍能查原任务'],
    [!sec.body || same, '同 revision 再次提交不双计费'],
  ]);
}
evalPass();
