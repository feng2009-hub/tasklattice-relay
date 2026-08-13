import { afterEach, describe, expect, it } from "vitest";
import type { AuthPayload } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { NotificationService } from "./notification-service";

const auth: AuthPayload = {
  exp: Number.MAX_SAFE_INTEGER,
  iat: 0,
  iss: "tali",
  sub: "local-admin",
  user: {
    displayName: "Local Administrator",
    email: "admin@tali.local",
    id: "local-admin",
    provider: "local",
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
      userId: auth.sub,
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
      userId: auth.sub,
    });
    await expect(
      service.setRead({ ...auth, sub: "missing-user" }, notification.id, true),
    ).rejects.toThrow();
  });
});
