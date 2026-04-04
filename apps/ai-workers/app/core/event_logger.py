from __future__ import annotations

import json
import uuid
from typing import Any

from app.core.redis_client import client


def ensure_trace_id(trace_id: str | None = None) -> str:
    return trace_id or str(uuid.uuid4())


def log_worker_event(
    *,
    trace_id: str | None,
    service: str,
    stage: str,
    event_type: str,
    level: str = "info",
    user_id: str | None = None,
    interview_id: str | None = None,
    file_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> str:
    safe_trace_id = ensure_trace_id(trace_id)
    client.publish(
        "event:log",
        json.dumps(
            {
                "traceId": safe_trace_id,
                "service": service,
                "stage": stage,
                "eventType": event_type,
                "level": level,
                "userId": user_id,
                "interviewId": interview_id,
                "fileId": file_id,
                "payload": payload or {},
            }
        ),
    )
    return safe_trace_id
