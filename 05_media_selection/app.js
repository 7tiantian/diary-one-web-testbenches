
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
function render(){
  const n=chapters.length||1;
  const countOk=chapters.filter(c=>{const m=(c.media||[]).length; return m>=3&&m<=5;}).length;
  const missingHero=chapters.filter(c=>!c.hero_frame_id && !(c.media||[]).some(x=>x.role==='HERO')).length;
  const judged=chapters.filter(c=>c.human);
  const heroOk=judged.filter(c=>c.human==='hero_ok').length;
  const low=judged.filter(c=>c.human==='low').length;
  const rateCount=chapters.length?countOk/chapters.length:0;
  const rateHero=judged.length?heroOk/judged.length:null;
  document.getElementById('metricGrid').innerHTML=[
    metric('3–5 件占比', (rateCount*100).toFixed(1)+'%', '≥90%', rateCount>=0.9),
    metric('缺 Hero 章数', missingHero, '=0', missingHero===0),
    metric('封面正确率', rateHero==null?'—':(rateHero*100).toFixed(1)+'%', '≥85%', rateHero==null?true:rateHero>=0.85),
    metric('低质入选章数', low, '=0', low===0),
  ].join('');
  document.getElementById('list').innerHTML=`<table><thead><tr><th>Chapter</th><th>件数</th><th>Hero</th><th>判定</th></tr></thead><tbody>`+
    chapters.map((c,i)=>{
      const m=(c.media||[]).length;
      const hero=c.hero_frame_id || (c.media||[]).find(x=>x.role==='HERO')?.frame_id || '—';
      return `<tr><td>${c.id} ${c.title||''}</td>
        <td class="${(m>=3&&m<=5)?'ok':'bad'}">${m}</td><td>${hero}</td>
        <td>
          <button onclick="mark(${i},'hero_ok')">封面正确</button>
          <button class="secondary" onclick="mark(${i},'hero_bad')">封面不对</button>
          <button class="secondary" onclick="mark(${i},'dup')">重复</button>
          <button class="secondary" onclick="mark(${i},'low')">低质</button>
          <div class="note">${c.human||'未评'}</div>
        </td></tr>`;
    }).join('')+'</tbody></table>';
}
window.mark=(i,v)=>{chapters[i].human=v;render();};
function analyze(){
  const d=readJson(); if(!d)return;
  chapters=(d.chapters||[]).filter(c=>!c.publication_status||c.publication_status==='STAGED_PREVIEW_VALIDATED')
    .map(c=>({...c, human:null}));
  render();
}
