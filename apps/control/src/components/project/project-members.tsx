import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  UserPlus,
  UserRound,
  UserX,
} from "lucide-react";
import { AccountAvatar } from "@/components/account/account-avatar";
import { ProjectInviteDialog } from "@/components/project/project-invite-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useProject } from "@/hooks/use-project";
import { permissionsForCapabilities } from "@/hooks/use-project-permissions";
import {
  getProjectMembers,
  removeMember,
} from "@/services/project";
import {
  projectRoleLabels,
  type Project,
} from "@/types/project";

export function ProjectMembers({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const { refreshProjects } = useProject();
  const permissions = permissionsForCapabilities(
    project.effectiveCapabilities,
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const members = useQuery({
    queryKey: ["project", project.id, "members"],
    queryFn: () => getProjectMembers(project.id),
  });

  const refreshTeam = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["project", project.id, "members"],
      }),
      refreshProjects(),
    ]);
  };

  const removeHuman = useMutation({
    mutationFn: (memberId: string) => removeMember(project.id, memberId),
    onSuccess: refreshTeam,
  });

  const people = members.data ?? [];

  return (
    <div>
      <div className="flex min-h-16 flex-col justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold">Human members</h2>
          <p className="text-xs text-muted-foreground">
            {members.isLoading
              ? "Loading members…"
              : `${people.length} ${people.length === 1 ? "person" : "people"} with Project access`}
          </p>
        </div>
        {permissions.canInviteMembers && permissions.canAssignRoles ? (
          <Button
            className="h-11"
            size="sm"
            variant="outline"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus />
            Invite person
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">View only</span>
        )}
      </div>

      {members.isLoading ? (
        <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading human members…
        </div>
      ) : members.isError ? (
        <div className="m-4 border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          <p>{members.error.message}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void members.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : people.length ? (
        <ul className="divide-y" aria-label={`${project.name} human members`}>
          {people.map((member) => {
            const pending =
              removeHuman.isPending && removeHuman.variables === member.id;

            return (
              <li
                key={member.id}
                className="flex min-h-[72px] items-center gap-3 px-4 py-2.5"
              >
                <AccountAvatar identity={member} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-sm">{member.name}</strong>
                    {member.status === "invited" ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/25 bg-amber-500/8 text-[10px] text-amber-800 dark:text-amber-300"
                      >
                        Invited
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {member.email}
                  </span>
                </span>
                <span className="hidden max-w-72 flex-wrap justify-end gap-1 sm:flex">
                  {member.roles.map((role) => (
                    <Badge key={role} variant="outline" className="text-[10px]">
                      {projectRoleLabels[role]}
                      {member.activeRole === role ? " · current" : ""}
                    </Badge>
                  ))}
                </span>
                {permissions.canRemoveMembers ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Actions for ${member.name}`}
                      >
                        {pending ? <Spinner /> : <MoreHorizontal />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => removeHuman.mutate(member.id)}
                      >
                        <UserX />
                        Remove member
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="w-9" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid min-h-52 place-items-center p-8 text-center">
          <div>
            <UserRound className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No human members found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Invite a person to grant access to this Project.
            </p>
          </div>
        </div>
      )}

      {removeHuman.error ? (
        <p
          className="m-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {removeHuman.error.message}
        </p>
      ) : null}

      <ProjectInviteDialog
        canAssignRoles={permissions.canAssignRoles}
        project={project}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={refreshTeam}
      />
    </div>
  );
}
