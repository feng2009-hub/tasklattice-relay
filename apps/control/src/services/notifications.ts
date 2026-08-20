
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface InAppNotification {
  actionHref: string | null;
  createdAt: string;
  id: string;
  message: string;
  readAt: string | null;
  severity: NotificationSeverity;
  title: string;
}

export interface NotificationInbox {
  items: InAppNotification[];
  unreadCount: number;
}

export const notificationsQueryKey = ["notifications"] as const;

async function notificationRequest<T>(
  path = "/api/v1/notifications",
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & { detail?: string };
  if (!response.ok) {
    throw new Error(
      payload.detail ?? `Request failed (${response.status}).`,
    );
  }
  return payload;
}

export function getNotifications(): Promise<NotificationInbox> {
  return notificationRequest();
}

export function setNotificationRead(
  notificationId: string,
  read: boolean,
): Promise<InAppNotification> {
  return notificationRequest(`/api/v1/notifications/${notificationId}`, {
    body: JSON.stringify({ read }),
    method: "PATCH",
  });
}

export function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  return notificationRequest("/api/v1/notifications/read-all", {
    method: "POST",
  });
}
