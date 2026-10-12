
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

let lastJob=null, lastResult=null;
function headers(){ return { Authorization: 'Bearer '+$('token').value.trim() }; }
$('health').onclick = async ()=>{
  try{
    const r=await fetch($('bff').value.replace(/\/$/,'')+'/health');
    const j=await r.json();
    $('healthOut').textContent=JSON.stringify(j,null,2);
    const mock=j.allow_mock_preview===true;
    const mc=j.mobileclip?.available;
    storeSet('t03_health',{mock, mc, raw:j, at:nowIso()});
    evalPass();
  }catch(e){ $('healthOut').textContent='失败: '+e; }
};
$('submit').onclick = async ()=>{
  const f=$('zip').files?.[0];
  if(!f){ alert('请选择 08 产出的 zip'); return; }
  const health=storeGet('t03_health',{});
  if(health.mock===true){ alert('allow_mock_preview=true：质量路径下 T03 不得用 mock 冒充真链路'); }
  const fd=new FormData();
  fd.append('bundle', f, f.name);
  const rev=$('rev').value.trim() || ('dayrev_t03_'+Date.now());
  $('rev').value=rev;
  fd.append('day_revision_id', rev);
  $('log').textContent='提交中…';
  try{
    const r=await fetch($('bff').value.replace(/\/$/,'')+'/v1/day-revisions', { method:'POST', headers:headers(), body:fd });
    const text=await r.text();
    let j; try{ j=JSON.parse(text);}catch{ j={raw:text}; }
    $('log').textContent='HTTP '+r.status+'\n'+JSON.stringify(j,null,2);
    lastJob=j.job_id||j.id||j.jobId||null;
    storeSet('t03_last',{rev, job_id:lastJob, status:r.status, body:j, at:nowIso(), file:f.name});
    evalPass();
  }catch(e){ $('log').textContent='错误: '+e; }
};
$('poll').onclick = async ()=>{
  const last=storeGet('t03_last',{});
  const job=last.job_id;
  if(!job){ alert('尚无 job_id'); return; }
  try{
    const r=await fetch($('bff').value.replace(/\/$/,'')+'/v1/jobs/'+job, { headers:headers() });
    const j=await r.json();
    lastResult=j;
    $('log').textContent='查询 '+job+'\n'+JSON.stringify(j,null,2);
    storeSet('t03_job',{job, body:j, at:nowIso()});
    evalPass();
  }catch(e){ $('log').textContent='查询失败: '+e; }
};
$('saveLocal').onclick = ()=>{
  const job=storeGet('t03_job',null);
  if(!job){ alert('请先查询到任务结果'); return; }
  storeSet('t03_diary_snapshot',{ savedAt:nowIso(), job });
  $('localOut').textContent='已保存本地快照';
  evalPass();
};
$('reloadLocal').onclick = ()=>{
  const snap=storeGet('t03_diary_snapshot',null);
  $('localOut').textContent = snap? JSON.stringify(snap,null,2) : '无本地快照';
  evalPass();
};
function evalPass(){
  const health=storeGet('t03_health',{});
  const last=storeGet('t03_last',{});
  const job=storeGet('t03_job',{});
  const snap=storeGet('t03_diary_snapshot',null);
  const realCloud = health.mock===false;
  const hasJob = !!last.job_id;
  const traced = !!(job.body && (job.body.result || job.body.status || job.body.state));
  const reopen = !!snap;
  const pass = realCloud && hasJob && traced && reopen;
  renderMetrics($('metrics'), [
    ['mock 关闭', String(health.mock), '必须 false', health.mock===false],
    ['已提交 job', last.job_id||'无', '可追查', hasJob],
    ['可追到结果态', traced?'是':'否', '输入→任务→状态', traced],
    ['重开可读', reopen?'是':'否', '本地快照', reopen],
    ['总判定', pass?'PASS':'FAIL', 'T03 须真云', pass],
  ]);
  $('pass').innerHTML = passList([
    [realCloud, '实际云服务且 mock=false（不能用 Local preview 代替）'],
    [hasJob && traced, '结果可追到输入、任务与状态'],
    [reopen, '重开后仍可读'],
  ]);
}
evalPass();
