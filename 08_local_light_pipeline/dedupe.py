# -*- coding: utf-8 -*-
"""Local light dedupe — mirrors apps/mobile/src/pipeline/dedupeMedia.ts.

PRD path: 选入 → 去重(original_sha256) → 压图/抽帧 → MobileCLIP → 门控.
Same bytes only generate Evidence once (session + persistent ledger).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_ledger(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"schema": "web_bench_08_raw_asset_ledger_v1", "assets": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data.get("assets"), dict):
            data["assets"] = {}
        return data
    except Exception:
        return {"schema": "web_bench_08_raw_asset_ledger_v1", "assets": {}}


def save_ledger(path: Path, ledger: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")


def remember_sha(
    ledger: dict[str, Any],
    *,
    sha: str,
    asset_id: str,
    kind: str,
    file_name: str,
    byte_size: int,
) -> None:
    assets = ledger.setdefault("assets", {})
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    prev = assets.get(sha) or {}
    assets[sha] = {
        "originalSha256": sha,
        "assetKey": asset_id,
        "mediaKind": kind,
        "fileName": file_name,
        "byteSize": byte_size,
        "firstSeenAt": prev.get("firstSeenAt") or now,
        "lastSeenAt": now,
    }


def dedupe_inbox(
    paths: list[Path],
    *,
    sha256_file,
    ledger_path: Path,
    skip_known_ledger: bool = True,
) -> dict[str, Any]:
    """Return unique paths + skip stats. Order preserved."""
    ledger = load_ledger(ledger_path)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    skipped_session = 0
    skipped_ledger = 0
    skipped_rows: list[dict[str, Any]] = []

    for p in paths:
        sha = sha256_file(p)
        name = p.name
        kind = "VIDEO" if p.suffix.lower() in {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"} else "PHOTO"
        if sha in seen:
            skipped_session += 1
            skipped_rows.append({
                "fileName": name,
                "originalSha256": sha,
                "reason": "SESSION_DUPLICATE",
            })
            continue
        seen.add(sha)

        if skip_known_ledger and sha in (ledger.get("assets") or {}):
            skipped_ledger += 1
            remember_sha(
                ledger,
                sha=sha,
                asset_id=(ledger["assets"][sha] or {}).get("assetKey") or sha[:12],
                kind=kind,
                file_name=name,
                byte_size=p.stat().st_size,
            )
            skipped_rows.append({
                "fileName": name,
                "originalSha256": sha,
                "reason": "LEDGER_DUPLICATE",
            })
            continue

        unique.append({
            "path": p,
            "originalSha256": sha,
            "fileName": name,
            "kind": kind,
            "byteSize": p.stat().st_size,
        })

    save_ledger(ledger_path, ledger)
    return {
        "unique": unique,
        "skippedSessionDupes": skipped_session,
        "skippedLedgerDupes": skipped_ledger,
        "skipped": skipped_rows,
        "ledgerPath": str(ledger_path),
    }
