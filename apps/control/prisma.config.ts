import "dotenv/config";
import { defineConfig } from "prisma/config";

const url = new URL(
  process.env.TALI_DATABASE_URL ??
    "postgresql://tasklattice:development@127.0.0.1:5432/tasklattice",
);
url.searchParams.set("schema", "tasklattice");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: url.toString(),
  },
});
