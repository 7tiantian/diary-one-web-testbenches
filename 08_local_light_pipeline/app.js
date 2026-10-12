
const TW = 768, TH = 1024, MAX_JPEG = 900 * 1024;
let report = null;

function metric(k,v,t,ok){
  return `<div class="metric"><div class="k">${k}</div><div class="v ${ok?'ok':'bad'}">${v}</div><div class="t">${t}</div></div>`;
}
function videoFramesByDuration(ms){
  if (ms <= 10000) return { windows:1, frames:3, profile:'VIDEO_SINGLE_WINDOW_THREE' };
  if (ms <= 30000) return { windows:2, frames:4, profile:'VIDEO_MULTI_WINDOW_TWO_PER_WINDOW' };
  if (ms <= 90000) return { windows:4, frames:8, profile:'VIDEO_MULTI_WINDOW_TWO_PER_WINDOW' };
  return { windows:6, frames:12, profile:'VIDEO_MULTI_WINDOW_TWO_PER_WINDOW' };
}
async function sha256Hex(buf){
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function normalizePhoto(file){
  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,TW,TH);
  const scale = Math.min(TW/bmp.width, TH/bmp.height);
  const w = bmp.width*scale, h = bmp.height*scale;
  ctx.drawImage(bmp,(TW-w)/2,(TH-h)/2,w,h);
  const blob = await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.84));
  const url = URL.createObjectURL(blob);
  return {
    media_kind:'PHOTO', name:file.name, sha256:sha.slice(0,16),
    frames:1, width:TW, height:TH, bytes:blob.size,
    original_included:false, profile:'PHOTO_SINGLE_FRAME', url,
    pass: blob.size<=MAX_JPEG
  };
}
async function inspectVideo(file){
  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const url = URL.createObjectURL(file);
  const dur = await new Promise((resolve)=>{
    const v = document.createElement('video');
    v.preload = 'metadata'; v.src = url;
    v.onloadedmetadata = () => resolve(Math.max(1000, Math.round((v.duration||1)*1000)));
    v.onerror = () => resolve(9000);
  });
  URL.revokeObjectURL(url);
  const plan = videoFramesByDuration(dur);
  return {
    media_kind:'VIDEO', name:file.name, sha256:sha.slice(0,16),
    duration_ms: dur, frames: plan.frames, windows: plan.windows,
    width: TW, height: TH, bytes: null, original_included:false,
    profile: plan.profile, url:null, pass:true,
    note: '浏览器台给出档位合同；真机帧由 App/BFF 抽出'
  };
}

document.getElementById('pingSem').onclick = async ()=>{
  const base = (document.getElementById('bff').value||'').replace(/\/+$/,'');
  const token = (document.getElementById('token').value||'dev-token').trim();
  const el = document.getElementById('semStatus');
  if (!base) { el.textContent = '语义服务：未填 BFF'; return; }
  try {
    const r = await fetch(base + '/health');
    const j = await r.json();
    const mc = j.mobileclip || j.mobileclip_status || {};
    const ready = mc.ready === true || mc.status === 'ready' || String(JSON.stringify(mc)).includes('yes');
    el.textContent = `语义服务：health=${r.ok?'ok':'fail'} · mock=${j.allow_mock_preview} · mobileclip≈${ready?'可用':'不可用/退化'} · x02=${j.x02?.reachable??j.x02?.reachable}`;
    el.dataset.token = token;
  } catch(e){
    el.textContent = '语义服务：探测失败 ' + e.message;
  }
};

