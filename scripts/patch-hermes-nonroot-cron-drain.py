#!/usr/bin/env python3
"""Disable the root-only cron drain channel in OpenShell's non-root topology."""

from __future__ import annotations

import argparse
from pathlib import Path


DRAIN_ANCHOR = '''    import os
    import stat

    state_root = _NEMOCLAW_CRON_RESTORE_DRAIN_PATH.parent
'''

DRAIN_REPLACEMENT = '''    import os
    import stat

    # OpenShell's managed workload runs the complete Hermes tree as the sandbox
    # identity. There is no root-owned NemoClaw state boundary in that topology,
    # so treating the expected non-root directory as unsafe would drain every
    # fresh gateway forever. The operator drain marker remains active separately.
    if os.geteuid() != 0:
        return False

    state_root = _NEMOCLAW_CRON_RESTORE_DRAIN_PATH.parent
'''


def patch_drain_control(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    occurrences = source.count(DRAIN_ANCHOR)
    if occurrences != 1:
        raise SystemExit(
            f"expected exactly one root-only cron drain anchor in {path}, "
            f"found {occurrences}"
        )
    path.write_text(source.replace(DRAIN_ANCHOR, DRAIN_REPLACEMENT), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("drain_control", type=Path)
    args = parser.parse_args()
    patch_drain_control(args.drain_control)


if __name__ == "__main__":
    main()
