let lastReport = null;

function $(id) { return document.getElementById(id); }

function metric(k, v, t) {
  return `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="t">${t || ""}</div></div>`;
}

$("ping").onclick = async () => {
  const bff = $("bff").value.trim();
  const token = $("token").value.trim();
  $("semStatus").textContent = "探测中…";
  try {
    const u = new URL("/api/ping-bff", location.origin);
    u.searchParams.set("bff_url", bff);
    u.searchParams.set("token", token);
    const r = await fetch(u);
    const j = await r.json();
    const mc = j.mobileclip || {};
    if (j.ok && mc.available) {
      $("semStatus").innerHTML = `<span class="ok">MobileCLIP OK</span> · ${mc.model_id || ""} · ${mc.device || ""} · ${bff}`;
    } else {
      $("semStatus").innerHTML = `<span class="bad">不可用</span> · ${JSON.stringify(mc.reason || j.error || j.body || j)}`;
    }
  } catch (e) {
    $("semStatus").innerHTML = `<span class="bad">${e}</span>`;
  }
};

$("run").onclick = async () => {
  const files = $("files").files;
  if (!files.length) {
    alert("请选择照片/视频");
    return;
  }
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  fd.append("bff_url", $("bff").value.trim());
  fd.append("token", $("token").value.trim());
  fd.append("day_key", $("dayKey").value.trim());
  fd.append("skip_ledger_dupes", $("skipLedger").checked ? "1" : "0");
  $("run").disabled = true;
  $("log").textContent = "处理中（去重 → 探针 → MobileCLIP → 选帧）…";
  try {
    const r = await fetch("/api/process", { method: "POST", body: fd });
    const j = await r.json();
    lastReport = j;
    $("log").textContent = JSON.stringify(j, null, 2);
    if (!j.ok) {
      const d = j.dedupe || {};
      $("rows").innerHTML = `<span class="bad">${j.error || "失败"}</span>
        <p class="note">去重跳过：会话 ${d.skippedSessionDupes ?? 0} · 账本 ${d.skippedLedgerDupes ?? 0}</p>`;
      return;
    }
    const m = j.metrics || {};
    const d = j.dedupe || {};
    $("metricGrid").innerHTML = [
      metric("去重后保留", `${d.uniqueCount ?? m.okCount}/${d.inputCount ?? "—"}`, `跳过 ${m.dedupedAway ?? 0}`),
      metric("会话重复", d.skippedSessionDupes ?? 0, "同批 sha256"),
      metric("账本重复", d.skippedLedgerDupes ?? 0, "历史已见"),
      metric("MobileCLIP", m.mobileclipUsed ? "是" : "否", (m.modelIds || []).join(", ") || "—"),
      metric("打包帧数", m.totalPackedFrames, "进 V04 zip"),
      metric("门控 1/3/5/10", `${m.routeHistogram?.["1"] ?? 0}/${m.routeHistogram?.["3"] ?? 0}/${m.routeHistogram?.["5"] ?? 0}/${m.routeHistogram?.["10"] ?? 0}`, `${j.elapsedMs} ms`),
    ].join("");

    const skipRows = (d.skipped || []).map((s) =>
      `<tr><td class="note">${s.fileName || "—"}</td><td colspan="4" class="bad">去重跳过 · ${s.reason}<br/><span class="note">${(s.originalSha256 || "").slice(0, 16)}…</span></td></tr>`
    ).join("");
    const rows = (j.assets || []).map((a) => {
      if (!a.ok) return `<tr><td>${a.assetId}</td><td colspan="4" class="bad">${a.error || "fail"}</td></tr>`;
      const g = a.gate || {};
      return `<tr>
        <td>${a.assetId}<br/><span class="note">${a.kind} · ${(a.originalSha256 || "").slice(0, 10)}…</span></td>
        <td>${a.probeCount ?? "—"}</td>
        <td><strong>${g.targetFrameCount ?? "—"}</strong><br/><span class="note">${(g.reasonCodes || []).join(", ")}</span></td>
        <td>${(a.semanticTimesMs || []).join(", ") || "—"}</td>
        <td>${a.x02Envelope?.evidence_sampling_profile || "—"} → ${a.packedCount} 帧</td>
      </tr>`;
    }).join("");
    $("rows").innerHTML = `<table>
      <thead><tr><th>资产</th><th>探针</th><th>门控 1/3/5/10</th><th>语义时间戳 ms</th><th>X02 信封</th></tr></thead>
      <tbody>${skipRows}${rows}</tbody></table>`;

    $("dl").style.display = "inline-block";
    $("dl").href = j.downloadUrl;
    $("export").disabled = false;
  } catch (e) {
    $("log").textContent = String(e);
  } finally {
    $("run").disabled = false;
  }
};

$("export").onclick = () => {
  if (!lastReport) return;
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `08_report_${lastReport.runId || "run"}.json`;
  a.click();
};
