
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

function visLen(s){ return [...(s||'')].length; }
let ahas=[];
function render(){
  const n=ahas.length;
  const over=ahas.filter(a=>visLen(a.story)>24).length;
  const judged=ahas.filter(a=>a.human);
  const indep=judged.filter(a=>a.human==='independent').length;
  const dup=judged.filter(a=>a.human==='dup').length;
  const rate=judged.length?indep/judged.length:null;
  document.getElementById('metricGrid').innerHTML=[
    metric('Aha 数', n, '0–3', n>=0&&n<=3),
    metric('>24 字条数', over, '=0', over===0),
    metric('独立故事率', rate==null?'—':(rate*100).toFixed(1)+'%', '≥85%', rate==null?true:rate>=0.85),
    metric('重复高潮数', dup, '=0', dup===0),
  ].join('');
  document.getElementById('list').innerHTML=`<table><thead><tr><th>ID</th><th>文案</th><th>字数</th><th>判定</th></tr></thead><tbody>`+
    ahas.map((a,i)=>`<tr>
      <td>${a.id}</td><td>${a.story||''}</td><td class="${visLen(a.story)>24?'bad':''}">${visLen(a.story)}</td>
      <td>
        <button onclick="mark(${i},'independent')">独立可回看</button>
        <button class="secondary" onclick="mark(${i},'dup')">与 Chapter 重复</button>
        <button class="secondary" onclick="mark(${i},'weak')">不值得</button>
        <div class="note">${a.human||'未评'}</div>
      </td></tr>`).join('')+'</tbody></table>';
}
window.mark=(i,v)=>{ahas[i].human=v;render();};
function analyze(){
  const d=readJson(); if(!d)return;
  ahas=(d.ahas||[]).filter(a=>!a.publication_status||a.publication_status==='STAGED_PREVIEW_VALIDATED')
    .map(a=>({...a, human:null}));
  render();
}
