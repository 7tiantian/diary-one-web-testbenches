# -*- coding: utf-8 -*-
"""1/3/5/10 gate — aligned with MOBILECLIP_IMAGE_ROUTING_PROFILE / App semanticRouter."""
from __future__ import annotations

import math
from typing import Any

# From apps/mobile MOBILECLIP_IMAGE_ROUTING_PROFILE (+ DEFAULT scene ladder)
PROFILE = {
    "transitionSimilarityMax": 0.7,
    "frame1MaxScenes": 1,
    "frame3MaxScenes": 4,
    "frame5MaxScenes": 9,
    "frame1MeanMin": 0.72,
    "frame3MeanMin": 0.6,
    "frame5MeanMin": 0.45,
}


def _norm(v: list[float]) -> list[float]:
    s = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / s for x in v]


def cosine(a: list[float], b: list[float]) -> float:
    na, nb = _norm(a), _norm(b)
    return max(-1.0, min(1.0, sum(x * y for x, y in zip(na, nb))))


def apply_gate(vectors: list[list[float]]) -> dict[str, Any]:
    n = len(vectors)
    if n <= 1:
        return {
            "targetFrameCount": 1,
            "reasonCodes": ["SINGLE_PROBE_SELECT_FRAME_1"],
            "meanAdjacentSimilarity": 1.0,
            "transitionCount": 0,
            "sceneCount": 1,
            "gateApplied": True,
            "profileId": "MOBILECLIP_S0_IMAGE_GATE_V01",
        }

    adj = [cosine(vectors[i], vectors[i + 1]) for i in range(n - 1)]
    mean_adj = sum(adj) / len(adj)
    thr = PROFILE["transitionSimilarityMax"]
    transitions = sum(1 for s in adj if s < thr)
    scenes = transitions + 1

    reasons: list[str] = []
    if scenes <= PROFILE["frame1MaxScenes"] and mean_adj >= PROFILE["frame1MeanMin"]:
        level = 1
        reasons.append("SEMANTIC_SEQUENCE_SELECT_FRAME_1")
    elif scenes <= PROFILE["frame3MaxScenes"] and mean_adj >= PROFILE["frame3MeanMin"]:
        level = 3
        reasons.append("SEMANTIC_SEQUENCE_SELECT_FRAME_3")
    elif scenes <= PROFILE["frame5MaxScenes"] and mean_adj >= PROFILE["frame5MeanMin"]:
        level = 5
        reasons.append("SEMANTIC_SEQUENCE_SELECT_FRAME_5")
    else:
        level = 10
        reasons.append("SEMANTIC_SEQUENCE_SELECT_FIXED_10")

    return {
        "targetFrameCount": level,
        "reasonCodes": reasons,
        "meanAdjacentSimilarity": round(mean_adj, 4),
        "transitionCount": transitions,
        "sceneCount": scenes,
        "gateApplied": True,
        "profileId": "MOBILECLIP_S0_IMAGE_GATE_V01",
        "adjacentSimilarities": [round(x, 4) for x in adj],
    }


def diversify_indices(vectors: list[list[float]], k: int) -> list[int]:
    n = len(vectors)
    if n == 0:
        return []
    k = max(1, min(k, n))
    if k == 1:
        return [n // 2]
    norms = [_norm(v) for v in vectors]
    chosen = [n // 2]
    while len(chosen) < k:
        best_i, best_score = None, -1.0
        for i in range(n):
            if i in chosen:
                continue
            sims = [sum(a * b for a, b in zip(norms[i], norms[j])) for j in chosen]
            score = 1.0 - max(sims)
            if score > best_score:
                best_score = score
                best_i = i
        if best_i is None:
            break
        chosen.append(best_i)
    return sorted(chosen)


def sample_role(index: int, total: int) -> str:
    if total <= 1:
        return "WINDOW_MIDDLE"
    ratio = index / (total - 1)
    if ratio <= 0.34:
        return "WINDOW_EARLY"
    if ratio >= 0.66:
        return "WINDOW_LATE"
    return "WINDOW_MIDDLE"


def canonical_offset(role: str) -> int:
    if role == "WINDOW_EARLY":
        return 1500
    if role == "WINDOW_LATE":
        return 7500
    return 4500


def duration_evidence_profile(duration_ms: int) -> tuple[int, int, str]:
    """X02 V04 gate still expects duration windows (1/2/4/6 → 3/4/8/12 frames)."""
    if duration_ms <= 10_000:
        return 1, 3, "VIDEO_SINGLE_WINDOW_THREE"
    if duration_ms <= 30_000:
        return 2, 4, "VIDEO_MULTI_WINDOW_TWO_PER_WINDOW"
    if duration_ms <= 90_000:
        return 4, 8, "VIDEO_MULTI_WINDOW_TWO_PER_WINDOW"
    return 6, 12, "VIDEO_MULTI_WINDOW_TWO_PER_WINDOW"


def map_to_duration_slots(
    selected_times: list[int],
    duration_ms: int,
    expected_frames: int,
) -> list[int]:
    """Fill X02 slot count using MobileCLIP-selected timestamps (pad/subsample)."""
    if not selected_times:
        step = max(1, duration_ms // (expected_frames + 1))
        return [min(duration_ms - 1, step * (i + 1)) for i in range(expected_frames)]
    times = sorted(selected_times)
    if len(times) >= expected_frames:
        # even subsample
        out = []
        for i in range(expected_frames):
            out.append(times[round(i * (len(times) - 1) / (expected_frames - 1))])
        return _unique_chrono(out, duration_ms)
    # pad: insert midpoints between existing
    out = list(times)
    while len(out) < expected_frames:
        best_gap, insert_at, insert_t = -1, 1, out[0]
        for i in range(len(out) - 1):
            gap = out[i + 1] - out[i]
            if gap > best_gap:
                best_gap = gap
                insert_at = i + 1
                insert_t = out[i] + gap // 2
        if best_gap <= 1:
            # nudge end
            insert_t = min(duration_ms - 1, out[-1] + 1)
            insert_at = len(out)
        out.insert(insert_at, insert_t)
        out = _unique_chrono(out, duration_ms)
    return out[:expected_frames]


def _unique_chrono(times: list[int], duration_ms: int) -> list[int]:
    seen = set()
    out = []
    for t in sorted(times):
        t = max(0, min(duration_ms - 1 if duration_ms > 0 else 0, int(t)))
        while t in seen and t < (duration_ms or 1):
            t += 1
        seen.add(t)
        out.append(t)
    return out
