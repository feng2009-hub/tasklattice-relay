import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { prisma } from "../db/prisma";
import { ProjectDeletionService } from "../projects/project-deletion-service";

const idlePollingIntervalMs = 5_000;
const errorPollingIntervalMs = 10_000;
const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
let stopping = false;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

process.once("SIGTERM", () => {
  stopping = true;
});
process.once("SIGINT", () => {
  stopping = true;
});

const database = prisma();
const service = new ProjectDeletionService(database);
console.info("Project deletion worker started.", { workerId });

while (!stopping) {
  try {
    const result = await service.processNext(workerId);
    if (result.status === "completed") {
      console.info("Scheduled Project cleanup completed.", {
        projectId: result.projectId,
      });
    } else if (result.status === "retry") {
      console.error("Scheduled Project cleanup will retry.", result);
    } else {
      await wait(idlePollingIntervalMs);
    }
  } catch (error) {
    console.error("Project deletion worker polling failed.", error);
    await wait(errorPollingIntervalMs);
  }
}

await database.$disconnect();
console.info("Project deletion worker stopped.", { workerId });
