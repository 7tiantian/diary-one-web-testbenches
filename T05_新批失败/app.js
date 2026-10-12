
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

const KEY='t05_day';
function seed(){
  storeSet(KEY,{
    day:'2026-10-11',
    status:'READY',
    chapters:[{id:'C01', title:'石板路上的午后', story:'沿着石板路慢慢走。'}],
    storyNote:{ chapterId:'C01', text:'那天风有点大，只有我知道。', savedAt:nowIso() },
    lastFailure:null,
    shownAsEmptyDay:false,
  });
  render();
}
$('seed').onclick=seed;
$('failBatch').onclick=()=>{
  const d=storeGet(KEY,null); if(!d){ alert('先写入 Ready'); return; }
  // 正确行为：保留旧 Ready，记录失败，不改成 Empty Day
  d.lastFailure={ delivery_state:'PIPELINE_BLOCKED', at:nowIso(), message:'新批失败' };
  d.shownAsEmptyDay=false;
  d.status='READY'; // 旧的仍 Ready
  storeSet(KEY,d); render();
};
$('wrongEmpty').onclick=()=>{
  const d=storeGet(KEY,null); if(!d){ alert('先写入 Ready'); return; }
  d.chapters=[]; d.storyNote=null; d.status='EMPTY_DAY'; d.shownAsEmptyDay=true;
  d.lastFailure={ delivery_state:'PIPELINE_BLOCKED', at:nowIso() };
  storeSet(KEY,d); render();
};
function render(){
  const d=storeGet(KEY,null);
  $('dayView').textContent = d? JSON.stringify(d,null,2) : '尚未建立';
  if(!d){ renderMetrics($('metrics'),[['总判定','—','先点写入',false]]); $('pass').innerHTML=''; return; }
  const oldVisible = d.status==='READY' && (d.chapters||[]).length>0;
  const noteOk = !!(d.storyNote && d.storyNote.text);
  const notEmpty = d.shownAsEmptyDay!==true && d.status!=='EMPTY_DAY';
  const hasFail = !!d.lastFailure;
  const pass = oldVisible && noteOk && notEmpty && hasFail;
  renderMetrics($('metrics'), [
    ['旧 Ready 可见', oldVisible?'是':'否', '不得被新批抹掉', oldVisible],
    ['补记仍在', noteOk?'是':'否', '不错丢', noteOk],
    ['失败≠Empty Day', notEmpty?'是':'否', 'AI03', notEmpty],
    ['已记录失败', hasFail?'是':'否', '可诊断', hasFail],
    ['总判定', pass?'PASS':'FAIL', 'T05', pass],
  ]);
  $('pass').innerHTML=passList([
    [oldVisible, '旧结果仍可看'],
    [noteOk, '补记仍可看'],
    [notEmpty, '失败不显示成 Empty Day'],
  ]);
}
render();
