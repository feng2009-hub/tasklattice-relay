#!/opt/hermes/.venv/bin/python3
"""Apply TaskLattice inference routing without weakening Hermes' hash anchor."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile


HASH_LINE = re.compile(r"^([0-9a-f]{64})  (.+)$")
MCP_LINE = re.compile(
    r"^# nemoclaw-hermes-mcp-state-v1 intended=([0-9a-f]{64}) applied=([0-9a-f]{64})$"
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_directory(path: Path) -> None:
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode):
        raise RuntimeError(f"Refusing non-directory Hermes path: {path}")


def require_regular_file(path: Path) -> None:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
        raise RuntimeError(f"Refusing non-regular Hermes file: {path}")


def atomic_write(path: Path, data: bytes, mode: int) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def mcp_digest(config: Path, builder: Path, guard: Path) -> str:
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            str(builder),
            "--guard",
            str(guard),
            "--config",
            str(config),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    value = result.stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{64}", value):
        raise RuntimeError("Hermes MCP digest builder returned an invalid digest")
    return value


def parse_anchor(anchor: bytes, config: Path, env: Path) -> tuple[str, str, str]:
    lines = anchor.decode("utf-8").splitlines()
    if len(lines) != 3:
        raise RuntimeError("Hermes hash anchor has an unexpected shape")
    config_match = HASH_LINE.fullmatch(lines[0])
    env_match = HASH_LINE.fullmatch(lines[1])
    mcp_match = MCP_LINE.fullmatch(lines[2])
    if not config_match or config_match.group(2) != str(config):
        raise RuntimeError("Hermes config hash anchor is invalid")
    if not env_match or env_match.group(2) != str(env):
        raise RuntimeError("Hermes env hash anchor is invalid")
    if not mcp_match or mcp_match.group(1) != mcp_match.group(2):
        raise RuntimeError("Hermes MCP hash anchor is not in a clean state")
    return config_match.group(1), env_match.group(1), mcp_match.group(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--hash-file", type=Path, required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--template-endpoint", required=True)
    parser.add_argument("--template-model", required=True)
    parser.add_argument(
        "--mcp-digest-builder",
        type=Path,
        default=Path("/usr/local/lib/nemoclaw/build-hermes-mcp-digest.py"),
    )
    parser.add_argument(
        "--runtime-config-guard",
        type=Path,
        default=Path("/usr/local/lib/nemoclaw/hermes-runtime-config-guard.py"),
    )
    args = parser.parse_args()

    config = args.config
    hash_file = args.hash_file
    if not config.is_absolute() or not hash_file.is_absolute():
        raise RuntimeError("Hermes bootstrap paths must be absolute")
    if config.parent != hash_file.parent:
        raise RuntimeError("Hermes config and hash anchor must share a directory")
    env = config.parent / ".env"
    require_directory(config.parent.parent)
    require_directory(config.parent)
    for path in (
        config,
        env,
        hash_file,
        args.mcp_digest_builder,
        args.runtime_config_guard,
    ):
        require_regular_file(path)
    original_config = config.read_bytes()
    original_env = env.read_bytes()
    original_anchor = hash_file.read_bytes()
    config_hash, env_hash, anchored_mcp = parse_anchor(original_anchor, config, env)
    if digest(original_config) != config_hash or digest(original_env) != env_hash:
        raise RuntimeError("Hermes persisted inputs already differ from the image anchor")
    if mcp_digest(config, args.mcp_digest_builder, args.runtime_config_guard) != anchored_mcp:
        raise RuntimeError("Hermes MCP configuration already differs from the image anchor")

    current = original_config.decode("utf-8")
    if args.template_endpoint not in current or args.template_model not in current:
        raise RuntimeError("Hermes config does not contain the expected inference template")
    updated_config = current.replace(args.template_endpoint, args.endpoint).replace(
        args.template_model, args.model
    ).encode("utf-8")
    config_mode = config.stat().st_mode & 0o7777
    anchor_mode = hash_file.stat().st_mode & 0o7777

    try:
        atomic_write(config, updated_config, config_mode)
        if mcp_digest(config, args.mcp_digest_builder, args.runtime_config_guard) != anchored_mcp:
            raise RuntimeError("Inference routing unexpectedly changed Hermes MCP configuration")
        updated_anchor = (
            f"{digest(updated_config)}  {config}\n"
            f"{digest(original_env)}  {env}\n"
            f"# nemoclaw-hermes-mcp-state-v1 intended={anchored_mcp} applied={anchored_mcp}\n"
        ).encode("utf-8")
        atomic_write(hash_file, updated_anchor, anchor_mode)
    except BaseException:
        atomic_write(config, original_config, config_mode)
        atomic_write(hash_file, original_anchor, anchor_mode)
        raise


if __name__ == "__main__":
    main()
