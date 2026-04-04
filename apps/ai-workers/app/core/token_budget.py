from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.redis_client import client


class BudgetExceededError(Exception):
    """Raised when a user exceeds the configured daily token budget."""


def _utc_date_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _redis_key(user_id: str, model: str) -> str:
    return f"token:{user_id}:{_utc_date_key()}:{model}"


def estimate_tokens(*parts: Any) -> int:
    text = " ".join(str(part or "") for part in parts)
    words = len(text.split())
    return max(1, int(words * 1.3))


def extract_total_tokens(response: Any, fallback: int = 0) -> int:
    usage_metadata = getattr(response, "usage_metadata", None)
    if isinstance(usage_metadata, dict):
        total = usage_metadata.get("total_tokens")
        if isinstance(total, int) and total > 0:
            return total

    response_metadata = getattr(response, "response_metadata", None)
    if isinstance(response_metadata, dict):
        token_usage = response_metadata.get("token_usage", {})
        total = token_usage.get("total_tokens")
        if isinstance(total, int) and total > 0:
            return total

    usage = getattr(response, "usage", None)
    total = getattr(usage, "total_tokens", None)
    if isinstance(total, int) and total > 0:
        return total

    return max(0, fallback)


def check_budget(user_id: str, model: str) -> None:
    current = client.get(_redis_key(user_id, model))
    tokens_used = int(current or 0)
    if tokens_used >= settings.TOKEN_DAILY_LIMIT:
        raise BudgetExceededError("BUDGET_EXCEEDED")


def increment_usage(user_id: str, model: str, tokens_used: int) -> int:
    safe_tokens = max(0, int(tokens_used or 0))
    key = _redis_key(user_id, model)
    current_total = int(client.incrby(key, safe_tokens))
    client.expire(key, 86400)
    client.publish(
        "token:usage",
        json.dumps(
            {
                "userId": user_id,
                "model": model,
                "date": _utc_date_key(),
                "tokensUsed": safe_tokens,
                "totalTokens": current_total,
            }
        ),
    )
    return current_total
