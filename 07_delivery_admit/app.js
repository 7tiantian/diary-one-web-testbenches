
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

function analyze(){
  const d=readJson(); if(!d)return;
  const delivery=d.delivery_state||'';
  const pub=d._publish||{};
  const admit=pub.publish_admit;
  const mock=!!d.dev_lite_fallback;
  const visible=(d.selected_memory_outcomes||[]).filter(o=>o.visibility_state==='VISIBLE_PREVIEW').length;
  const chapters=(d.chapters||[]).filter(c=>c.publication_status==='STAGED_PREVIEW_VALIDATED').length;
  const blocked = delivery==='PIPELINE_BLOCKED';
  const honestEmpty = delivery==='NO_GROUNDED_MEMORY';
  const badAdmit = blocked && admit===true;
  const badMock = mock && admit===true;
  const schemaOk = !!d.schema_version && !!delivery;
  const readyEmpty = String(delivery).startsWith('READY') && visible===0 && chapters===0;
  const pass = schemaOk && !badAdmit && !badMock;
  document.getElementById('metricGrid').innerHTML=[
    metric('delivery_state', delivery||'缺失', '必须有值', !!delivery),
    metric('publish_admit', String(admit), '与 BFF 信封一致', admit!==false || blocked || mock),
    metric('阻断却放行', badAdmit?'FAIL':'PASS', '次数必须0', !badAdmit),
    metric('mock 放行', badMock?'FAIL':'PASS', '质量模式必须0', !badMock),
    metric('可见 outcome 数', visible, 'READY 时通常>0；诚实空日可为0', !(readyEmpty&&!honestEmpty)),
    metric('总判定', pass?'PASS':'FAIL', '商用门闩', pass),
  ].join('');
  document.getElementById('detail').textContent = JSON.stringify({
    delivery_state: delivery,
    _publish: pub,
    visible_outcomes: visible,
    staged_chapters: chapters,
    honest_empty: honestEmpty,
    flags: { badAdmit, badMock, readyEmpty, schemaOk }
  }, null, 2);
}
