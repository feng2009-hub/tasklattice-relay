import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/skills")({
  beforeLoad: () => {
    throw redirect({ href: "/Extensions/skill" });
  },
});
