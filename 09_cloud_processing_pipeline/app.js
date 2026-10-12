
let report = null;
let health = null;

function metric(k,v,t,ok){
  return `<div class="metric"><div class="k">${k}</div><div class="v ${ok?'ok':'bad'}">${v}</div><div class="t">${t}</div></div>`;
}
function baseUrl(){ return (document.getElementById('base').value||'').replace(/\/+$/,''); }
function authHeaders(){
  const t = (document.getElementById('token').value||'').trim();
  return t ? { Authorization: 'Bearer ' + t } : {};
}
function log(msg){
  const el = document.getElementById('jobLog');
  el.innerHTML = (el.innerHTML + '<br/>' + msg).replace(/^<br\/>/, '');
}
function analyzeResult(data, meta={}){
  const result = data.result || data;
  const delivery = result.delivery_state || data.publish?.delivery_state || '';
  const pub = result._publish || data.publish || {};
  const admit = pub.publish_admit;
  const mock = !!result.dev_lite_fallback;
  const quality = document.getElementById('quality').checked;
  const chapters = (result.chapters||[]).filter(c=>!c.publication_status || c.publication_status==='STAGED_PREVIEW_VALIDATED');
  const ahas = (result.ahas||[]).filter(a=>!a.publication_status || a.publication_status==='STAGED_PREVIEW_VALIDATED');
  const blocked = delivery === 'PIPELINE_BLOCKED';
  const badAdmit = blocked && admit === true;
  const badMock = quality && mock;
  const healthOk = health?.status === 'ok' || health?.status === 'OK' || !!health;
  const mockFlag = health?.allow_mock_preview;
  const x02 = health?.x02?.reachable;
  const pass = !badAdmit && !badMock && !!delivery;

  document.getElementById('metricGrid').innerHTML = [
    metric('health', healthOk?'ok':'—', 'BFF 可达', healthOk!==false),
    metric('mock 开关', String(mockFlag), quality?'质量模式必须 false':'联调可 true', quality ? mockFlag===false : true),
    metric('x02.reachable', String(x02), '真算法', x02===true || !quality),
    metric('delivery_state', delivery||'缺失', '必有', !!delivery),
    metric('publish_admit', String(admit), '阻断不得 true', !badAdmit),
    metric('mock_fallback', mock?'yes':'no', quality?'禁止':'可标注', !badMock),
    metric('可见 Chapter', chapters.length, '规模观察', true),
    metric('可见 Aha', ahas.length, '0–3 观察', ahas.length<=3),
    metric('轮询耗时秒', meta.elapsed_s ?? '—', '只记录', true),
    metric('云端门闩', pass?'PASS':'FAIL', '可交内容分台', pass),
  ].join('');

  document.getElementById('resultBox').value = JSON.stringify(result, null, 2);
  report = {
    bench: '09_cloud_processing_pipeline',
    health, meta, delivery_state: delivery, publish: pub,
    counts: { chapters: chapters.length, ahas: ahas.length },
    pass, badAdmit, badMock,
    generated_at: new Date().toISOString(),
  };
}

document.getElementById('ping').onclick = async ()=>{
  try {
    const r = await fetch(baseUrl() + '/health');
    health = await r.json();
    document.getElementById('healthOut').textContent = JSON.stringify(health, null, 2);
    analyzeResult({ result: { delivery_state: '—', chapters:[], ahas:[], _publish:{} } });
  } catch(e){
    document.getElementById('healthOut').textContent = 'Ping 失败: ' + e.message + '\\n请确认 BFF 已启动且允许 CORS。';
  }
};

document.getElementById('submit').onclick = async ()=>{
  const files = [...document.getElementById('frames').files];
  if (!files.length) return alert('请选择至少 1 张证据图');
  if (!health) {
    try { await document.getElementById('ping').onclick(); } catch {}
  }
  const rev = (document.getElementById('rev').value||'').trim() || ('dayrev_webbench_' + Date.now());
  const assets = files.map((f,i)=>({
    asset_id: 'asset-'+i,
    media_kind: 'PHOTO',
    original_included: false,
    sequence_index: i,
    logical_asset_duration_ms: 9000,
    evidence_sampling_profile: 'PHOTO_SINGLE_FRAME',
    evidence_window_count: 1,
    frames: [{ frame_id: 'asset-'+i+'-f0', window_index:0, window_count:1, sample_role:'PHOTO_REPRESENTATIVE' }]
  }));
  const manifest = {
    bundle_version: 'V04',
    session: { session_id: 'webbench-cloud-'+Date.now(), timezone: 'TEST_DAY_NO_TIMEZONE' },
    assets,
  };
  const form = new FormData();
  form.append('manifest', new Blob([JSON.stringify(manifest)], {type:'application/json'}), 'bundle.json');
  form.append('day_revision_id', rev);
  files.forEach((f,i)=> form.append('asset-'+i+'-f0', f, f.name));

  document.getElementById('jobLog').textContent = '';
  log('提交 day_revision=' + rev + ' · frames=' + files.length);
  const t0 = performance.now();
  let created;
  try {
    const r = await fetch(baseUrl() + '/v1/day-revisions', {
      method: 'POST', headers: { ...authHeaders(), Accept:'application/json' }, body: form,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(r.status + ' ' + text.slice(0,400));
    created = JSON.parse(text);
  } catch(e){
    log('<span class="bad">提交失败: ' + e.message + '</span>');
    return;
  }
  log('创建响应: ' + JSON.stringify(created));
  const jobId = created.job_id;
  if (!jobId) return;

  for (let i=0;i<180;i++){
    await new Promise(r=>setTimeout(r,1500));
    let body;
    try {
      const r = await fetch(baseUrl() + '/v1/jobs/' + encodeURIComponent(jobId), {
        headers: { ...authHeaders(), Accept:'application/json' }
      });
      body = await r.json();
    } catch(e){
      log('轮询错误: ' + e.message); continue;
    }
    log(`[${i+1}] status=${body.status} · ${body.message||''}`);
    if (body.status === 'succeeded' || body.status === 'failed') {
      const elapsed_s = ((performance.now()-t0)/1000).toFixed(1);
      analyzeResult(body, { job_id: jobId, day_revision_id: rev, elapsed_s, idempotent: !!created.idempotent });
      log(body.status === 'succeeded' ? '<span class="ok">完成</span>' : '<span class="bad">失败</span>');
      return;
    }
  }
  log('<span class="bad">轮询超时</span>');
};

document.getElementById('analyzePaste').onclick = ()=>{
  try {
    const data = JSON.parse(document.getElementById('resultBox').value);
    analyzeResult(data.result ? data : { result: data });
  } catch(e){ alert('JSON 无效: '+e.message); }
};

document.getElementById('export').onclick = ()=>{
  if (!report) return alert('先跑完任务或分析 JSON');
  const blob = new Blob([JSON.stringify(report,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cloud_processing_report.json';
  a.click();
};
