#!/usr/bin/env node

import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const migrationsRoot = resolve(
  repositoryRoot,
  "apps/control/prisma/migrations",
);
const migrationDirectories = readdirSync(migrationsRoot, {
  withFileTypes: true,
}).filter((entry) => entry.isDirectory());
const invalidMigrations = migrationDirectories.flatMap(({ name }) => {
  const migrationFile = resolve(migrationsRoot, name, "migration.sql");
  try {
    return statSync(migrationFile).size > 0 ? [] : [`${name}/migration.sql is empty`];
  } catch {
    return [`${name}/migration.sql is missing`];
  }
});

if (invalidMigrations.length) {
  throw new Error(
    `Invalid Prisma migration directories:\n${invalidMigrations
      .map((message) => `- ${message}`)
      .join("\n")}`,
  );
}
if (!migrationDirectories.length) {
  throw new Error("No Prisma migrations were found.");
}

console.log(
  `Validated ${migrationDirectories.length} Prisma migration directories.`,
);
