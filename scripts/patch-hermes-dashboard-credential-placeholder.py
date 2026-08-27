#!/usr/bin/env python3
"""Teach NemoClaw's Dashboard seeder the OpenShell credential contract."""

from __future__ import annotations

import argparse
from pathlib import Path


IMPORT_ANCHOR = "import pwd\nimport stat\n"
IMPORT_REPLACEMENT = "import pwd\nimport re\nimport stat\n"

CLASS_ANCHOR = '''class InvalidDashboardSeedDocumentError(Exception):
    pass


'''
CLASS_REPLACEMENT = '''class InvalidDashboardSeedDocumentError(Exception):
    pass


OPENSHELL_CREDENTIAL_PLACEHOLDER_RE = re.compile(
    r"^openshell:resolve:env:v[0-9]+_OPENAI_API_KEY$"
)


'''

VALIDATION_ANCHOR = '''    expected_api_key = policy_value(policy["config"], "model.api_key")
    credential_bearing_routes = [model, *providers.values(), *custom_providers]
    if not isinstance(expected_api_key, str) or any(
        not isinstance(route, dict) or route.get("api_key") != expected_api_key
        for route in credential_bearing_routes
    ):
'''

VALIDATION_REPLACEMENT = '''    credential_bearing_routes = [model, *providers.values(), *custom_providers]
    if any(
        not isinstance(route, dict)
        or not isinstance(route.get("api_key"), str)
        or OPENSHELL_CREDENTIAL_PLACEHOLDER_RE.fullmatch(route["api_key"]) is None
        for route in credential_bearing_routes
    ):
'''


def _replace_once(source: str, anchor: str, replacement: str, label: str) -> str:
    occurrences = source.count(anchor)
    if occurrences != 1:
        raise SystemExit(f"expected exactly one {label}, found {occurrences}")
    return source.replace(anchor, replacement)


def patch_dashboard_seeder(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = _replace_once(source, IMPORT_ANCHOR, IMPORT_REPLACEMENT, "import anchor")
    source = _replace_once(source, CLASS_ANCHOR, CLASS_REPLACEMENT, "class anchor")
    source = _replace_once(
        source,
        VALIDATION_ANCHOR,
        VALIDATION_REPLACEMENT,
        "legacy credential validation",
    )
    path.write_text(source, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dashboard_seeder", type=Path)
    args = parser.parse_args()
    patch_dashboard_seeder(args.dashboard_seeder)


if __name__ == "__main__":
    main()
