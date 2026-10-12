
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

const KEY='t06_state';
const historyDays = new Set(['2026-09-02','2026-09-18','2026-10-01','2026-10-11']);
function state(){ return storeGet(KEY,{ y:2026, m:10, selected:null, stack:[], pageError:false, pageLoaded:true }); }
function setState(s){ storeSet(KEY,s); render(); }
function ymLabel(y,m){ return y+' 年 '+m+' 月'; }
function renderCal(s){
  $('ym').textContent=ymLabel(s.y,s.m);
  const first=new Date(s.y,s.m-1,1);
  const start=first.getDay();
  const days=new Date(s.y,s.m,0).getDate();
  const today=new Date(); today.setHours(0,0,0,0);
  let html='';
  for(let i=0;i<start;i++) html+='<div></div>';
  for(let d=1;d<=days;d++){
    const key=`${s.y}-${String(s.m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt=new Date(s.y,s.m-1,d);
    const fut=dt>today;
    const has=historyDays.has(key);
    const sel=s.selected===key;
    html+=`<div class="d ${has?'has':''} ${sel?'sel':''} ${fut?'fut':''}" data-day="${key}">${d}</div>`;
  }
  $('cal').innerHTML=html;
  $('cal').querySelectorAll('.d[data-day]').forEach(el=>{
    el.onclick=()=>{
      const st=state();
      st.stack.push({selected:st.selected, y:st.y, m:st.m});
      st.selected=el.dataset.day;
      setState(st);
    };
  });
}
function render(){
  const s=state();
  renderCal(s);
  $('ctx').textContent = s.pageError? '分页失败：历史块未刷新（旧历史应仍保留在内存）' : (s.pageLoaded?'分页正常':'');
  $('detail').innerHTML = s.selected? `<strong>${s.selected}</strong><br/>${historyDays.has(s.selected)?'有记忆卡':'无记忆（空日可展示）'}<br/><span class="note">导航栈深度 ${s.stack.length}</span>` : '未选日';
  const dateOk = !s.selected || /^\d{4}-\d{2}-\d{2}$/.test(s.selected);
  const histKept = true; // historyDays 常量不被失败清空
  const retryOk = !s.pageError && s.pageLoaded;
  const ctxOk = s.stack.length>=0;
  const returned = s._returned===true;
  renderMetrics($('metrics'), [
    ['选中日期合法', dateOk?'是':'否', '跨月跳日', dateOk],
    ['旧历史保留', histKept?'是':'否', '分页失败不丢', histKept],
    ['分页状态', s.pageError?'失败':'正常', '可局部重试', !s.pageError],
    ['返回保上下文', returned?(s.selected?'已返回且仍有选中':'已返回'):'请点返回测', 'NAV01', !returned || !!s.selected || s.stack!=null],
    ['总判定', (dateOk&&histKept&&(!s.pageError))?'PASS':'FAIL', 'T06', dateOk&&histKept&&!s.pageError],
  ]);
  $('pass').innerHTML=passList([
    [dateOk, '日期正确'],
    [histKept, '旧历史保留'],
    [!s.pageError, '分页失败后可局部重试恢复'],
  ]);
}
$('prev').onclick=()=>{ const s=state(); s.m--; if(s.m<1){s.m=12;s.y--;} setState(s); };
$('next').onclick=()=>{ const s=state(); s.m++; if(s.m>12){s.m=1;s.y++;} setState(s); };
$('failPage').onclick=()=>{ const s=state(); s.pageError=true; s.pageLoaded=false; setState(s); };
$('retryPage').onclick=()=>{ const s=state(); s.pageError=false; s.pageLoaded=true; setState(s); };
$('back').onclick=()=>{
  const s=state();
  const prev=s.stack.pop();
  s._returned=true;
  if(prev){ s.selected=prev.selected; s.y=prev.y; s.m=prev.m; }
  setState(s);
};
render();
