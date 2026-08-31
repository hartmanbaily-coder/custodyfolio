import { describe, expect, it } from "vitest";
import { recordsSignupRoute } from "../src/lib/records/signupRouting";

describe("records signup routing", () => {
  it("opens public account creation when public signup is enabled", () => {
    expect(recordsSignupRoute("?mode=signup", true)).toEqual({
      invitedAttorney: false,
      openSignup: true,
    });
  });

  it("does not expose public account creation when public signup is disabled", () => {
    expect(recordsSignupRoute("?mode=signup", false)).toEqual({
      invitedAttorney: false,
      openSignup: false,
    });
  });

  it("preserves invited attorney account creation", () => {
    expect(
      recordsSignupRoute(
        "?mode=signup&next=%2Fattorney%2Faccept&invite=1",
        false
      )
    ).toEqual({ invitedAttorney: true, openSignup: true });
  });
});
