
async function loadSample() {
  const res = await fetch('sample_preview.json');
  const data = await res.json();
  document.getElementById('jsonIn').value = JSON.stringify(data, null, 2);
  analyze();
}
function readJson() {
  try { return JSON.parse(document.getElementById('jsonIn').value); }
  catch (e) { alert('JSON 无法解析: ' + e.message); return null; }
}
function metric(k, v, t, ok) {
  return `<div class="metric"><div class="k">${k}</div><div class="v ${ok?'ok':'bad'}">${v}</div><div class="t">${t}</div></div>`;
}
document.getElementById('loadSample')?.addEventListener('click', loadSample);
document.getElementById('analyze')?.addEventListener('click', analyze);
document.getElementById('fileJson')?.addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  document.getElementById('jsonIn').value = await f.text();
});

let chapters=[];
function visibleChapters(data){
  const outcomes=data.selected_memory_outcomes||[];
  return (data.chapters||[]).filter(c=>{
    if (c.publication_status && c.publication_status!=='STAGED_PREVIEW_VALIDATED') return false;
    const o=outcomes.find(x=>x.memory_type==='CHAPTER'&&x.memory_id===c.id);
    return !o || o.visibility_state==='VISIBLE_PREVIEW';
  }).map(c=>({...c, human:null}));
}
function render(){
  const n=chapters.length;
  const inRange=n>=0 && n<=5;
  const inTarget=n===0 || (n>=3&&n<=4) || n===5;
  const judged=chapters.filter(c=>c.human);
  const ok=judged.filter(c=>c.human==='ok').length;
  const mixed=judged.filter(c=>c.human==='mixed').length;
  const rate=judged.length? ok/judged.length : null;
  document.getElementById('metricGrid').innerHTML=[
    metric('可见 Chapter 数', n, '允许 0–5；目标 3–4', inRange),
    metric('落在目标带/诚实更少', inTarget?'YES':'CHECK', '0 或 3–4 或丰富日5', inTarget),
    metric('人工边界正确率', rate==null?'—':(rate*100).toFixed(1)+'%', '≥80%', rate==null?true:rate>=0.8),
    metric('无关混入章数', mixed, '=0', mixed===0),
  ].join('');
  document.getElementById('list').innerHTML=`<table><thead><tr><th>ID</th><th>标题/故事</th><th>媒体数</th><th>边界判定</th></tr></thead><tbody>`+
    chapters.map((c,i)=>`<tr>
      <td>${c.id}</td>
      <td><b>${c.title||''}</b><br/>${c.story||''}</td>
      <td>${(c.media||[]).length}</td>
      <td>
        <button onclick="mark(${i},'ok')">边界正确</button>
        <button class="secondary" onclick="mark(${i},'split')">应拆</button>
        <button class="secondary" onclick="mark(${i},'merge')">应合</button>
        <button class="secondary" onclick="mark(${i},'mixed')">无关混入</button>
        <div class="note">${c.human||'未评'}</div>
      </td></tr>`).join('')+'</tbody></table>';
}
window.mark=(i,v)=>{chapters[i].human=v;render();};
function analyze(){ const d=readJson(); if(!d)return; chapters=visibleChapters(d); render(); }
