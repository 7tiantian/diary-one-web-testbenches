# -*- coding: utf-8 -*-
"""
08 Local light pipeline — MobileCLIP probes → 1/3/5/10 → V04 half-product zip.

True path (WINDOWS_MOBILECLIP_BFF + App):
  video → ffmpeg 1fps probes
       → BFF POST /v1/evidence/semantic-analyze (probe_0..) MobileCLIP 512-d
       → gate 1/3/5/10
       → extract selected frames → letterbox 768×1024
       → App Library Bundle V04 (duration-window envelope for X02 gate)
       → zip for bench 09 (+ semantic_route sidecar)
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from dedupe import dedupe_inbox, load_ledger, remember_sha, save_ledger
from router_gate import (
    apply_gate,
    diversify_indices,
    duration_evidence_profile,
    map_to_duration_slots,
    sample_role,
)

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
WORK = ROOT / "_work"
WORK.mkdir(exist_ok=True)
STATIC.mkdir(exist_ok=True)
LEDGER_PATH = WORK / "raw_asset_ledger.json"

DEFAULT_BFF = os.environ.get("DIARY_ONE_BFF_BASE_URL", "http://127.0.0.1:8790").rstrip("/")
DEFAULT_TOKEN = os.environ.get("DIARY_ONE_DEV_TOKEN", "dev-token")
PROBE_STEP_MS = 1000
TARGET_W, TARGET_H = 768, 1024
FIT = "ASPECT_FIT_LETTERBOX"
BUNDLE_V04 = "DIARY_ONE_APP_LIBRARY_BUNDLE_V04"

app = FastAPI(title="08 Local Light Pipeline (MobileCLIP)")
app.mount("/assets", StaticFiles(directory=str(STATIC)), name="assets")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _ffprobe_duration_ms(path: Path) -> int:
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path),
            ],
            capture_output=True, text=True, timeout=60, check=False,
        )
        return max(0, int(float((r.stdout or "0").strip()) * 1000))
    except Exception:
        return 0


def _ffmpeg_extract_frame(video: Path, out: Path, time_ms: int) -> bool:
    out.parent.mkdir(parents=True, exist_ok=True)
    ss = max(0.0, time_ms / 1000.0)
    r = subprocess.run(
        [
            "ffmpeg", "-y", "-ss", f"{ss:.3f}", "-i", str(video),
            "-frames:v", "1", "-q:v", "2", str(out),
        ],
        capture_output=True, text=True, timeout=120, check=False,
    )
    return r.returncode == 0 and out.is_file() and out.stat().st_size > 0


def _letterbox(src: Path, dst: Path) -> bool:
    dst.parent.mkdir(parents=True, exist_ok=True)
    vf = (
        f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=decrease,"
        f"pad={TARGET_W}:{TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black"
    )
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-vf", vf, "-q:v", "2", str(dst)],
        capture_output=True, text=True, timeout=120, check=False,
    )
    return r.returncode == 0 and dst.is_file()


def _bff_analyze_batch(
    client: httpx.Client,
    bff: str,
    token: str,
    probe_paths: list[Path],
) -> dict[str, Any]:
    """Batch MobileCLIP like App remoteSemanticAnalyzer (probe_0, probe_1, …)."""
    files = []
    handles = []
    try:
        for i, p in enumerate(probe_paths):
            fh = p.open("rb")
            handles.append(fh)
            files.append((f"probe_{i}", (p.name, fh, "image/jpeg")))
        r = client.post(
            f"{bff}/v1/evidence/semantic-analyze",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        for fh in handles:
            fh.close()
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:400]}
    if r.status_code >= 400:
        detail = body.get("detail") if isinstance(body, dict) else body
        raise RuntimeError(f"BFF semantic-analyze {r.status_code}: {detail}")
    return body


def _process_video(
    client: httpx.Client,
    bff: str,
    token: str,
    video_path: Path,
    asset_id: str,
    work_dir: Path,
) -> dict[str, Any]:
    duration_ms = _ffprobe_duration_ms(video_path)
    if duration_ms <= 0:
        duration_ms = 3000
    duration_ms = min(duration_ms, 120_000)

    times = list(range(0, max(duration_ms, 1), PROBE_STEP_MS))
    if not times or times[-1] < duration_ms - 200:
        times.append(max(0, duration_ms - 100))
    if len(times) > 60:
        times = [times[int(i * (len(times) - 1) / 59)] for i in range(60)]

    probe_dir = work_dir / f"probes_{asset_id}"
    probe_dir.mkdir(parents=True, exist_ok=True)
    probe_paths: list[Path] = []
    probe_times: list[int] = []
    for i, t_ms in enumerate(times):
        p_path = probe_dir / f"probe_{i:03d}.jpg"
        if _ffmpeg_extract_frame(video_path, p_path, t_ms):
            probe_paths.append(p_path)
            probe_times.append(t_ms)

    if not probe_paths:
        return {"ok": False, "assetId": asset_id, "error": "ffmpeg 探针抽帧失败"}

    try:
        resp = _bff_analyze_batch(client, bff, token, probe_paths)
    except Exception as e:
        return {"ok": False, "assetId": asset_id, "error": str(e)}

    results = resp.get("results") or []
    if len(results) != len(probe_paths):
        return {
            "ok": False,
            "assetId": asset_id,
            "error": f"BFF 返回 {len(results)} 条向量，探针 {len(probe_paths)} 张",
            "bffKeys": list(resp.keys()) if isinstance(resp, dict) else [],
        }

    vectors: list[list[float]] = []
    for row in results:
        vec = row.get("vector") or []
        if not isinstance(vec, list) or len(vec) < 8:
            return {"ok": False, "assetId": asset_id, "error": "空向量 — MobileCLIP 未就绪？"}
        vectors.append([float(x) for x in vec])

    model_id = str(resp.get("modelId") or "")
    backend = str(resp.get("backend") or "")
    gate = apply_gate(vectors)
    k = int(gate["targetFrameCount"])
    indices = diversify_indices(vectors, k)
    semantic_times = [probe_times[i] for i in indices]

    # Materialize semantic-selected frames (audit truth)
    selected_dir = work_dir / "semantic_selected" / asset_id
    selected_dir.mkdir(parents=True, exist_ok=True)
    semantic_frames_meta = []
    for rank, idx in enumerate(indices):
        t_ms = probe_times[idx]
        raw = selected_dir / f"raw_{rank:02d}.jpg"
        final = selected_dir / f"sel_{rank:02d}.jpg"
        src_probe = probe_paths[idx]
        shutil.copy2(src_probe, raw)
        if not _letterbox(raw, final):
            shutil.copy2(raw, final)
        role = sample_role(rank, len(indices))
        semantic_frames_meta.append({
            "rank": rank,
            "probeIndex": idx,
            "timeMs": t_ms,
            "role": role,
            "path": str(final),
        })

    # Map into X02 duration-window slots (contract envelope)
    win_count, frame_count, profile = duration_evidence_profile(duration_ms)
    slot_times = map_to_duration_slots(semantic_times, duration_ms, frame_count)

    pack_dir = work_dir / "pack_frames"
    pack_dir.mkdir(parents=True, exist_ok=True)
    packed = []
    for fi, t_ms in enumerate(slot_times):
        # Prefer nearest semantic frame file; else re-extract
        nearest = min(semantic_frames_meta, key=lambda m: abs(m["timeMs"] - t_ms)) if semantic_frames_meta else None
        dest = pack_dir / f"{asset_id}_{fi}.jpg"
        if nearest and abs(nearest["timeMs"] - t_ms) <= 500 and Path(nearest["path"]).is_file():
            shutil.copy2(nearest["path"], dest)
        else:
            raw = pack_dir / f"{asset_id}_{fi}_raw.jpg"
            _ffmpeg_extract_frame(video_path, raw, t_ms)
            if not _letterbox(raw, dest):
                if nearest and Path(nearest["path"]).is_file():
                    shutil.copy2(nearest["path"], dest)
                else:
                    return {"ok": False, "assetId": asset_id, "error": f"slot frame {fi} failed"}
            raw.unlink(missing_ok=True)
        packed.append({"index": fi, "timeMs": t_ms, "path": str(dest)})

    shutil.rmtree(probe_dir, ignore_errors=True)

    return {
        "ok": True,
        "assetId": asset_id,
        "kind": "VIDEO",
        "sourcePath": str(video_path),
        "durationMs": duration_ms,
        "probeCount": len(vectors),
        "modelId": model_id,
        "backend": backend,
        "mobileclipPath": "mobileclip" in backend.lower() or "MOBILECLIP" in model_id,
        "gate": gate,
        "semanticTimesMs": semantic_times,
        "semanticFrames": semantic_frames_meta,
        "x02Envelope": {
            "evidence_window_count": win_count,
            "evidence_sampling_profile": profile,
            "expectedFrames": frame_count,
            "slotTimesMs": slot_times,
            "note": "X02 V04 gate 仍要求时长档位帧数；像素内容优先来自 MobileCLIP 选帧",
        },
        "packedFrames": packed,
        "originalBytes": video_path.stat().st_size,
        "originalSha": sha256_file(video_path),
        "originalExt": video_path.suffix.lstrip(".").lower() or "mp4",
    }


def _process_photo(photo_path: Path, asset_id: str, work_dir: Path) -> dict[str, Any]:
    pack_dir = work_dir / "pack_frames"
    pack_dir.mkdir(parents=True, exist_ok=True)
    dest = pack_dir / f"{asset_id}_0.jpg"
    if not _letterbox(photo_path, dest):
        shutil.copy2(photo_path, dest)
    return {
        "ok": True,
        "assetId": asset_id,
        "kind": "PHOTO",
        "sourcePath": str(photo_path),
        "durationMs": None,
        "probeCount": 1,
        "modelId": None,
        "backend": "photo_passthrough",
        "mobileclipPath": False,
        "gate": {
            "targetFrameCount": 1,
            "reasonCodes": ["PHOTO_SELECT_FRAME_1"],
            "meanAdjacentSimilarity": 1.0,
            "transitionCount": 0,
            "sceneCount": 1,
            "gateApplied": True,
            "profileId": "PHOTO",
        },
        "semanticTimesMs": [0],
        "x02Envelope": {
            "evidence_window_count": 1,
            "evidence_sampling_profile": "PHOTO_SINGLE_FRAME",
            "expectedFrames": 1,
            "slotTimesMs": [0],
        },
        "packedFrames": [{"index": 0, "timeMs": 0, "path": str(dest)}],
        "originalBytes": photo_path.stat().st_size,
        "originalSha": sha256_file(photo_path),
        "originalExt": photo_path.suffix.lstrip(".").lower() or "jpg",
    }


def _build_v04_bundle(run_dir: Path, assets: list[dict[str, Any]], day_key: str) -> Path:
    """Write App Library Bundle V04 + semantic sidecar + zip."""
    bundle_root = run_dir / "bundle"
    frames_dir = bundle_root / "frames"
    if bundle_root.exists():
        shutil.rmtree(bundle_root)
    frames_dir.mkdir(parents=True)

    session_id = str(uuid.uuid4())
    bundle_assets: list[dict[str, Any]] = []
    semantic_audit: list[dict[str, Any]] = []

    for a in assets:
        if not a.get("ok"):
            continue
        aid = a["asset_id"] if "asset_id" in a else a["assetId"]
        kind = a["kind"]
        env = a["x02Envelope"]
        frames_meta = []
        packed = a["packedFrames"]
        win_count = int(env["evidence_window_count"])
        profile = env["evidence_sampling_profile"]

        for fi, pf in enumerate(packed):
            rel = f"frames/{aid}_{fi}.jpg"
            dest = bundle_root / rel
            shutil.copy2(pf["path"], dest)
            if kind == "PHOTO":
                frames_meta.append({
                    "frame_id": f"{aid}-f0",
                    "window_index": 0,
                    "window_count": 1,
                    "sample_role": "PHOTO_REPRESENTATIVE",
                    "canonical_offset_ms": 4500,
                    "source_timestamp_ms": None,
                    "relative_path": rel,
                    "sha256": sha256_file(dest),
                    "width": TARGET_W,
                    "height": TARGET_H,
                    "spatial_transform": FIT,
                })
            else:
                if win_count == 1:
                    role = ["WINDOW_EARLY", "WINDOW_MIDDLE", "WINDOW_LATE"][fi]
                    offset = [1500, 4500, 7500][fi]
                    window_index = 0
                else:
                    role = "WINDOW_EARLY" if fi % 2 == 0 else "WINDOW_LATE"
                    offset = 1500 if fi % 2 == 0 else 7500
                    window_index = fi // 2
                frames_meta.append({
                    "frame_id": f"{aid}-f{fi}",
                    "window_index": window_index,
                    "window_count": win_count,
                    "sample_role": role,
                    "canonical_offset_ms": offset,
                    "source_timestamp_ms": int(pf["timeMs"]),
                    "relative_path": rel,
                    "sha256": sha256_file(dest),
                    "width": TARGET_W,
                    "height": TARGET_H,
                    "spatial_transform": FIT,
                })

        bundle_assets.append({
            "asset_id": aid,
            "source_display_name": aid,
            "media_kind": kind,
            "media_source": "PHONE_LIBRARY_DAY_TEST",
            "original_file_extension": a.get("originalExt") or "jpg",
            "original_sha256": a["originalSha"],
            "original_bytes": a["originalBytes"],
            "original_width": TARGET_W,
            "original_height": TARGET_H,
            "original_duration_ms": None if kind == "PHOTO" else a["durationMs"],
            "original_included": False,
            "sequence_index": len(bundle_assets),
            "logical_asset_duration_ms": 9000,
            "materialized_video": False,
            "evidence_sampling_profile": profile,
            "evidence_window_count": win_count,
            "frames": frames_meta,
        })
        semantic_audit.append({
            "assetId": aid,
            "kind": kind,
            "gate": a.get("gate"),
            "modelId": a.get("modelId"),
            "backend": a.get("backend"),
            "mobileclipPath": a.get("mobileclipPath"),
            "probeCount": a.get("probeCount"),
            "semanticTimesMs": a.get("semanticTimesMs"),
            "x02Envelope": env,
        })

    for i, asset in enumerate(bundle_assets):
        asset["sequence_index"] = i

    manifest = {
        "bundle_version": BUNDLE_V04,
        "research_only": True,
        "session": {
            "session_id": session_id,
            "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "timezone": "Asia/Shanghai",
        },
        "device": {
            "device_id": "WEB_BENCH_08_LOCAL_LIGHT",
            "hardware_revision": "N/A",
            "firmware_version": "N/A",
            "sdk_version": "web-bench-08-mobileclip",
        },
        "normalization": {
            "width": TARGET_W,
            "height": TARGET_H,
            "orientation": "PORTRAIT",
            "aspect_ratio": "3:4",
            "spatial_transform": FIT,
            "temporal_transform": "PHONE_TEST_DURATION_WINDOWS_V01",
            "canonical_frame_offsets_ms": [1500, 4500, 7500],
            "evidence_profile_version": "PHONE_TEST_DURATION_WINDOWS_V01",
        },
        "assets": bundle_assets,
    }
    (bundle_root / "bundle.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    sidecar = {
        "schema": "diary_one_local_semantic_half_product_v1",
        "dayKey": day_key,
        "pipeline": "08_dedupe_ffmpeg_mobileclip_gate_v04",
        "prd": "§19 手机 Evidence：去重 → 抽帧/压图 → 轻量语义 → 半成品；不持有百炼 Key，不产出 Chapter",
        "assets": semantic_audit,
    }
    (bundle_root / "local_semantic_route.json").write_text(
        json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (bundle_root / "day_key.txt").write_text(day_key + "\n", encoding="utf-8")

    zip_path = run_dir / "diary_one_upload_bundle.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in bundle_root.rglob("*"):
            if p.is_file():
                zf.write(p, str(p.relative_to(bundle_root)).replace("\\", "/"))
    return zip_path


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "bench": "08_local_light_pipeline",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "ffprobe": shutil.which("ffprobe") is not None,
        "defaultBff": DEFAULT_BFF,
        "pipeline": "dedupe(sha256) → ffmpeg probes → BFF MobileCLIP → gate 1/3/5/10 → V04 zip",
        "ledgerAssets": len((load_ledger(LEDGER_PATH).get("assets") or {})),
    }


@app.get("/api/ping-bff")
def ping_bff(bff_url: str = "", token: str = "") -> JSONResponse:
    bff = (bff_url or DEFAULT_BFF).rstrip("/")
    tok = token or DEFAULT_TOKEN
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(f"{bff}/health", headers={"Authorization": f"Bearer {tok}"})
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"text": r.text[:300]}
            mc = body.get("mobileclip") if isinstance(body, dict) else None
            return JSONResponse({
                "ok": r.status_code < 400,
                "status": r.status_code,
                "bff": bff,
                "mobileclip": mc,
                "body": body,
            })
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e), "bff": bff}, status_code=502)


@app.post("/api/process")
async def process(
    files: list[UploadFile] = File(...),
    bff_url: str = Form(DEFAULT_BFF),
    token: str = Form(DEFAULT_TOKEN),
    day_key: str = Form(""),
    skip_ledger_dupes: str = Form("1"),
) -> JSONResponse:
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        return JSONResponse({"ok": False, "error": "需要本机 ffmpeg/ffprobe 在 PATH"}, status_code=400)

    bff = (bff_url or DEFAULT_BFF).rstrip("/")
    tok = token or DEFAULT_TOKEN
    day = day_key.strip() or datetime.now().strftime("%Y-%m-%d")
    skip_ledger = (skip_ledger_dupes or "1").strip() not in ("0", "false", "False", "no")
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:8]
    run_dir = WORK / run_id
    inbox = run_dir / "inbox"
    inbox.mkdir(parents=True)

    t0 = time.perf_counter()
    assets: list[dict[str, Any]] = []
    bff_health: Any = None
    dedupe_info: dict[str, Any] = {}

    # 1) Save uploads  2) Dedupe by original_sha256 (App contract)  3) Semantic path
    inbox_paths: list[Path] = []
    for i, uf in enumerate(files):
        raw_name = uf.filename or f"asset_{i}.bin"
        suffix = Path(raw_name).suffix.lower() or ".bin"
        # keep original name stem for audit; sequence assigned after dedupe
        dest = inbox / f"raw_{i:03d}_{Path(raw_name).name}"
        dest.write_bytes(await uf.read())
        if suffix not in {
            ".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv",
            ".jpg", ".jpeg", ".png", ".webp",
        }:
            assets.append({
                "ok": False,
                "assetId": f"skip-{i}",
                "error": f"不支持 {suffix}",
                "fileName": raw_name,
            })
            continue
        inbox_paths.append(dest)

    dedupe_info = dedupe_inbox(
        inbox_paths,
        sha256_file=sha256_file,
        ledger_path=LEDGER_PATH,
        skip_known_ledger=skip_ledger,
    )
    unique_items = dedupe_info["unique"]
    if not unique_items and not any(a.get("ok") for a in assets):
        return JSONResponse({
            "ok": False,
            "error": "全部被去重跳过或类型不支持（会话内重复 / 历史账本已见）",
            "dedupe": {
                "skippedSessionDupes": dedupe_info.get("skippedSessionDupes"),
                "skippedLedgerDupes": dedupe_info.get("skippedLedgerDupes"),
                "skipped": dedupe_info.get("skipped"),
            },
            "hint": "勾掉「跳过账本重复」可强制重跑；或换未处理过的素材",
        }, status_code=400)

    try:
        with httpx.Client(timeout=180.0) as client:
            try:
                pr = client.get(f"{bff}/health", headers={"Authorization": f"Bearer {tok}"})
                bff_health = pr.json() if pr.status_code < 400 else {"status_code": pr.status_code}
                mc = (bff_health or {}).get("mobileclip") if isinstance(bff_health, dict) else None
                if isinstance(mc, dict) and mc.get("available") is False:
                    return JSONResponse({
                        "ok": False,
                        "error": "BFF MobileCLIP 不可用",
                        "mobileclip": mc,
                        "hint": "见 diary-one/docs/WINDOWS_MOBILECLIP_BFF.md，先 start-dev-lite.ps1",
                    }, status_code=502)
            except Exception as e:
                return JSONResponse({
                    "ok": False,
                    "error": f"无法连接 BFF ({bff}): {e}",
                    "hint": "启动 Dev Lite BFF :8790（含 MobileCLIP）",
                }, status_code=502)

            ledger = load_ledger(LEDGER_PATH)
            for seq, item in enumerate(unique_items):
                dest: Path = item["path"]
                asset_id = f"asset-{seq}"
                suffix = dest.suffix.lower()
                if suffix in {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}:
                    result = _process_video(client, bff, tok, dest, asset_id, run_dir)
                else:
                    result = _process_photo(dest, asset_id, run_dir)
                result["originalSha"] = item["originalSha256"]
                result["fileName"] = item["fileName"]
                assets.append(result)
                if result.get("ok"):
                    remember_sha(
                        ledger,
                        sha=item["originalSha256"],
                        asset_id=asset_id,
                        kind=item["kind"],
                        file_name=item["fileName"],
                        byte_size=item["byteSize"],
                    )
            save_ledger(LEDGER_PATH, ledger)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

    ok_assets = [a for a in assets if a.get("ok")]
    if not ok_assets:
        return JSONResponse({
            "ok": False,
            "error": "去重后全部处理失败",
            "assets": assets,
            "dedupe": {
                "skippedSessionDupes": dedupe_info.get("skippedSessionDupes"),
                "skippedLedgerDupes": dedupe_info.get("skippedLedgerDupes"),
                "skipped": dedupe_info.get("skipped"),
            },
        }, status_code=500)

    zip_path = _build_v04_bundle(run_dir, ok_assets, day)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    hist: dict[str, int] = {"1": 0, "3": 0, "5": 0, "10": 0}
    for a in ok_assets:
        if a.get("kind") == "VIDEO":
            lv = str((a.get("gate") or {}).get("targetFrameCount"))
            if lv in hist:
                hist[lv] += 1

    report = {
        "ok": True,
        "runId": run_id,
        "dayKey": day,
        "elapsedMs": elapsed_ms,
        "bff": bff,
        "bffHealth": bff_health,
        "pipelineSteps": [
            "intake",
            "dedupe_original_sha256",
            "ffmpeg_probes",
            "mobileclip_semantic_analyze",
            "gate_1_3_5_10",
            "letterbox_768x1024",
            "bundle_v04_zip",
        ],
        "dedupe": {
            "inputCount": len(files),
            "uniqueCount": len(unique_items),
            "skippedSessionDupes": dedupe_info.get("skippedSessionDupes", 0),
            "skippedLedgerDupes": dedupe_info.get("skippedLedgerDupes", 0),
            "skipped": dedupe_info.get("skipped") or [],
            "skipLedgerEnabled": skip_ledger,
        },
        "metrics": {
            "assetCount": len(ok_assets) + len(dedupe_info.get("skipped") or []),
            "okCount": len(ok_assets),
            "dedupedAway": (dedupe_info.get("skippedSessionDupes") or 0)
            + (dedupe_info.get("skippedLedgerDupes") or 0),
            "totalPackedFrames": sum(len(a.get("packedFrames") or []) for a in ok_assets),
            "routeHistogram": hist,
            "mobileclipUsed": any(a.get("mobileclipPath") for a in ok_assets),
            "backends": sorted({str(a.get("backend")) for a in ok_assets}),
            "modelIds": sorted({str(a.get("modelId")) for a in ok_assets if a.get("modelId")}),
        },
        "assets": [
            {
                "assetId": a.get("assetId"),
                "ok": a.get("ok"),
                "kind": a.get("kind"),
                "fileName": a.get("fileName"),
                "originalSha256": a.get("originalSha"),
                "error": a.get("error"),
                "durationMs": a.get("durationMs"),
                "probeCount": a.get("probeCount"),
                "modelId": a.get("modelId"),
                "backend": a.get("backend"),
                "mobileclipPath": a.get("mobileclipPath"),
                "gate": a.get("gate"),
                "semanticTimesMs": a.get("semanticTimesMs"),
                "x02Envelope": a.get("x02Envelope"),
                "packedCount": len(a.get("packedFrames") or []),
            }
            for a in assets
        ],
        "downloadUrl": f"/api/download/{run_id}",
        "next": "把 zip 拿到 09 云端台；每人填自己的百炼 DASHSCOPE_API_KEY，跑完 X02 得 Chapter（测试台例外；产品 SYS02 密钥只在自有服务）。",
    }
    (run_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return JSONResponse(report)


@app.get("/api/download/{run_id}")
def download(run_id: str):
    safe = Path(run_id).name
    z = WORK / safe / "diary_one_upload_bundle.zip"
    if not z.is_file():
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
    return FileResponse(z, filename="diary_one_upload_bundle.zip", media_type="application/zip")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8808"))
    print(f"[08] MobileCLIP local light → http://127.0.0.1:{port}")
    print(f"[08] BFF default: {DEFAULT_BFF}  token: {DEFAULT_TOKEN}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
