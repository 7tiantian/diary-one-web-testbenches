# -*- coding: utf-8 -*-
"""
09 Cloud processing bench — half-product zip + per-tester Bailian key → Chapters.

PRD §19 / SYS02 note:
  Production App never holds vendor keys. This is a TEAM TEST BENCH only:
  each engineer pastes their own DASHSCOPE_API_KEY for the request; key is
  not written to disk.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
WORK = ROOT / "_work"
WORK.mkdir(exist_ok=True)
STATIC.mkdir(exist_ok=True)

# diary_one_ci on path
ALGO_SRC = Path(
    os.environ.get(
        "DIARY_ONE_ALGO_SRC",
        str(Path(r"E:\AI耳机\diary-one\services\algorithm\algorithm\src")),
    )
).resolve()
if ALGO_SRC.is_dir() and str(ALGO_SRC) not in sys.path:
    sys.path.insert(0, str(ALGO_SRC))

app = FastAPI(title="09 Cloud Processing (Bailian → Chapter)")
app.mount("/assets", StaticFiles(directory=str(STATIC)), name="assets")


def _import_x02():
    from diary_one_ci.x01 import QwenChatCompletionsAdapter
    from diary_one_ci.x02 import run_x02, stage_gateway_for_adapter
    from diary_one_ci.bundle import load_app_library_bundle

    return QwenChatCompletionsAdapter, run_x02, stage_gateway_for_adapter, load_app_library_bundle


def _extract_bundle(zip_path: Path, dest: Path) -> Path:
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest)
    # find bundle.json
    candidates = list(dest.rglob("bundle.json"))
    if not candidates:
        raise FileNotFoundError("zip 内没有 bundle.json — 请用 08 台导出的半成品")
    # prefer shallowest
    candidates.sort(key=lambda p: len(p.parts))
    return candidates[0]


def _public_chapters(result: dict[str, Any]) -> list[dict[str, Any]]:
    chapters = result.get("chapters") or []
    outcomes = result.get("selected_memory_outcomes") or []
    visible_ids = set()
    for o in outcomes:
        if not isinstance(o, dict):
            continue
        if o.get("visibility_state") == "VISIBLE_PREVIEW":
            cid = o.get("chapter_id") or o.get("memory_id") or o.get("id")
            if cid:
                visible_ids.add(cid)
    out = []
    for ch in chapters:
        if not isinstance(ch, dict):
            continue
        cid = ch.get("id") or ch.get("candidate_id")
        status = ch.get("publication_status")
        # Prefer VISIBLE_PREVIEW filter; if outcomes missing, show STAGED chapters
        if visible_ids:
            if cid not in visible_ids:
                continue
        elif status and status != "STAGED_PREVIEW_VALIDATED":
            continue
        out.append({
            "id": cid,
            "title": ch.get("title"),
            "time_label": ch.get("time_label"),
            "story": ch.get("story"),
            "tags": ch.get("tags"),
            "hero_asset_id": ch.get("hero_asset_id"),
            "selected_media": ch.get("selected_media"),
            "evidence_frame_ids": ch.get("evidence_frame_ids"),
            "publication_status": status,
        })
    return out


def _public_ahas(result: dict[str, Any]) -> list[dict[str, Any]]:
    ahas = result.get("ahas") or []
    out = []
    for a in ahas:
        if not isinstance(a, dict):
            continue
        out.append({
            "id": a.get("id"),
            "title": a.get("title"),
            "story": a.get("story") or a.get("text"),
            "tags": a.get("tags"),
        })
    return out


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    return HTMLResponse((STATIC / "index.html").read_text(encoding="utf-8"))


@app.get("/api/health")
def health() -> dict[str, Any]:
    import_ok = False
    err = None
    try:
        _import_x02()
        import_ok = True
    except Exception as e:
        err = str(e)
    return {
        "ok": import_ok,
        "bench": "09_cloud_processing_pipeline",
        "algoSrc": str(ALGO_SRC),
        "diary_one_ci": import_ok,
        "error": err,
        "note": "每人请求自带百炼 Key；Key 不落盘。产品 SYS02 仍要求正式环境密钥只在自有服务。",
    }


@app.post("/api/run")
async def run(
    bundle: UploadFile = File(...),
    dashscope_api_key: str = Form(...),
    day_key: str = Form(""),
) -> JSONResponse:
    key = (dashscope_api_key or "").strip()
    if not key or len(key) < 8:
        return JSONResponse({"ok": False, "error": "请填写有效的百炼 DASHSCOPE_API_KEY"}, status_code=400)

    try:
        QwenChatCompletionsAdapter, run_x02, stage_gateway_for_adapter, load_app_library_bundle = _import_x02()
    except Exception as e:
        return JSONResponse({
            "ok": False,
            "error": f"无法导入 diary_one_ci: {e}",
            "hint": f"设置 DIARY_ONE_ALGO_SRC 或 pip install -e {ALGO_SRC.parent}",
        }, status_code=500)

    run_id = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:8]
    run_dir = WORK / run_id
    run_dir.mkdir(parents=True)
    zip_path = run_dir / "upload.zip"
    zip_path.write_bytes(await bundle.read())

    extract_dir = run_dir / "extracted"
    extract_dir.mkdir()
    t0 = time.perf_counter()

    try:
        manifest_path = _extract_bundle(zip_path, extract_dir)
        # Validate gate (same as production X02 intake)
        load_app_library_bundle(manifest_path)

        day = day_key.strip()
        if not day:
            dk = manifest_path.parent / "day_key.txt"
            day = dk.read_text(encoding="utf-8").strip() if dk.is_file() else datetime.now().strftime("%Y-%m-%d")

        adapter = QwenChatCompletionsAdapter(api_key=key)
        if not adapter.ready:
            return JSONResponse({"ok": False, "error": "Adapter 未就绪（Key 为空）"}, status_code=400)
        gateway = stage_gateway_for_adapter(adapter)

        # Never persist the key
        result = run_x02(manifest_path, gateway)
    except Exception as e:
        tb = traceback.format_exc()
        (run_dir / "error.txt").write_text(tb, encoding="utf-8")
        return JSONResponse({
            "ok": False,
            "runId": run_id,
            "error": str(e),
            "tracebackTail": "\n".join(tb.splitlines()[-20:]),
        }, status_code=500)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    chapters = _public_chapters(result if isinstance(result, dict) else {})
    ahas = _public_ahas(result if isinstance(result, dict) else {})

    # Persist result WITHOUT key
    safe_result_path = run_dir / "x02_result.json"
    try:
        safe_result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    except Exception:
        pass

    delivery = (result or {}).get("delivery_state") if isinstance(result, dict) else None
    report = {
        "ok": True,
        "runId": run_id,
        "dayKey": day,
        "elapsedMs": elapsed_ms,
        "metrics": {
            "chapterCount": len(chapters),
            "ahaCount": len(ahas),
            "delivery_state": delivery,
            "hasSelectedMemoryOutcomes": bool((result or {}).get("selected_memory_outcomes")),
        },
        "chapters": chapters,
        "ahas": ahas,
        "resultKeys": sorted(result.keys()) if isinstance(result, dict) else [],
        "resultPath": str(safe_result_path),
        "sys02Note": "测试台按人持 Key；正式产品 Key 只在自有后端（PRD SYS02）。",
        "next": "把 chapters 导入 02–07 分台做内容质量打分。",
    }
    (run_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # Optional: include compact raw chapters/ahas from full result for debug toggle
    return JSONResponse(report)


@app.get("/api/result/{run_id}")
def get_result(run_id: str) -> JSONResponse:
    safe = Path(run_id).name
    p = WORK / safe / "x02_result.json"
    if not p.is_file():
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
    return JSONResponse(json.loads(p.read_text(encoding="utf-8")))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8809"))
    print(f"[09] Cloud Chapter bench → http://127.0.0.1:{port}")
    print(f"[09] ALGO_SRC={ALGO_SRC}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
