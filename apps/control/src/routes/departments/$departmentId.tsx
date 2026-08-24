import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  departmentNameSchema,
  scopedEntityNameLimits,
} from "@tali/contracts";
import {
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  FolderKanban,
  Save,
  Users,
} from "lucide-react";
import { AccountAvatar } from "@/components/account/account-avatar";
import { PageHeader } from "@/components/layout/page-header";
import { useProject } from "@/hooks/use-project";
import {
  departmentQueryKey,
  getDepartment,
  updateDepartment,
} from "@/services/department";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

export const Route = createFileRoute("/departments/$departmentId")({
  component: DepartmentManagementPage,
});

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function DepartmentManagementPage() {
  const { departmentId } = Route.useParams();
  const { refreshProjects } = useProject();
  const queryClient = useQueryClient();
  const department = useQuery({
    queryKey: departmentQueryKey(departmentId),
    queryFn: () => getDepartment(departmentId),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hardBudgetUsd, setHardBudgetUsd] = useState("");
  const validatedName = departmentNameSchema.safeParse(name);

  useEffect(() => {
    if (!department.data) return;
    setName(department.data.name);
    setDescription(department.data.description ?? "");
    setHardBudgetUsd(
      department.data.hardBudgetUsd === null
        ? ""
        : String(department.data.hardBudgetUsd),
    );
  }, [department.data]);

  const save = useMutation({
    mutationFn: () =>
      updateDepartment(departmentId, {
        name: name.trim(),
        description: description.trim() || null,
        hardBudgetUsd: hardBudgetUsd.trim() ? Number(hardBudgetUsd) : null,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(departmentQueryKey(departmentId), updated);
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      await refreshProjects();
    },
  });

  if (department.isPending) {
    return (
      <div className="space-y-6" aria-label="Loading Department">
        <div className="h-20 animate-pulse rounded-md bg-muted/70" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
          <div className="h-96 animate-pulse rounded-md bg-muted/60" />
          <div className="h-72 animate-pulse rounded-md bg-muted/50" />
        </div>
      </div>
    );
  }

  if (department.error || !department.data) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center" role="alert">
        <Building2 className="mx-auto size-8 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Department unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {department.error?.message ?? "The Department could not be loaded."}
        </p>
        <Button
          className="mt-5"
          variant="outline"
          onClick={() => void department.refetch()}
        >
          Try again
        </Button>
      </section>
    );
  }

  const data = department.data;
  const remaining =
    data.hardBudgetUsd === null
      ? null
      : Math.max(0, data.hardBudgetUsd - data.allocatedBudgetUsd);
  const allocationPercent =
    data.hardBudgetUsd && data.hardBudgetUsd > 0
      ? Math.min(100, (data.allocatedBudgetUsd / data.hardBudgetUsd) * 100)
      : 0;
  const dirty =
    name !== data.name ||
    description !== (data.description ?? "") ||
    hardBudgetUsd !==
      (data.hardBudgetUsd === null ? "" : String(data.hardBudgetUsd));
  const budgetInvalid =
    hardBudgetUsd.trim() !== "" &&
    (!Number.isFinite(Number(hardBudgetUsd)) ||
      Number(hardBudgetUsd) < data.allocatedBudgetUsd);

  return (
    <div className="space-y-7">
      <PageHeader
        title={data.name}
        badge={<Badge variant="outline">Department Administrator</Badge>}
        description="An organizational container for Project ownership, aggregate budget, and inherited platform constraints. Business roles remain inside each Project."
        actions={
          <Button
            disabled={
              !dirty ||
              !validatedName.success ||
              budgetInvalid ||
              save.isPending
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Spinner /> : <Save />}
            Save changes
          </Button>
        }
      />

      <section
        className="grid border-y sm:grid-cols-3"
        aria-label="Department summary"
      >
        <SummaryFact
          icon={FolderKanban}
          label="Projects"
          value={String(data.projectCount)}
        />
        <SummaryFact
          icon={Users}
          label="Members"
          value={String(data.memberCount)}
        />
        <SummaryFact
          icon={CircleDollarSign}
          label="Allocated budget"
          value={money(data.allocatedBudgetUsd)}
        />
      </section>

      {save.isSuccess ? (
        <p
          className="border-l-2 border-emerald-500 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          Department settings saved. Project navigation now uses the updated
          name.
        </p>
      ) : null}
      {save.error ? (
        <p
          className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {save.error.message}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)] lg:items-start">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Organization profile</CardTitle>
            <CardDescription>
              Identity shown in the Project switcher and Department
              administration views.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 pt-1">
            <div className="grid gap-2">
              <Label htmlFor="department-name">Department name</Label>
              <Input
                id="department-name"
                className="h-11"
                value={name}
                maxLength={scopedEntityNameLimits.max}
                aria-invalid={Boolean(name) && !validatedName.success}
                onChange={(event) => {
                  setName(event.target.value);
                  save.reset();
                }}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {scopedEntityNameLimits.min}–{scopedEntityNameLimits.max} characters.
                Slashes, backslashes, and control characters are not allowed.
              </p>
              {name && !validatedName.success ? (
                <p className="text-xs text-destructive" role="alert">
                  {validatedName.error.issues[0]?.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="department-description">Description</Label>
              <Textarea
                id="department-description"
                value={description}
                maxLength={500}
                rows={5}
                onChange={(event) => {
                  setDescription(event.target.value);
                  save.reset();
                }}
                placeholder="Explain the organizational boundary this Department represents."
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/500 characters
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Budget boundary</CardTitle>
            <CardDescription>
              Department ceiling across all child Projects.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-1">
            <div className="grid gap-2">
              <Label htmlFor="department-budget">Hard budget (USD)</Label>
              <Input
                id="department-budget"
                className="h-11 font-mono tabular-nums"
                type="number"
                min={data.allocatedBudgetUsd}
                step="0.01"
                value={hardBudgetUsd}
                placeholder="Unlimited"
                onChange={(event) => {
                  setHardBudgetUsd(event.target.value);
                  save.reset();
                }}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Leave empty for no Department ceiling. Project allocations
                remain enforced independently.
              </p>
            </div>
            <div>
              <div className="flex justify-between gap-4 text-xs">
                <span className="text-muted-foreground">Allocated</span>
                <span className="font-mono tabular-nums">
                  {money(data.allocatedBudgetUsd)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${allocationPercent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between gap-4 text-xs">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-mono tabular-nums">
                  {remaining === null ? "Unlimited" : money(remaining)}
                </span>
              </div>
            </div>
            {budgetInvalid ? (
              <p
                className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-900"
                role="alert"
              >
                The ceiling cannot be lower than the amount already allocated to
                Projects.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Business authorization remains local to each Project.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.projects.length ? (
              <div className="divide-y">
                {data.projects.map((project) => (
                  <Link
                    key={project.id}
                    to="/$projectId"
                    params={{ projectId: project.id }}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <FolderKanban className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium">
                        {project.name}
                      </strong>
                      <span className="block text-xs text-muted-foreground">
                        {project.memberCount}{" "}
                        {project.memberCount === 1 ? "member" : "members"}
                        {project.hardBudgetUsd === null
                          ? " · No Project ceiling"
                          : ` · ${money(project.hardBudgetUsd)}`}
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No Projects belong to this Department yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Organizational membership only. Project Roles are assigned
              separately.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.members.length ? (
              <div className="divide-y">
                {data.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex min-h-14 items-center gap-3 px-4 py-3"
                  >
                    <AccountAvatar identity={member} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium">
                        {member.displayName}
                      </strong>
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                    <Badge
                      variant={
                        member.role === "administrator"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {member.role === "administrator"
                        ? "Department Administrator"
                        : "Member"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No active Department members.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-24 items-center gap-3 border-b px-1 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="mt-0.5 block font-mono text-lg font-semibold tabular-nums">
          {value}
        </strong>
      </span>
    </div>
  );
}
