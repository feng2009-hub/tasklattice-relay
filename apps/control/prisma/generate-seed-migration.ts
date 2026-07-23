import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { developmentExtensionCatalog } from "../server/extensions/development-extension-catalog";
import { FilePolicyCatalogSource } from "../server/policies/policy-service";

const target = fileURLToPath(new URL(
  "./migrations/20260723001000_seed_control_plane/migration.sql",
  import.meta.url,
));

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const statements: string[] = [
  `INSERT INTO tasklattice.users
    (id, username, email, display_name, auth_provider)
   VALUES ('local-admin', 'admin', 'admin@tasklattice.local', 'Local Administrator', 'local')
   ON CONFLICT (id) DO NOTHING;`,
  `INSERT INTO tasklattice.workspaces
    (id, name, type, created_by)
   VALUES ('individual', 'Individual', 'personal', 'local-admin')
   ON CONFLICT (id) DO NOTHING;`,
  `INSERT INTO tasklattice.workspace_members
    (workspace_id, user_id, role)
   VALUES ('individual', 'local-admin', 'owner')
   ON CONFLICT (workspace_id, user_id) DO NOTHING;`,
];

const groups = [
  ["extension_skills", developmentExtensionCatalog.skills],
  ["extension_mcp_servers", developmentExtensionCatalog.mcpServers],
  ["extension_knowledge_sources", developmentExtensionCatalog.knowledgeSources],
  ["agent_specializations", developmentExtensionCatalog.specializations],
] as const;

for (const [table, records] of groups) {
  for (const [sortOrder, record] of records.entries()) {
    statements.push(
      `INSERT INTO tasklattice.${table} (workspace_id, id, payload, sort_order)
       VALUES ('individual', ${literal(record.id)}, ${literal(JSON.stringify(record))}::jsonb, ${sortOrder})
       ON CONFLICT (workspace_id, id) DO NOTHING;`,
    );
  }
}

for (const policy of new FilePolicyCatalogSource().load().policies) {
  statements.push(
    `INSERT INTO tasklattice.sandbox_policies (workspace_id, id, payload, created_at)
     VALUES ('individual', ${literal(policy.id)}, ${literal(JSON.stringify(policy))}::jsonb, to_timestamp(0))
     ON CONFLICT (workspace_id, id) DO NOTHING;`,
  );
}

mkdirSync(fileURLToPath(new URL("./migrations/20260723001000_seed_control_plane", import.meta.url)), {
  recursive: true,
});
writeFileSync(target, `${statements.join("\n\n")}\n`);
