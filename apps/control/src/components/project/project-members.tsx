import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, UserRound, UserX } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ProjectInviteDialog } from "@/components/project/project-invite-dialog";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import {
  getProjectMembers,
  removeMember,
} from "@/services/project";
import type { Project, ProjectMember } from "@/types/project";

function memberInitials(member: ProjectMember): string {
  return member.name
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function ProjectMembers({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const { refreshProjects } = useProject();
  const permissions = useProjectPermissions(project.role);
  const [inviteOpen, setInviteOpen] = useState(false);
  const members = useQuery({
    queryKey: ["project", project.id, "members"],
    queryFn: () => getProjectMembers(project.id),
  });
  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(project.id, memberId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["project", project.id, "members"],
        }),
        refreshProjects(),
      ]);
    },
  });

  return (
    <div>
      <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4">
        <div>
          <h2 className="text-sm font-semibold">Members</h2>
          <p className="text-xs text-muted-foreground">
            {project.memberCount}{" "}
            {project.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        {permissions.canInviteMembers ? (
          <Button className="h-10" size="sm" onClick={() => setInviteOpen(true)}>
            <Plus />
            Invite member
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">View only</span>
        )}
      </div>

      {members.isLoading ? (
        <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading members…
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
      ) : members.data?.length ? (
        <ul className="divide-y" aria-label={`${project.name} members`}>
          {members.data.map((member) => (
            <li
              key={member.id}
              className="flex min-h-[68px] items-center gap-3 px-4 py-2.5"
            >
              <Avatar className="size-9">
                <AvatarFallback className="bg-muted text-xs font-semibold">
                  {memberInitials(member)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <strong className="truncate text-sm">{member.name}</strong>
                  {member.status === "invited" ? (
                    <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      Invited
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {member.email}
                </span>
              </span>
              <span className="text-xs font-medium capitalize text-muted-foreground">
                {member.role}
              </span>
              {permissions.canManageProject ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Actions for ${member.name}`}
                    >
                      {remove.isPending &&
                      remove.variables === member.id ? (
                        <Spinner />
                      ) : (
                        <MoreHorizontal />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => remove.mutate(member.id)}
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
          ))}
        </ul>
      ) : (
        <div className="grid min-h-52 place-items-center p-8 text-center">
          <div>
            <UserRound className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No members found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Invite a teammate to start collaborating.
            </p>
          </div>
        </div>
      )}

      <ProjectInviteDialog
        project={project}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={async () => {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ["project", project.id, "members"],
            }),
            refreshProjects(),
          ]);
        }}
      />
    </div>
  );
}
