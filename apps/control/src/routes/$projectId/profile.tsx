import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ProjectCapability } from "@tali/contracts";
import {
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  KeyRound,
  Languages,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { groupProjectCapabilities } from "@/features/account/permission-groups";
import { useProject } from "@/hooks/use-project";
import { switchProjectRole } from "@/services/project";
import {
  applyPlatformPreferences,
  detectedTimezone,
} from "@/lib/platform-preferences";
import { cn } from "@/lib/utils";
import { projectRoleLabels, type Project } from "@/types/project";
import {
  getPersonalProfile,
  personalProfileQueryKey,
  resetLocalPassword,
  updatePersonalProfile,
  type AccountLanguage,
  type ThemePreference,
} from "@/services/personal-profile";

export const Route = createFileRoute("/$projectId/profile")({
  validateSearch: (search): { section?: AccountSection } => {
    const section =
      search.section === "general" ||
      search.section === "access" ||
      search.section === "security"
        ? search.section
        : undefined;
    return section ? { section } : {};
  },
  component: MyAccountPage,
});

type AccountSection = "general" | "access" | "security";

const fallbackTimezones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

function getSupportedTimezones(): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }
  ).supportedValuesOf;
  const values = supportedValuesOf?.("timeZone") ?? fallbackTimezones;
  return Array.from(new Set(["UTC", detectedTimezone(), ...values])).sort();
}

