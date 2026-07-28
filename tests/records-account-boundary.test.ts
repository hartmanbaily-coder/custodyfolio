import { describe, expect, it } from "vitest";
import {
  datasetAccountId,
  defaultCaseIdForUser,
} from "@/lib/records/accountBoundary";
import { createEmptyRecordsDatasetForUser } from "@/lib/records/seed";

describe("records account boundary", () => {
  it("creates different default case IDs for different accounts", () => {
    const firstUserId = "11111111-1111-4111-8111-111111111111";
    const secondUserId = "22222222-2222-4222-8222-222222222222";

    expect(defaultCaseIdForUser(firstUserId)).not.toBe(defaultCaseIdForUser(secondUserId));
    expect(createEmptyRecordsDatasetForUser(firstUserId, "first@example.test", "UTC").matters[0].id)
      .toBe(defaultCaseIdForUser(firstUserId));
    expect(createEmptyRecordsDatasetForUser(secondUserId, "second@example.test", "UTC").matters[0].id)
      .toBe(defaultCaseIdForUser(secondUserId));
  });

  it("requires a persisted dataset to identify exactly one account", () => {
    const dataset = createEmptyRecordsDatasetForUser(
      "11111111-1111-4111-8111-111111111111",
      "first@example.test",
      "UTC"
    );
    expect(datasetAccountId(dataset)).toBe(dataset.users[0].userId);

    dataset.users = [];
    expect(() => datasetAccountId(dataset)).toThrow(
      "Cloud records must contain exactly one account profile."
    );
  });
});
