import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatPlatformDateTime } from "@/lib/platform-preferences";
import { cn } from "@/lib/utils";
import {
  getNotifications,
  markAllNotificationsRead,
  notificationsQueryKey,
  setNotificationRead,
  type NotificationSeverity,
} from "@/services/notifications";

export const Route = createFileRoute("/$projectId/notifications")({
  component: NotificationsPage,
});

const severityPresentation: Record<
  NotificationSeverity,
  { className: string; icon: LucideIcon }
> = {
  error: { className: "text-destructive", icon: CircleAlert },
  info: { className: "text-muted-foreground", icon: Info },
  success: { className: "text-emerald-700 dark:text-emerald-300", icon: CircleCheck },
  warning: { className: "text-amber-700 dark:text-amber-300", icon: TriangleAlert },
};

function NotificationsPage() {
  const queryClient = useQueryClient();
  const inbox = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: getNotifications,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      setNotificationRead(notificationId, true),
    onSuccess: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refresh,
  });
  const unreadCount = inbox.data?.unreadCount ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Account messages and actions that need your attention."
      />

      <Card className="max-w-4xl">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            Inbox
            {unreadCount ? <Badge variant="secondary">{unreadCount} unread</Badge> : null}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={!unreadCount || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {markAllRead.isPending ? <Spinner /> : <CheckCheck />}
            Mark all as read
          </Button>
        </CardHeader>
        <CardContent>
          {inbox.isPending ? (
            <div className="grid min-h-52 place-items-center">
              <Spinner />
              <span className="sr-only">Loading notifications…</span>
            </div>
          ) : inbox.error ? (
            <div
              role="alert"
              className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive"
            >
              {inbox.error.message}
            </div>
          ) : inbox.data.items.length ? (
            <ul className="divide-y border-y">
              {inbox.data.items.map((notification) => {
                const presentation = severityPresentation[notification.severity];
                const Icon = presentation.icon;
                const actionHref = notification.actionHref?.startsWith("/")
                  ? notification.actionHref
                  : null;
                return (
                  <li
                    key={notification.id}
                    className={cn(
                      "grid gap-3 px-1 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start",
                      !notification.readAt && "bg-muted/25",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 place-items-center",
                        presentation.className,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold">{notification.title}</h2>
                        {!notification.readAt ? (
                          <span className="size-1.5 rounded-full bg-primary" aria-label="Unread" />
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {notification.message}
                      </p>
                      <time
                        className="mt-2 block text-xs text-muted-foreground"
                        dateTime={notification.createdAt}
                      >
                        {formatPlatformDateTime(notification.createdAt)}
                      </time>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {actionHref ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={actionHref}
                            onClick={() => {
                              if (!notification.readAt) markRead.mutate(notification.id);
                            }}
                          >
                            View
                          </a>
                        </Button>
                      ) : null}
                      {!notification.readAt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={markRead.isPending}
                          onClick={() => markRead.mutate(notification.id)}
                        >
                          Mark as read
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="Account and Project messages will appear here."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
