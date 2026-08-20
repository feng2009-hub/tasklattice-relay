import { Navigate, createFileRoute } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getStoredProjectId } from "@/lib/project-storage";

export const Route = createFileRoute("/")({ component: ControlEntry });

function ControlEntry() {
  const { loading, user } = useAuth();
  const projectId = getStoredProjectId() ?? "proj1";

  if (loading) {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-6 text-foreground">
        <div className="flex flex-col items-center gap-6 text-center">
          <BrandLogo animated />
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading control plane…
          </p>
        </div>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <Navigate to="/$projectId" params={{ projectId }} replace />
  );
}
