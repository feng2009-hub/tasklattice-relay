import type { PrismaClient, UserNotification } from "../generated/prisma/client";
import type { AuthPayload } from "../auth/auth";
import { prisma } from "../db/prisma";
import { ProjectService } from "../projects/project-service";

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

function serialize(notification: UserNotification): InAppNotification {
  return {
    actionHref: notification.actionHref,
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
    message: notification.message,
    readAt: notification.readAt?.toISOString() ?? null,
    severity: notification.severity as NotificationSeverity,
    title: notification.title,
  };
}

export class NotificationService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async list(auth: AuthPayload): Promise<NotificationInbox> {
    await new ProjectService(this.db).requireUser(auth);
    const [items, unreadCount] = await Promise.all([
      this.db.userNotification.findMany({
        where: { userId: auth.sub },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.db.userNotification.count({
        where: { userId: auth.sub, readAt: null },
      }),
    ]);
    return { items: items.map(serialize), unreadCount };
  }

  async create(input: {
    actionHref?: string;
    message: string;
    severity?: NotificationSeverity;
    title: string;
    userId: string;
  }): Promise<InAppNotification> {
    const notification = await this.db.userNotification.create({
      data: {
        actionHref: input.actionHref ?? null,
        message: input.message,
        severity: input.severity ?? "info",
        title: input.title,
        userId: input.userId,
      },
    });
    return serialize(notification);
  }

  async setRead(
    auth: AuthPayload,
    notificationId: string,
    read: boolean,
  ): Promise<InAppNotification> {
    await new ProjectService(this.db).requireUser(auth);
    const result = await this.db.userNotification.updateMany({
      where: { id: notificationId, userId: auth.sub },
      data: { readAt: read ? new Date() : null },
    });
    if (!result.count) throw new Error("Notification not found.");
    return serialize(
      await this.db.userNotification.findUniqueOrThrow({
        where: { id: notificationId },
      }),
    );
  }

  async markAllRead(auth: AuthPayload): Promise<{ updatedCount: number }> {
    await new ProjectService(this.db).requireUser(auth);
    const result = await this.db.userNotification.updateMany({
      where: { userId: auth.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }
}
