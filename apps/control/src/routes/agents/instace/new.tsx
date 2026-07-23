import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/agents/instace/new")({
  validateSearch: z.object({ inferenceGroupId: z.string().uuid().optional() }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/instances",
      search: {
        create: "instance",
        ...(search.inferenceGroupId
          ? { inferenceGroupId: search.inferenceGroupId }
          : {}),
      },
    });
  },
});
