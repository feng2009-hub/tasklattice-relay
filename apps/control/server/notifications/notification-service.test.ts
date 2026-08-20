import { afterEach, describe, expect, it } from "vitest";
import type { PlatformPrincipal } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { NotificationService } from "./notification-service";

const auth: PlatformPrincipal = {
  user: {
    displayName: "Local Administrator",
    email: "admin@tali.local",
    id: "local-admin",
    hasPassword: true,
    systemRole: "super_administrator",
    username: "admin",
  },
};

describe("NotificationService", () => {
  const db = createTestPrisma();
  const service = new NotificationService(db);

  afterEach(async () => {
    await db.userNotification.deleteMany();
  });

  it("lists only the signed-in user's notifications and tracks unread state", async () => {
    const notification = await service.create({
      message: "A Runtime Policy needs review.",
      title: "Policy review",
      userId: auth.user.id,
    });

    await expect(service.list(auth)).resolves.toMatchObject({
      items: [{ id: notification.id, readAt: null }],
      unreadCount: 1,
    });

    await service.setRead(auth, notification.id, true);
    await expect(service.list(auth)).resolves.toMatchObject({
      items: [{ id: notification.id, readAt: expect.any(String) }],
      unreadCount: 0,
    });
  });

  it("does not allow one user to change another user's notification", async () => {
    const notification = await service.create({
      message: "System message",
      title: "Notice",
      userId: auth.user.id,
    });
    await expect(
      service.setRead(
        { user: { ...auth.user, id: "missing-user" } },
        notification.id,
        true,
      ),
    ).rejects.toThrow();
  });
});
