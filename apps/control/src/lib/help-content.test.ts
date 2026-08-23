import { describe, expect, it } from "vitest";
import {
  getHelpRoute,
  getHelpTopics,
  helpTopicIds,
  isHelpTopicId,
} from "./help-content";

describe("help content", () => {
  it.each(["en-US", "zh-CN", "zh-TW"] as const)(
    "provides complete %s documentation for every topic",
    (language) => {
      const topics = getHelpTopics(language);
      expect(Object.keys(topics)).toEqual([...helpTopicIds]);

      for (const topicId of helpTopicIds) {
        const topic = topics[topicId];
        expect(topic.id).toBe(topicId);
        expect(topic.body).toMatch(/^# .+/);
        expect(topic.body).toMatch(/\n## .+/);
        expect(topic.body.length).toBeGreaterThan(300);
      }
    },
  );

  it("separates five role guides from two operations runbooks", () => {
    const topics = Object.values(getHelpTopics("en-US"));
    expect(topics.filter((topic) => topic.category === "role")).toHaveLength(5);
    expect(topics.filter((topic) => topic.category === "operations")).toHaveLength(2);
    expect(getHelpTopics("en-US").approver.preview).toBe(true);
    expect(
      topics
        .filter((topic) => topic.category === "operations")
        .every((topic) => topic.body.includes("~~~shell")),
    ).toBe(true);
  });

  it("maps only known Markdown links to Project routes", () => {
    expect(getHelpRoute("/__project__/setting")).toBe("/$projectId/setting");
    expect(getHelpRoute("/__project__")).toBe("/$projectId");
    expect(getHelpRoute("/__project__/unknown")).toBeNull();
    expect(getHelpRoute("https://example.com")).toBeNull();
  });

  it("accepts only known topic ids", () => {
    expect(isHelpTopicId("maintenance")).toBe(true);
    expect(isHelpTopicId("owner")).toBe(false);
    expect(isHelpTopicId(undefined)).toBe(false);
  });
});
