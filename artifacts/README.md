# Repository Artifacts

This directory contains non-code repository assets, including editable source
materials and generated, release-ready artifacts whose exact bytes are consumed
by builds or runtime seeds.

- `skills/` contains Skill source materials, packaged archives, and manifests.
- Add other artifact types as sibling directories so each asset family remains self-contained.
- Keep related source materials and generated outputs together under a dedicated
  artifact-type directory, and generate release artifacts through the repository
  build commands.
