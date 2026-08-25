import { describe, expect, it } from "vitest";

import {
  attorneyFeatureMayRun,
  attorneyLegalClausesStatus,
  billingFeatureMayRun,
  billingLegalClausesAreOperative,
  billingLegalClausesStatus,
  publicLegalClausesAreOperative,
} from "@/lib/legalRelease";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";

describe("public legal release gate", () => {
  it("keeps production billing and attorney access closed pending explicit review", () => {
    expect(billingLegalClausesStatus).toBe(
      "feature_disabled_pending_review"
    );
    expect(billingLegalClausesAreOperative()).toBe(false);
    expect(billingFeatureMayRun({ NODE_ENV: "production" })).toBe(false);
    expect(attorneyLegalClausesStatus).toBe(
      "feature_disabled_pending_review"
    );
    expect(attorneyFeatureMayRun({ NODE_ENV: "production" })).toBe(false);
    expect(
      publicLegalClausesAreOperative({ ATTORNEY_GUEST_FEATURE_ENABLED: "false" })
    ).toBe(false);
    expect(
      publicLegalClausesAreOperative({ ATTORNEY_GUEST_FEATURE_ENABLED: "true" })
    ).toBe(false);
    expect(
      checkAttorneyGuestEntitlement("synthetic-owner", {
        NODE_ENV: "production",
        ATTORNEY_GUEST_FEATURE_ENABLED: "true",
      })
    ).toEqual({
      allowed: false,
      reason:
        "Attorney guest access is unavailable until the published terms are operative.",
    });
    expect(
      checkAttorneyGuestEntitlement("synthetic-owner", {
        NODE_ENV: "production",
        ATTORNEY_GUEST_FEATURE_ENABLED: "false",
      })
    ).toEqual({
      allowed: false,
      reason: "Attorney guest access is not enabled for this account.",
    });
  });

  it("retains non-production synthetic testing", () => {
    expect(attorneyFeatureMayRun({ NODE_ENV: "test" })).toBe(true);
    expect(
      checkAttorneyGuestEntitlement("synthetic-owner", {
        NODE_ENV: "test",
        ATTORNEY_GUEST_FEATURE_ENABLED: "true",
      })
    ).toEqual({ allowed: true });
  });
});
