import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AccessContextSelection } from "@/components/auth/access-context-selection";

export const Route = createFileRoute("/access")({
  component: AccessContextSelection,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
});
