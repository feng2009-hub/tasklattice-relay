import { describe, expect, it } from "vitest";
import { selectInitialProject } from "./project-context";
import type { Project } from "@/types/project";

const projects: Project[] = [
  {
    id: "individual",
    name: "admin",
    department: { id: "dep1", name: "dep1", role: "administrator" },
    memberCount: 1,
    assignedRoles: ["developer", "admin"],
    activeRole: "admin",
    effectiveCapabilities: [],
  },
  {
    id: "devops",
    name: "DevOps Team",
    department: { id: "dep1", name: "dep1", role: "administrator" },
    memberCount: 8,
    assignedRoles: ["user"],
    activeRole: "user",
    effectiveCapabilities: [],
  },
];

describe("selectInitialProject", () => {
  it("prefers the URL project over stored state", () => {
    expect(selectInitialProject(projects, "devops", "individual").id).toBe(
      "devops",
    );
  });

  it("uses stored state when the URL project is unavailable", () => {
    expect(selectInitialProject(projects, null, "devops").id).toBe(
      "devops",
    );
  });

  it("falls back to the first available project when the URL project is invalid", () => {
    expect(selectInitialProject(projects, "missing", "devops").id).toBe(
      "individual",
    );
  });

  it("falls back to the first available project when no preference exists", () => {
    expect(selectInitialProject([...projects].reverse(), null, null).id).toBe(
      "devops",
    );
  });

  it("rejects an empty project list instead of inventing a client-side project", () => {
    expect(() => selectInitialProject([], null, null)).toThrow(
      "No project available.",
    );
  });
});
