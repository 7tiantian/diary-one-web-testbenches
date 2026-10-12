
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

const mem={ id:'C01', title:'石板路上的午后', story:'沿着石板路慢慢走。', note:'私人：只有我知道的话', media:['hero.jpg'] };
$('mem').textContent=JSON.stringify(mem,null,2);
$('recapAudio').checked=false;
let preview=null, exported=null, shared=false, failed=false;
function payload(){
  return {
    title:mem.title, story:mem.story, media:mem.media,
    includeNote:false, // 硬规则
    recapAudio:!!$('recapAudio').checked,
  };
}
$('preview').onclick=()=>{ preview=payload(); $('out').textContent='预览\\n'+JSON.stringify(preview,null,2); evalPass(); };
$('export').onclick=()=>{
  if(!preview){ alert('先预览'); return; }
  exported=payload();
  shared=true;
  $('out').textContent='导出\\n'+JSON.stringify(exported,null,2);
  evalPass();
};
$('cancel').onclick=()=>{ shared=false; failed=false; $('out').textContent='已取消：不记为已分享'; evalPass(); };
$('fail').onclick=()=>{ failed=true; shared=false; $('out').textContent='分享失败'; evalPass(); };
$('retry').onclick=()=>{ failed=false; $('preview').click(); };
function evalPass(){
  const audioDefaultOff = $('recapAudio').checked===false || (preview && preview.recapAudio===false) || !preview;
  const noNote = preview? preview.includeNote===false && !JSON.stringify(preview).includes('私人') : true;
  const equal = !exported || JSON.stringify(preview)===JSON.stringify(exported);
  const cancelOk = shared===false || exported; // if cancelled, shared false
  const pass = noNote && equal && ($('recapAudio').checked===false) && (preview?true:false);
  renderMetrics($('metrics'), [
    ['不含补记', noNote?'是':'否', 'SHR', noNote],
    ['预览=导出', exported?(equal?'是':'否'):'未导出', '一致', !exported||equal],
    ['Recap 原声默认关', $('recapAudio').checked?'开着':'关闭', '默认关', !$('recapAudio').checked],
    ['取消未计分享', shared?'已分享/导出':'未分享', '取消≠已分享', true],
    ['总判定', (preview && noNote && !$('recapAudio').checked && (!exported||equal))?'PASS':'FAIL', 'T11', !!(preview && noNote && !$('recapAudio').checked && (!exported||equal))],
  ]);
  $('pass').innerHTML=passList([
    [!!preview && noNote, '预览/导出不带私人补记'],
    [!exported || equal, '预览等于导出'],
    [!$('recapAudio').checked, 'Recap 原声默认关闭'],
  ]);
}
evalPass();
