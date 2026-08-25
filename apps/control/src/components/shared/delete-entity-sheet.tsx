import { useEffect, useId, useState, type ReactNode } from "react";
import { AlertTriangle, Database, LoaderCircle, Trash2 } from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteEntitySheet({
  blocked = false,
  blockedAction,
  blockedActionLabel = "Review dependencies",
  children,
  confirmLabel,
  deleting,
  description,
  entityName,
  error,
  onConfirm,
  onOpenChange,
  open,
  pendingLabel = "Deleting…",
  retentionDescription = "The business record is marked as deleted and retained for history. It disappears from active views immediately.",
  title,
}: {
  blocked?: boolean;
  blockedAction?: () => void;
  blockedActionLabel?: string;
  children?: ReactNode;
  confirmLabel: string;
  deleting: boolean;
  description: ReactNode;
  entityName: string;
  error?: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pendingLabel?: string;
  retentionDescription?: ReactNode;
  title: ReactNode;
}) {
  const inputId = useId();
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!open) setConfirmation("");
  }, [open]);

  const confirmed = confirmation === entityName;
  const close = () => {
    if (!deleting) onOpenChange(false);
  };

  return (
    <EntitySheet
      open={open}
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
      eyebrow={blocked ? "Deletion blocked" : "Confirm deletion"}
      title={(
        <span className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4.5" />
          </span>
          {title}
        </span>
      )}
      description={description}
      width="md"
      footer={(
        <>
          <Button type="button" variant="outline" disabled={deleting} onClick={close}>
            Cancel
          </Button>
          {blocked ? (
            blockedAction ? (
              <Button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  blockedAction();
                }}
              >
                {blockedActionLabel}
              </Button>
            ) : null
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmed || deleting}
              onClick={onConfirm}
            >
              {deleting ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 />
              )}
              {deleting ? pendingLabel : confirmLabel}
            </Button>
          )}
        </>
      )}
    >
      <div className="space-y-5">
        {children}
        {!blocked ? (
          <>
            <div className="flex gap-3 border-l-2 border-primary bg-primary/5 px-4 py-3">
              <Database className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs leading-5 text-muted-foreground">
                {retentionDescription}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={inputId}>
                Type <strong>{entityName}</strong> to confirm.
              </Label>
              <Input
                id={inputId}
                className="h-11"
                value={confirmation}
                disabled={deleting}
                autoComplete="off"
                autoFocus
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          </>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </EntitySheet>
  );
}
