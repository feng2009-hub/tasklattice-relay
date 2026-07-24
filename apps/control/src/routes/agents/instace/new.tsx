import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/agents/instace/new")({
  beforeLoad: () => {
    throw redirect({
      to: "/instances",
      search: {
        create: "instance",
      },
    });
  },
});
