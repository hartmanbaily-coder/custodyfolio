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
  it("allows production billing and attorney access after operator approval", () => {
    expect(billingLegalClausesStatus).toBe("operative");
    expect(billingLegalClausesAreOperative()).toBe(true);
    expect(billingFeatureMayRun({ NODE_ENV: "production" })).toBe(true);
    expect(attorneyLegalClausesStatus).toBe("operative");
    expect(attorneyFeatureMayRun({ NODE_ENV: "production" })).toBe(true);
    expect(
      publicLegalClausesAreOperative({ ATTORNEY_GUEST_FEATURE_ENABLED: "false" })
    ).toBe(true);
    expect(
      publicLegalClausesAreOperative({ ATTORNEY_GUEST_FEATURE_ENABLED: "true" })
    ).toBe(true);
    expect(
      checkAttorneyGuestEntitlement("synthetic-owner", {
        NODE_ENV: "production",
        ATTORNEY_GUEST_FEATURE_ENABLED: "true",
      })
    ).toEqual({ allowed: true });
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