function MyAccountPage() {
  const navigate = Route.useNavigate();
  const { section = "general" } = Route.useSearch();
  const queryClient = useQueryClient();
  const { availableProjects, currentProject, refreshProjects } = useProject();
  const profile = useQuery({
    queryKey: personalProfileQueryKey,
    queryFn: getPersonalProfile,
  });
  const [language, setLanguage] = useState<AccountLanguage>("en-US");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [now, setNow] = useState(() => new Date());
  const timezones = useMemo(getSupportedTimezones, []);

  useEffect(() => {
    if (!profile.data) return;
    setLanguage(profile.data.language);
    setTheme(profile.data.theme);
    setTimezone(profile.data.timezone);
  }, [profile.data]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const preferences = useMutation({
    mutationFn: () =>
      updatePersonalProfile({
        language,
        theme,
        timezone,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(personalProfileQueryKey, data);
      applyPlatformPreferences(data);
    },
  });

  const chooseTheme = (nextTheme: ThemePreference) => {
    setTheme(nextTheme);
    applyPlatformPreferences({ language, theme: nextTheme, timezone });
  };

  const chooseLanguage = (nextLanguage: AccountLanguage) => {
    setLanguage(nextLanguage);
    applyPlatformPreferences({ language: nextLanguage, theme, timezone });
  };

  const chooseTimezone = (nextTimezone: string) => {
    setTimezone(nextTimezone);
    applyPlatformPreferences({ language, theme, timezone: nextTimezone });
  };

  if (profile.isPending) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        <Spinner />
        <span className="sr-only">Loading My Account…</span>
      </div>
    );
  }

  if (profile.error || !profile.data) {
    return (
      <div
        role="alert"
        className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive"
      >
        {profile.error?.message ?? "My Account is unavailable."}
      </div>
    );
  }

  const current = profile.data;
  const dirty =
    language !== current.language ||
    theme !== current.theme ||
    timezone !== current.timezone;
  const localTime = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(now);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Manage your identity, access, security, and platform preferences."
      />

      <section className="overflow-hidden rounded-lg border bg-background">
        <Tabs
          value={section}
          onValueChange={(value) => {
            void navigate({
              replace: true,
              search: { section: value as AccountSection },
            });
          }}
        >
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto overflow-y-hidden px-2"
          >
            <TabsTrigger value="general" className="h-11">
              <CircleUserRound />
              General
            </TabsTrigger>
            <TabsTrigger value="access" className="h-11">
              <ShieldCheck />
              Access
            </TabsTrigger>
            <TabsTrigger value="security" className="h-11">
              <KeyRound />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-0">
            <div className="divide-y">
              <section className="flex min-h-28 flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <CircleUserRound className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-heading text-xl">
                      {current.displayName}
                    </h2>
                    <Badge variant="outline">
                      {current.provider === "sso"
                        ? "SSO account"
                        : "Local account"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {current.email || current.username}
                  </p>
                </div>
                <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1 text-sm sm:text-right">
                  <dt className="text-muted-foreground">Username</dt>
                  <dd className="font-medium">{current.username}</dd>
                  <dt className="text-muted-foreground">Projects</dt>
                  <dd className="font-medium">{availableProjects.length}</dd>
                </dl>
              </section>

              <form
                className="divide-y"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  if (dirty) preferences.mutate();
                }}
              >
                <PreferenceRow
                  title="Theme"
                  description="Choose how Relay appears on this device."
                >
                  <div className="grid max-w-xl gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["system", Monitor, "System"],
                        ["light", Sun, "Light"],
                        ["dark", Moon, "Dark"],
                      ] as const
                    ).map(([value, Icon, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={theme === value}
                        className={cn(
                          "flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/35",
                          theme === value &&
                            "border-primary/40 bg-primary/[0.07] text-primary",
                        )}
                        onClick={() => chooseTheme(value)}
                      >
                        <Icon className="size-4" />
                        <span>{label}</span>
                        {theme === value ? (
                          <Check className="ml-auto size-4" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </PreferenceRow>

                <PreferenceRow
                  title="Language"
                  description="Used for locale-aware dates and account messages."
                >
                  <div className="relative max-w-xl">
                    <Languages
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <select
                      id="account-language"
                      aria-label="Language"
                      className="flex h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      value={language}
                      onChange={(event) =>
                        chooseLanguage(event.target.value as AccountLanguage)
                      }
                    >
                      <option value="en-US">English (United States)</option>
                      <option value="zh-CN">简体中文</option>
                    </select>
                  </div>
                </PreferenceRow>

                <PreferenceRow
                  title="Local time zone"
                  description="Controls timestamps shown throughout Relay."
                >
                  <div className="max-w-xl space-y-2">
                    <select
                      id="account-timezone"
                      aria-label="Local time zone"
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      value={timezone}
                      onChange={(event) => chooseTimezone(event.target.value)}
                    >
                      {timezones.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      {localTime} · {timezone.replaceAll("_", " ")}
                    </p>
                  </div>
                </PreferenceRow>

                <div className="flex flex-wrap items-center gap-4 p-5 lg:pl-[18rem]">
                  <Button
                    className="h-11"
                    type="submit"
                    disabled={preferences.isPending || !dirty}
                  >
                    {preferences.isPending ? <Spinner /> : null}
                    Save preferences
                  </Button>
                  {preferences.error ? (
                    <p className="text-sm text-destructive" role="alert">
                      {preferences.error.message}
                    </p>
                  ) : null}
                  {preferences.isSuccess && !dirty ? (
                    <p
                      className="text-sm text-emerald-700 dark:text-emerald-300"
                      role="status"
                    >
                      Account preferences saved.
                    </p>
                  ) : null}
                </div>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="access" className="mt-0">
            {currentProject ? (
              <AccessPanel
                project={currentProject}
                systemRole={current.systemRole}
                onAccessChanged={refreshProjects}
              />
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                Select a Project to review account access.
              </p>
            )}
          </TabsContent>

          <TabsContent value="security" className="mt-0">
            <PasswordPanel provider={current.provider} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function PreferenceRow({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="grid gap-4 p-5 lg:grid-cols-[15rem_minmax(0,36rem)] lg:gap-8">
      <div>
        <h3 className="font-sans text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <div>{children}</div>
    </div>
  );
}

const projectRoleDescriptions = {
  admin:
    "Manage members, policies, models, routing, and Project configuration.",
  auditor: "Review Project behavior, risk, traces, and compliance evidence.",
  developer: "Build and operate Agent Instances and their assigned resources.",
  user: "Use assigned Agents and participate in personal sessions.",
  approver: "Review and decide governed change requests independently.",
} as const;

function AccessPanel({
  onAccessChanged,
  project,
  systemRole,
}: {
  onAccessChanged: () => Promise<Project[]>;
  project: Project;
  systemRole: "user" | "super_administrator";
}) {
  const roleSwitch = useMutation({
    mutationFn: (role: Project["assignedRoles"][number]) =>
      switchProjectRole(project.id, role),
    onSuccess: onAccessChanged,
  });
  const permissionGroups = groupProjectCapabilities(
    project.effectiveCapabilities,
  );

  return (
    <div id="access-permissions" className="divide-y">
      <section className="p-5">
        <div className="mb-5">
          <h2 className="font-heading text-lg">Account access</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            System identity and active access for the selected Project.
          </p>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:max-w-3xl">
          <div>
            <dt className="text-xs text-muted-foreground">System role</dt>
            <dd className="mt-1 font-medium">
              {systemRole === "super_administrator"
                ? "Super Administrator"
                : "User"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Current Project</dt>
            <dd className="mt-1 truncate font-medium">{project.name}</dd>
          </div>
        </dl>
      </section>

      <section className="p-5">
        <div className="max-w-5xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg">Assigned Project roles</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                One role is active at a time. Switch directly to any role
                assigned to this Account.
              </p>
            </div>
            <Badge variant="secondary">{project.assignedRoles.length}</Badge>
          </div>
          <div className="mt-3 divide-y rounded-md border">
            {project.assignedRoles.map((role) => {
              const current = role === project.activeRole;
              const switching =
                roleSwitch.isPending && roleSwitch.variables === role;
              return (
                <div
                  key={role}
                  className="flex min-h-16 items-center gap-3 px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      current ? "bg-emerald-500" : "bg-muted-foreground/30",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">
                      {projectRoleLabels[role]}
                    </strong>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {projectRoleDescriptions[role]}
                    </span>
                  </span>
                  {current ? (
                    <Badge variant="outline">Current</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={roleSwitch.isPending}
                      onClick={() => roleSwitch.mutate(role)}
                    >
                      {switching ? <Spinner /> : null}
                      Switch
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {roleSwitch.error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {roleSwitch.error.message}
            </p>
          ) : null}
        </div>
      </section>

      <section className="p-5">
        <div className="max-w-6xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg">Effective permissions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Granted by the active Project role and grouped by permission
                domain.
              </p>
            </div>
            <Badge variant="secondary">
              {project.effectiveCapabilities.length}
            </Badge>
          </div>
          {project.effectiveCapabilities.length ? (
            <div className="mt-4 space-y-2">
              {permissionGroups.map((group, index) => (
                <PermissionGroup
                  key={group.id}
                  defaultOpen={index === 0}
                  description={group.description}
                  items={group.items}
                  title={group.title}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No Project permissions are assigned to this account.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function PermissionGroup({
  defaultOpen,
  description,
  items,
  title,
}: {
  defaultOpen: boolean;
  description: string;
  items: readonly ProjectCapability[];
  title: string;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/permission overflow-hidden rounded-md border"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
        >
          <span className="min-w-0 flex-1">
            <strong className="block font-sans text-sm font-semibold">
              {title}
            </strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {description}
            </span>
          </span>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {items.length}
          </Badge>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/permission:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-x-6 gap-y-2 border-t bg-muted/15 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((capability) => (
            <li key={capability} className="flex min-w-0 items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
              <code className="break-all font-mono text-[11px] leading-5 text-foreground">
                {capability}
              </code>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PasswordPanel({ provider }: { provider: "local" | "sso" }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const reset = useMutation({
    mutationFn: () =>
      resetLocalPassword({
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  if (provider === "sso") {
    return (
      <section className="p-5">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <h2 className="font-heading text-lg">Password & security</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This is an SSO account. Password and sign-in security are managed by
            your identity provider.
          </p>
        </div>
      </section>
    );
  }

  const matches = newPassword === confirmPassword;
  const valid =
    currentPassword.length > 0 &&
    newPassword.length >= 12 &&
    matches &&
    currentPassword !== newPassword;

  return (
    <section className="p-5">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <h2 className="font-heading text-lg">Reset local password</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose at least 12 characters. The password is stored only as a bcrypt
          hash.
        </p>
        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) reset.mutate();
          }}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              autoComplete="current-password"
              className="h-11"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              autoComplete="new-password"
              className="h-11"
              minLength={12}
              maxLength={128}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              autoComplete="new-password"
              aria-invalid={Boolean(confirmPassword) && !matches}
              className="h-11"
              minLength={12}
              maxLength={128}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {confirmPassword && !matches ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              New passwords do not match.
            </p>
          ) : null}
          {reset.error ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {reset.error.message}
            </p>
          ) : null}
          {reset.isSuccess ? (
            <p
              className="text-sm text-emerald-700 dark:text-emerald-300 sm:col-span-2"
              role="status"
            >
              Password reset. Use the new password the next time you sign in.
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              className="h-11"
              type="submit"
              variant="outline"
              disabled={reset.isPending || !valid}
            >
              {reset.isPending ? <Spinner /> : <KeyRound />}
              Reset password
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
