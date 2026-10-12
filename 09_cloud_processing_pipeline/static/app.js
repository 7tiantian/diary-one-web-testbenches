let lastReport = null;

function $(id) { return document.getElementById(id); }

function metric(k, v, t) {
  return `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="t">${t || ""}</div></div>`;
}

$("run").onclick = async () => {
  const file = $("bundle").files[0];
  const key = $("key").value.trim();
  if (!file) { alert("请上传 08 半成品 zip"); return; }
  if (!key) { alert("请填写你的百炼 DASHSCOPE_API_KEY"); return; }

  const fd = new FormData();
  fd.append("bundle", file);
  fd.append("dashscope_api_key", key);
  fd.append("day_key", $("dayKey").value.trim());

  $("run").disabled = true;
  $("status").textContent = "X02 运行中（S04–S12，可能数分钟）…";
  $("log").textContent = "";
  try {
    const r = await fetch("/api/run", { method: "POST", body: fd });
    const j = await r.json();
    lastReport = j;
    $("log").textContent = JSON.stringify(j, null, 2);
    if (!j.ok) {
      $("status").innerHTML = `<span class="bad">${j.error || "失败"}</span>`;
      $("chapterList").innerHTML = `<pre class="note">${j.tracebackTail || ""}</pre>`;
      return;
    }
    const m = j.metrics || {};
    $("status").innerHTML = `<span class="ok">完成</span> · ${j.elapsedMs} ms · day ${j.dayKey}`;
    $("metricGrid").innerHTML = [
      metric("Chapters", m.chapterCount ?? 0, "可见预览"),
      metric("Ahas", m.ahaCount ?? 0, "小记忆"),
      metric("耗时", `${Math.round((j.elapsedMs || 0) / 1000)}s`, "含模型调用"),
    ].join("");

    const chs = j.chapters || [];
    if (!chs.length) {
      $("chapterList").innerHTML = `<span class="bad">0 个 Chapter</span> — 检查 delivery / outcomes`;
    } else {
      $("chapterList").innerHTML = chs.map((c, i) => `
        <article class="chapter">
          <h3>${i + 1}. ${escapeHtml(c.title || "(无标题)")}</h3>
          <div class="meta">${escapeHtml(c.time_label || "")} · ${escapeHtml(c.id || "")}</div>
          <div class="story">${escapeHtml(c.story || "")}</div>
          <div class="meta" style="margin-top:8px">tags: ${(c.tags || []).map(escapeHtml).join(", ") || "—"}</div>
        </article>`).join("");
    }

    const ahas = j.ahas || [];
    $("ahaList").innerHTML = ahas.length
      ? ahas.map((a) => `<div class="chapter"><h3>${escapeHtml(a.title || "Aha")}</h3><div class="story">${escapeHtml(a.story || "")}</div></div>`).join("")
      : "无 Aha / 未选出";
    $("export").disabled = false;
  } catch (e) {
    $("status").innerHTML = `<span class="bad">${e}</span>`;
  } finally {
    $("run").disabled = false;
  }
};

$("export").onclick = () => {
  if (!lastReport) return;
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `09_chapters_${lastReport.runId || "run"}.json`;
  a.click();
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
