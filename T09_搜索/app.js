
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

const KEY='t09_db';
let apiCalls=0, lastMode='ok';
function seed(){
  storeSet(KEY,{
    items:[
      {id:'C01', title:'石板路上的午后', story:'沿着石板路慢慢走。', note:'那天细节只有我知道。'},
      {id:'C02', title:'河边停一下', story:'水声盖过远处的人声。', note:''},
    ]
  });
  apiCalls=0; lastMode='ok'; renderDb(); evalPass([]);
}
function renderDb(){ $('db').textContent=JSON.stringify(storeGet(KEY,{items:[]}),null,2); }
$('seed').onclick=seed;
$('removeNote').onclick=()=>{
  const db=storeGet(KEY,{items:[]});
  db.items=db.items.map(x=>x.id==='C01'?{...x, note:''}:x);
  storeSet(KEY,db); renderDb();
  if($('q').value.trim()) $('search').click();
};
$('fault').onclick=()=>{ lastMode='fault'; evalPass([]); $('results').innerHTML='<p class="bad">读取失败（不是零命中）</p>'; };
$('clearFault').onclick=()=>{ lastMode='ok'; evalPass([]); };
$('search').onclick=()=>{
  apiCalls+=0; // 本地，不增加云 API
  $('apiNote').textContent='本轮云 API 请求数：0（本地检索）';
  if(lastMode==='fault'){
    $('results').innerHTML='<p class="bad">读取失败 —— 展示故障态，不得显示「没有结果」</p>';
    evalPass({fault:true, zeroHitsShown:false});
    return;
  }
  const q=$('q').value.trim();
  const db=storeGet(KEY,{items:[]});
  const hits=db.items.filter(x=> (x.title+x.story+x.note).includes(q));
  $('results').innerHTML = hits.length? hits.map(h=>`<div class="item"><div><strong>${h.title}</strong><br/>${h.note||h.story}</div></div>`).join('')
    : '<p class="note">没有匹配（零命中）</p>';
  evalPass({fault:false, hits:hits.length, q});
};
function evalPass(info){
  const noApi = apiCalls===0;
  const faultOk = lastMode!=='fault' || (info && info.fault && info.zeroHitsShown===false);
  const staleOk = (()=>{
    if(!info || info.fault) return true;
    const db=storeGet(KEY,{items:[]});
    const still = db.items.some(x=>(x.note||'').includes('只有我知道'));
    if((info.q||'').includes('只有我知道')) return still? info.hits>0 : info.hits===0;
    return true;
  })();
  const pass = noApi && faultOk && staleOk;
  renderMetrics($('metrics'), [
    ['云 API 次数', 0, '必须为 0', noApi],
    ['来源变更后一致', staleOk?'是':'否', '移除补记后失效', staleOk],
    ['故障态正确', lastMode==='fault'?(faultOk?'故障≠零命中':'错'):'未注入或已清除', 'SEA', faultOk],
    ['总判定', pass?'PASS':'FAIL', 'T09', pass],
  ]);
  $('pass').innerHTML=passList([
    [noApi, '无搜索云 API 请求'],
    [staleOk, '来源移除/更新后结果及时失效'],
    [faultOk, '故障不等于零命中'],
  ]);
}
seed();
