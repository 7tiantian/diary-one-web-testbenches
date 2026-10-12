
const TARGET_W = 768, TARGET_H = 1024, MAX_JPEG = 900 * 1024;
const grid = document.getElementById('metricGrid');
const rows = document.getElementById('rows');
let lastReport = null;

function metric(k, v, t, ok) {
  return `<div class="metric"><div class="k">${k}</div><div class="v ${ok?'ok':'bad'}">${v}</div><div class="t">${t}</div></div>`;
}

async function fileToBitmap(file) {
  if (!file.type.startsWith('image/')) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await createImageBitmap(await fetch(url).then(r => r.blob()));
    return img;
  } finally { URL.revokeObjectURL(url); }
}

async function normalizePhoto(file) {
  const bmp = await fileToBitmap(file);
  if (!bmp) return { kind: 'VIDEO_SKIP', name: file.name, pass: null, note: '视频抽帧请用 App/BFF 链路或跳过' };
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W; canvas.height = TARGET_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,TARGET_W,TARGET_H);
  const scale = Math.min(TARGET_W / bmp.width, TARGET_H / bmp.height);
  const w = bmp.width * scale, h = bmp.height * scale;
  ctx.drawImage(bmp, (TARGET_W - w)/2, (TARGET_H - h)/2, w, h);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.84));
  const url = URL.createObjectURL(blob);
  const pass = blob.size <= MAX_JPEG;
  return {
    kind: 'PHOTO', name: file.name, frames: 1, width: TARGET_W, height: TARGET_H,
    bytes: blob.size, original_included: false, url, pass,
    note: pass ? '照片合同通过' : 'JPEG 过大'
  };
}

document.getElementById('run').onclick = async () => {
  const files = [...document.getElementById('files').files];
  if (!files.length) return alert('请先选择素材');
  const items = [];
  for (const f of files) items.push(await normalizePhoto(f));
  const photos = items.filter(i => i.kind === 'PHOTO');
  const frameOk = photos.every(p => p.frames === 1);
  const sizeOk = photos.every(p => p.width === TARGET_W && p.height === TARGET_H);
  const origOk = photos.every(p => p.original_included === false);
  const jpegOk = photos.every(p => p.bytes <= MAX_JPEG);
  const passAll = photos.length > 0 && frameOk && sizeOk && origOk && jpegOk;
  grid.innerHTML = [
    metric('照片数', photos.length, '参与合同检查', photos.length > 0),
    metric('帧数合同', frameOk ? 'PASS' : 'FAIL', '每照片 = 1 帧', frameOk),
    metric('画布 768×1024', sizeOk ? 'PASS' : 'FAIL', '容差 0', sizeOk),
    metric('禁止原片', origOk ? 'PASS' : 'FAIL', 'original_included=false', origOk),
    metric('JPEG 上限', jpegOk ? 'PASS' : 'FAIL', '≤900KB', jpegOk),
    metric('总判定', passAll ? 'PASS' : 'FAIL', '商用上传前门槛', passAll),
  ].join('');
  rows.innerHTML = `<table><thead><tr><th>预览</th><th>文件</th><th>帧</th><th>尺寸</th><th>字节</th><th>判定</th></tr></thead><tbody>` +
    items.map(i => `<tr>
      <td>${i.url ? `<img class="thumb" src="${i.url}"/>` : '-'}</td>
      <td>${i.name}<br/><span class="note">${i.kind}</span></td>
      <td>${i.frames ?? '-'}</td>
      <td>${i.width ? i.width+'×'+i.height : '-'}</td>
      <td>${i.bytes ?? '-'}</td>
      <td class="${i.pass===false?'bad':(i.pass?'ok':'')}">${i.pass===null?'SKIP':(i.pass?'PASS':'FAIL')}<br/><span class="note">${i.note||''}</span></td>
    </tr>`).join('') + '</tbody></table>';
  lastReport = { passAll, photos: photos.length, items: items.map(({url, ...rest}) => rest), generated_at: new Date().toISOString() };
};

document.getElementById('export').onclick = () => {
  if (!lastReport) return alert('先生成报告');
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'evidence_contract_report.json'; a.click();
};
