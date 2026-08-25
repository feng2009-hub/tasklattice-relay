# Skills

This directory contains editable Skill sources. Deployable packages live under the repository-level `artifacts/` boundary:

```text
skills/
└── vendor/
    ├── catalog.json
    └── <skill-name>/
        ├── SKILL.md
        └── agents/openai.yaml

artifacts/
└── skills/
    └── vendor/
        ├── manifest.json
        └── <skill-name>-<version>.tar.gz
```

- `vendor/` is the source of truth. Each Skill is an independently valid Skill directory, and `catalog.json` assigns its immutable release version.
- `../artifacts/skills/vendor/` contains deterministic packages consumed by the Control Plane image and database seed. Do not edit these files by hand.
- Run `npm run skills:package` after changing a Skill or catalog version. Run `npm run skills:check` to verify that committed artifacts match their sources.
- Bump the catalog version whenever packaged Skill content changes. An existing Skill version is immutable once seeded.
