import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AccountAvatar,
  getAccountAvatarName,
} from "@/components/account/account-avatar";

describe("AccountAvatar", () => {
  it("uses the username as a stable cross-view identity", () => {
    expect(
      getAccountAvatarName({
        displayName: "Tali Operator",
        email: "operator@example.com",
        id: "user-123",
        username: "operator",
      }),
    ).toBe("operator");
  });

  it("renders an inline animated SVG without a remote image source", () => {
    const markup = renderToStaticMarkup(
      createElement(AccountAvatar, {
        identity: { username: "operator" },
        motion: "always",
      }),
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("mo-always");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain(" src=");
  });
});
