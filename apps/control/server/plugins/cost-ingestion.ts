import { definePlugin } from "nitro";
import { prisma } from "../db/prisma";
import { CostIngestionService } from "../providers/cost-ingestion-service";

const pollingIntervalMs = 60 * 1_000;

export default definePlugin(() => {
  const ingestion = new CostIngestionService(prisma());
  const sync = () => {
    void ingestion.syncAll().then((result) => {
      if (result.failedProjects.length) {
        console.error("Project cost ingestion completed with failures.", result.failedProjects);
      }
    }).catch((error) => {
      console.error("Project cost ingestion failed.", error);
    });
  };

  sync();
  const timer = setInterval(sync, pollingIntervalMs);
  timer.unref();
});
