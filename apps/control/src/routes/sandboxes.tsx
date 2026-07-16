import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sandboxes")({
  beforeLoad: () => {
    throw redirect({ to: "/agent/sandboxes/runtime" });
  },
});