document.getElementById('run').onclick = async ()=>{
  const files = [...document.getElementById('files').files];
  if (!files.length) return alert('请先选择素材');
  const steps = [];
  const push = (name, ok, detail) => steps.push({name, ok, detail});

  push('主动选入', true, `本批 ${files.length} 个文件（模拟 PHOTO_LIBRARY_TEST，不扫全库）`);

  const items = [];
  const seen = new Set();
  let dup = 0;
  for (const f of files){
    if (f.type.startsWith('image/')) {
      const it = await normalizePhoto(f);
      if (seen.has(it.sha256)) { dup++; it.pass = false; it.note = '疑似重复 sha'; }
      seen.add(it.sha256);
      items.push(it);
    } else if (f.type.startsWith('video/')) {
      items.push(await inspectVideo(f));
    }
  }
  push('去重身份', dup===0, dup===0?`唯一 sha ${seen.size}`:`重复 ${dup} 组`);

  const photos = items.filter(i=>i.media_kind==='PHOTO');
  const videos = items.filter(i=>i.media_kind==='VIDEO');
  const frameOk = photos.every(p=>p.frames===1);
  const canvasOk = photos.every(p=>p.width===TW && p.height===TH);
  const origOk = items.every(i=>i.original_included===false);
  const jpegOk = photos.every(p=>p.bytes<=MAX_JPEG);
  push('照片 Evidence', frameOk&&canvasOk&&jpegOk, `照片 ${photos.length} · 帧/画布/体积`);
  push('视频档位', videos.every(v=>v.frames>=3), `视频 ${videos.length} · 按时长合同`);
  push('禁止原片', origOk, 'original_included=false');

  const bundle = {
    bundle_version: 'V04',
    session_id: 'webbench-' + Date.now(),
    assets: items.map((it, idx)=>({
      asset_id: 'asset-'+idx,
      media_kind: it.media_kind,
      original_sha256_prefix: it.sha256,
      original_included: false,
      evidence_sampling_profile: it.profile,
      evidence_window_count: it.windows || 1,
      evidence_frame_count: it.frames,
      logical_asset_duration_ms: it.duration_ms || 9000,
    }))
  };
  const fieldsOk = !!(bundle.bundle_version && bundle.session_id && bundle.assets.length);
  push('Bundle V04 清单', fieldsOk, `assets=${bundle.assets.length}`);

  const gate = frameOk && canvasOk && origOk && jpegOk && fieldsOk && photos.length>0;
  push('可交云端门闩', gate, gate?'PASS：可交给 09 云端台':'FAIL：先修本地轻处理');

  document.getElementById('stepList').innerHTML = `<table><thead><tr><th>步骤</th><th>结果</th><th>说明</th></tr></thead><tbody>` +
    steps.map(s=>`<tr><td>${s.name}</td><td class="${s.ok?'ok':'bad'}">${s.ok?'PASS':'FAIL'}</td><td>${s.detail}</td></tr>`).join('') +
    `</tbody></table>`;

  document.getElementById('metricGrid').innerHTML = [
    metric('素材数', items.length, `图${photos.length}/视${videos.length}`, items.length>0),
    metric('照片帧合同', frameOk?'PASS':'FAIL', '=1', frameOk),
    metric('画布', canvasOk?'PASS':'FAIL', '768×1024', canvasOk),
    metric('禁原片', origOk?'PASS':'FAIL', 'PRI02', origOk),
    metric('JPEG≤900KB', jpegOk?'PASS':'FAIL', '照片', jpegOk),
    metric('可交云端', gate?'YES':'NO', '给 09 台的门闩', gate),
  ].join('');

  document.getElementById('rows').innerHTML = `<table><thead><tr><th>预览</th><th>文件</th><th>类型</th><th>帧/窗</th><th>profile</th><th>判定</th></tr></thead><tbody>` +
    items.map(i=>`<tr>
      <td>${i.url?`<img class="thumb" src="${i.url}"/>`:'视频档位'}</td>
      <td>${i.name}<br/><span class="note">sha ${i.sha256}</span></td>
      <td>${i.media_kind}</td>
      <td>${i.frames}${i.windows?` / ${i.windows}窗`:''}${i.duration_ms?`<br/><span class="note">${(i.duration_ms/1000).toFixed(1)}s</span>`:''}</td>
      <td class="note">${i.profile}</td>
      <td class="${i.pass?'ok':'bad'}">${i.pass?'PASS':'FAIL'} ${i.note||''}</td>
    </tr>`).join('') + `</tbody></table>`;

  report = {
    bench: '08_local_light_pipeline',
    gate_to_cloud: gate,
    steps, bundle,
    counts: { photos: photos.length, videos: videos.length, dup },
    generated_at: new Date().toISOString(),
  };
};

document.getElementById('export').onclick = ()=>{
  if (!report) return alert('先跑本地轻处理');
  const blob = new Blob([JSON.stringify(report,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'local_light_report.json';
  a.click();
};
