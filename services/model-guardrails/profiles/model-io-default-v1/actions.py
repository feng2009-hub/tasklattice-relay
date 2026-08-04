from __future__ import annotations

import re

from nemoguardrails.actions import action


_BLOCKED_PATTERNS = (
    re.compile(r"\btasklattice-test-block\b", re.IGNORECASE),
    re.compile(r"\b(?:api[-_ ]?key|access[-_ ]?token)\s*[:=]\s*[A-Za-z0-9_\-]{16,}"),
)


@action(name="tasklattice_detect_model_io_violation", is_system_action=True)
async def tasklattice_detect_model_io_violation(text: str = "") -> bool:
    """Deterministic baseline rail; deployments can mount a richer NeMo profile."""

    return any(pattern.search(text) for pattern in _BLOCKED_PATTERNS)
