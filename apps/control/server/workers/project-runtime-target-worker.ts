import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import { ProjectRuntimeTargetService } from "../projects/project-runtime-target-service";

const errorPollingIntervalMs = 10_000;
const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
let stopping = false;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

process.once("SIGTERM", () => {
  stopping = true;
});
process.once("SIGINT", () => {
  stopping = true;
});

const config = getControlConfig().runtime_namespaces;
const database = prisma();
const service = new ProjectRuntimeTargetService(database);
console.info("Project Runtime Target worker started.", {
  clusterId: config.cluster_id,
  workerId,
});

while (!stopping) {
  try {
    const result = await service.processNext(workerId);
    if (result.status === "ready") {
      console.info("Project Runtime Namespace reconciled.", result);
    } else if (result.status === "retry") {
      console.error("Project Runtime Namespace will retry.", result);
    } else {
      await wait(config.reconcile_interval_seconds * 1_000);
    }
  } catch (error) {
    console.error("Project Runtime Target worker polling failed.", error);
    await wait(errorPollingIntervalMs);
  }
}

await database.$disconnect();
console.info("Project Runtime Target worker stopped.", { workerId });
