import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/agents/instace/new")({
  validateSearch: z.object({ modelProfileId: z.string().uuid().optional() }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/instances",
      search: {
        create: "instance",
        ...(search.modelProfileId
          ? { modelProfileId: search.modelProfileId }
          : {}),
      },
    });
  },
});
