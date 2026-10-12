
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

const a=$('a'), b=$('b');
let interrupted=false, autoplayOnReturn=false, singleOk=true;
function paintSample(video, color){
  // 无文件时用 canvas 生成短视频不太现实；用空 src + 手动标记演示
  video.removeAttribute('src'); video.load();
  video.dataset.sample=color;
}
$('load').onclick=()=>{
  const files=[...($('vfiles').files||[])];
  if(files[0]) a.src=URL.createObjectURL(files[0]); else paintSample(a,'#333');
  if(files[1]) b.src=URL.createObjectURL(files[1]); else if(files[0]) b.src=URL.createObjectURL(files[0]); else paintSample(b,'#555');
};
function sync(){
  const ap=!a.paused, bp=!b.paused;
  singleOk = !(ap && bp);
  $('playState').textContent = `A ${ap?'播放':'暂停'} · B ${bp?'播放':'暂停'} · 中断标记 ${interrupted} · 返回自动播 ${autoplayOnReturn}`;
  evalPass();
}
a.addEventListener('play', ()=>{ if(!b.paused){ b.pause(); } interrupted=false; sync(); });
b.addEventListener('play', ()=>{ if(!a.paused){ a.pause(); } interrupted=false; sync(); });
a.addEventListener('pause', sync); b.addEventListener('pause', sync);
$('interrupt').onclick=()=>{
  a.pause(); b.pause();
  interrupted=true;
  autoplayOnReturn=false;
  sync();
};
$('resumeApp').onclick=()=>{
  // 正确：返回不自动 play
  autoplayOnReturn = (!a.paused || !b.paused);
  if(!a.paused||!b.paused){ /* 若有人自动播了就算 fail */ }
  // ensure paused
  a.pause(); b.pause();
  sync();
};
function evalPass(){
  const both=(!a.paused && !b.paused);
  singleOk=!both;
  const interruptOk = interrupted? (a.paused&&b.paused): true;
  const noAuto = !autoplayOnReturn && a.paused && b.paused;
  const pass = singleOk && interruptOk && (interrupted? noAuto : singleOk);
  renderMetrics($('metrics'), [
    ['单播放源', singleOk?'是':'否', '不能两路同播', singleOk],
    ['中断已暂停', interruptOk?'是':'否', '锁屏/来电', interruptOk],
    ['返回不自动播', interrupted?(noAuto?'是':'否'):'先测中断', 'T07', !interrupted || noAuto],
    ['总判定', pass?'PASS':'FAIL', 'T07', pass],
  ]);
  $('pass').innerHTML=passList([
    [singleOk, '最多一个播放源'],
    [interruptOk, '中断时暂停'],
    [!interrupted || noAuto, '返回应用不自动播放'],
  ]);
}
evalPass();
