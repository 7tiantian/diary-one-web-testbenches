
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

const KEY='t08_story';
const AI_ORIG='沿着石板路慢慢走，屋檐影子把路面切成一段一段。';
function data(){
  return storeGet(KEY,{
    chapterId:'C01', aiStory:AI_ORIG, saved:null, draft:'', lastError:null,
    reboundWrong:false, aiOverwrote:false, draftPersistedAfterDiscard:false
  });
}
function paint(){
  const d=data();
  $('cid').textContent=d.chapterId;
  $('ai').textContent=d.aiStory;
  $('saved').textContent=d.saved? `${d.saved.text}\n(绑定 ${d.saved.chapterId} · ${d.saved.savedAt})` : '（无）';
  $('draft').value=d.draft||'';
  const keepOld = d.lastError? !!(d.saved&&d.saved.text) : true;
  const bindOk = !d.saved || d.saved.chapterId===d.chapterId;
  const noAiOver = d.aiStory===AI_ORIG && !d.aiOverwrote && (!d.saved || d.saved.text!==d.aiStory);
  const noDraft = !d.draftPersistedAfterDiscard && (d._discarded? d.draft==='' : true);
  const pass = keepOld && bindOk && noAiOver && (d._discarded? $('draft').value==='' : true);
  renderMetrics($('metrics'), [
    ['失败后旧文仍在', keepOld?'是':'否', '保存失败', keepOld],
    ['绑定正确', bindOk?'是':'否', '不错绑', bindOk],
    ['AI 未覆盖补记', noAiOver?'是':'否', 'ST', noAiOver],
    ['草稿不持久', d._discarded?($('draft').value===''?'是':'否'):'放弃后测', '放弃即丢', !d._discarded || $('draft').value===''],
    ['总判定', pass?'PASS':'FAIL', 'T08', pass],
  ]);
  $('pass').innerHTML=passList([
    [keepOld, '保存失败不丢旧文本'],
    [bindOk, '补记不错绑到其他记忆'],
    [noAiOver, '算法重生成不覆盖用户补记'],
    [!d._discarded || $('draft').value==='', '放弃后草稿不持久'],
  ]);
}
$('save').onclick=()=>{
  const d=data();
  const text=$('draft').value.trim(); if(!text){ alert('空'); return; }
  d.saved={ chapterId:d.chapterId, text, savedAt:nowIso() };
  d.draft=''; d.lastError=null; d._discarded=false;
  storeSet(KEY,d); paint();
};
$('saveFail').onclick=()=>{
  const d=data();
  d.lastError='SAVE_FAILED';
  // 草稿可仍在，但 saved 不得被破坏
  storeSet(KEY,d); paint();
};
$('discard').onclick=()=>{
  const d=data();
  d.draft=''; d._discarded=true; d.draftPersistedAfterDiscard=false;
  storeSet(KEY,d); $('draft').value=''; paint();
};
$('concurrent').onclick=()=>{
  const d=data();
  // 并发：旧写入不得改绑定到别的 chapter
  if(d.saved){ d.saved={...d.saved, savedAt:nowIso()}; }
  d.reboundWrong=false;
  storeSet(KEY,d); paint();
};
$('remove').onclick=()=>{
  const d=data(); d.saved=null; storeSet(KEY,d); paint();
};
$('regen').onclick=()=>{
  const d=data();
  // 正确：只改 AI story，不动 saved
  d.aiStory=AI_ORIG+'（版式微调）';
  // 若错误实现会把 ai 写入 saved —— 我们保持正确
  d.aiOverwrote=false;
  storeSet(KEY,d); paint();
};
$('draft').oninput=()=>{ const d=data(); d.draft=$('draft').value; d._discarded=false; storeSet(KEY,d); };
paint();
