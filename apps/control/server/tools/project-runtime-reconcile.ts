import { prisma } from "../db/prisma";
import { ProjectRuntimeTargetService } from "../projects/project-runtime-target-service";

const database = prisma();
const service = new ProjectRuntimeTargetService(database);

try {
  const summary = await service.reconcileAll();
  console.info("Project Runtime Namespace reconciliation completed.", summary);
  if (summary.failed) process.exitCode = 1;
} catch (error) {
  console.error("Project Runtime Namespace reconciliation failed.", error);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
