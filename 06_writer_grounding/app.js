
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

const FILLER=/生活片段|美好的一天|记录生活|平凡小确幸|值得纪念/;
let items=[];
function render(){
  const judged=items.filter(i=>i.human);
  const keep=judged.filter(i=>i.human==='keep').length;
  const fab=judged.filter(i=>i.human==='fab').length;
  const filler=items.filter(i=>FILLER.test(i.text)).length;
  const ahaOver=items.filter(i=>i.kind==='aha' && [...i.text].length>24).length;
  const rate=judged.length?keep/judged.length:null;
  document.getElementById('metricGrid').innerHTML=[
    metric('可保留率', rate==null?'—':(rate*100).toFixed(1)+'%', '≥80%', rate==null?true:rate>=0.8),
    metric('编纂条数', fab, '=0', fab===0),
    metric('套话命中', filler, '建议0', filler===0),
    metric('Aha超24字', ahaOver, '=0', ahaOver===0),
  ].join('');
  document.getElementById('list').innerHTML=`<table><thead><tr><th>类型</th><th>文案</th><th>辅助</th><th>判定</th></tr></thead><tbody>`+
    items.map((it,i)=>`<tr>
      <td>${it.kind}</td><td><b>${it.title||''}</b> ${it.text}</td>
      <td>${FILLER.test(it.text)?'<span class="bad">疑似套话</span>':'—'}</td>
      <td>
        <button onclick="mark(${i},'keep')">可保留</button>
        <button class="secondary" onclick="mark(${i},'rewrite')">需改</button>
        <button class="secondary" onclick="mark(${i},'fab')">编纂</button>
        <div class="note">${it.human||'未评'}</div>
      </td></tr>`).join('')+'</tbody></table>';
}
window.mark=(i,v)=>{items[i].human=v;render();};
function analyze(){
  const d=readJson(); if(!d)return;
  items=[];
  (d.chapters||[]).forEach(c=>items.push({kind:'chapter', title:c.title, text:c.story||'', human:null}));
  (d.ahas||[]).forEach(a=>items.push({kind:'aha', title:a.id, text:a.story||'', human:null}));
  render();
}
