import { useEffect, useState, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import type { Agent } from "@tasklattice/contracts";
import { ExternalLink, Eye, Globe2, Pencil, SquareTerminal, Trash2, X } from "lucide-react";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";

function InstanceFacts({ instance }: { instance: Agent }) {
  const platform = getAgentPlatformPresentation(instance.agentPlatform);
  const facts = [
    { label: "Runtime", value: platform.runtimeName },
    { label: "Agent platform", value: platform.name },
    { label: "Model", value: instance.model },
    { label: "OpenShell Sandbox", value: instance.sandboxName },
    { label: "Observed", value: instance.runtimePhase ?? instance.status },
    { label: "Provider", value: instance.providerName },
    { label: "Model", value: instance.model },
  ];

  return (
    <dl className="text-xs">
      {facts.map(({ label, value }) => (
        <div key={label} className="flex min-h-12 items-center justify-between gap-4 border-b">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="max-w-[68%] break-all text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InstanceActions({ instance }: { instance: Agent }) {
  const platform = getAgentPlatformPresentation(instance.agentPlatform);
  const endpointReady = instance.httpEndpoint?.status === "READY" && Boolean(instance.httpEndpoint.url);

  return (
    <div className="mt-6 grid gap-2">
      {endpointReady && instance.httpEndpoint?.url ? (
        <Button asChild className="h-11">
          <a href={instance.httpEndpoint.url} target="_blank" rel="noreferrer">
            <Globe2 /> Open {platform.endpointLabel} <ExternalLink className="ml-auto" />
          </a>
        </Button>
      ) : (
        <>
          <Button variant="outline" className="h-11" disabled><Globe2 /> {platform.endpointLabel}</Button>
          <p className="text-xs leading-5 text-muted-foreground">
            {instance.status === "READY"
              ? instance.httpEndpoint?.reason ?? `OpenShell has not published the ${platform.endpointLabel} yet.`
              : `The ${platform.endpointLabel} becomes available when this Instance is Ready.`}
          </p>
        </>
      )}
      <Button asChild variant="outline" className="h-11">
        <Link to="/agents/$agentId" params={{ agentId: instance.id }} hash="terminal"><SquareTerminal /> Open terminal</Link>
      </Button>
      <Button asChild variant="outline" className="h-11">
        <Link to="/agents/$agentId" params={{ agentId: instance.id }}><Eye /> View full detail</Link>
      </Button>
      <Button variant="outline" className="h-11" disabled><Pencil /> Update Instance</Button>
      <p className="text-xs leading-5 text-muted-foreground">Update remains disabled until the runtime API can reconcile an edited Agent revision.</p>
    </div>
  );
}

function DeleteInstanceAction({
  confirming,
  deleting,
  onCancel,
  onConfirm,
  onRequest,
}: {
  confirming: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRequest: () => void;
}) {
  return confirming ? (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" className="h-11" disabled={deleting} onClick={onCancel}>Cancel</Button>
      <Button variant="destructive" className="h-11" disabled={deleting} onClick={onConfirm}>
        <Trash2 /> {deleting ? "Deleting…" : "Confirm delete"}
      </Button>
    </div>
  ) : (
    <Button variant="destructive" className="h-11 w-full" onClick={onRequest}><Trash2 /> Delete Instance</Button>
  );
}

export function InstanceDetailDrawer({
  deleting,
  deleteError,
  instance,
  onClose,
  onDelete,
  returnFocusRef,
}: {
  deleting: boolean;
  deleteError?: string;
  instance?: Agent;
  onClose: () => void;
  onDelete: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => setConfirmingDelete(false), [instance?.id]);

  return (
    <Drawer
      open={Boolean(instance)}
      direction={desktop ? "right" : "bottom"}
      dismissible={!deleting}
      autoFocus
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <DrawerContent
        aria-label="Instance actions"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        {desktop ? null : <DrawerHandle />}
        {instance ? (
          <>
            <DrawerHeader className="relative border-b pr-16">
              <div className="flex items-center gap-2">
                <AgentStatusBadge status={instance.status} />
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Instance actions</span>
              </div>
              <DrawerTitle className="mt-2 truncate text-lg">{instance.name}</DrawerTitle>
              <DrawerDescription className="truncate font-mono text-xs">{instance.id}</DrawerDescription>
              <DrawerClose asChild>
                <button
                  type="button"
                  disabled={deleting}
                  className="absolute right-3 top-3 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 disabled:opacity-50"
                  aria-label="Close Instance actions"
                >
                  <X className="size-5" />
                </button>
              </DrawerClose>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto p-5">
              <InstanceFacts instance={instance} />
              <InstanceActions instance={instance} />
              {confirmingDelete ? (
                <div role="alert" className="mt-6 border-l-2 border-destructive bg-destructive/5 px-3 py-3 text-xs">
                  Deleting this Instance also destroys its OpenShell Sandbox. This action cannot be undone.
                </div>
              ) : null}
              {deleteError ? <p role="alert" className="mt-3 text-xs text-destructive">{deleteError}</p> : null}
            </div>

            <DrawerFooter>
              <DeleteInstanceAction
                confirming={confirmingDelete}
                deleting={deleting}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={onDelete}
                onRequest={() => setConfirmingDelete(true)}
              />
              <p className="mt-3 text-center text-[11px] text-muted-foreground">Swipe or press ESC to close</p>
            </DrawerFooter>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
