import { Blobatar } from "@blobatar/react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type AccountIdentity = {
  displayName?: string | null;
  email?: string | null;
  id?: string | null;
  name?: string | null;
  username?: string | null;
};

type AccountAvatarProps = {
  className?: string;
  identity: AccountIdentity | null | undefined;
  motion?: "always" | "hover";
};

export function getAccountAvatarName(
  identity: AccountIdentity | null | undefined,
): string {
  const candidates = [
    identity?.username,
    identity?.email,
    identity?.id,
    identity?.displayName,
    identity?.name,
  ];
  return (
    candidates.find(
      (candidate): candidate is string => Boolean(candidate?.trim()),
    ) ?? "TaskLattice account"
  );
}

export function AccountAvatar({
  className,
  identity,
  motion = "hover",
}: AccountAvatarProps) {
  return (
    <Avatar
      data-slot="account-avatar"
      className={cn("bg-muted/50 ring-1 ring-border", className)}
    >
      <Blobatar
        name={getAccountAvatarName(identity)}
        animate={motion}
        className="size-full"
      />
    </Avatar>
  );
}
