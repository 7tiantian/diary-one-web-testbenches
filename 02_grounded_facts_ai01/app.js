
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

let claims = [];
function collectClaims(data) {
  const out = [];
  (data.observations || []).forEach(o => {
    (o.facts || []).forEach(f => {
      out.push({
        id: f.fact_id || (o.source_asset_id + ':' + (f.text||'').slice(0,12)),
        text: f.text || JSON.stringify(f),
        frames: f.evidence_frame_ids || [],
        source: 'observation',
        human: null,
      });
    });
  });
  (data.chapters || []).forEach(c => {
    if (c.story) out.push({ id: c.id+':story', text: `【${c.title||''}】${c.story}`, frames: c.hero_frame_id?[c.hero_frame_id]:[], source:'chapter', human:null });
  });
  (data.ahas || []).forEach(a => {
    if (a.story) out.push({ id: a.id+':story', text: a.story, frames: a.core_frame_id?[a.core_frame_id]:[], source:'aha', human:null });
  });
  return out;
}
function bannedHint(text) {
  return /第一次|父亲|母亲|老婆|老公|庆祝成功|很开心|感动哭/.test(text || '');
}
function render() {
  const withFrames = claims.filter(c => c.frames.length).length;
  const judged = claims.filter(c => c.human);
  const grounded = judged.filter(c => c.human === 'grounded').length;
  const fab = judged.filter(c => c.human === 'fabricated').length;
  const autoCov = claims.length ? withFrames / claims.length : 0;
  const humanRate = judged.length ? grounded / judged.length : null;
  const banHits = claims.filter(c => bannedHint(c.text)).length;
  document.getElementById('metricGrid').innerHTML = [
    metric('陈述条数', claims.length, 'observation+chapter+aha', claims.length>0),
    metric('自动帧引用覆盖率', (autoCov*100).toFixed(1)+'%', '≥95%', autoCov>=0.95),
    metric('人工接地通过率', humanRate==null?'—':(humanRate*100).toFixed(1)+'%', '≥90%（已评）', humanRate==null?true:humanRate>=0.9),
    metric('人工编纂数', fab, '=0', fab===0),
    metric('高风险措辞命中', banHits, '需人工重点查', banHits===0),
  ].join('');
  document.getElementById('claimList').innerHTML = `<table><thead><tr><th>来源</th><th>陈述</th><th>帧引用</th><th>打分</th></tr></thead><tbody>` +
    claims.map((c,i)=>`<tr>
      <td>${c.source}</td>
      <td>${c.text}${bannedHint(c.text)?' <span class="bad">⚠高风险词</span>':''}</td>
      <td>${c.frames.length?c.frames.join(', '):'<span class="bad">无</span>'}</td>
      <td>
        <button onclick="mark(${i},'grounded')">有证据</button>
        <button class="secondary" onclick="mark(${i},'fabricated')">编纂/无证据</button>
        <div class="note">${c.human||'未评'}</div>
      </td></tr>`).join('') + '</tbody></table>';
}
window.mark = (i, v) => { claims[i].human = v; render(); };
function analyze() {
  const data = readJson(); if (!data) return;
  claims = collectClaims(data);
  render();
}
