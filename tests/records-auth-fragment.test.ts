import { describe, expect, it } from "vitest";
import {
  isExplicitAttorneyInviteCallback,
  parseRecordsAuthFragment,
} from "@/lib/records/authClient";

describe("records auth URL fragments", () => {
  it("accepts recovery tokens only for a recovery callback", () => {
    expect(
      parseRecordsAuthFragment(
        "#access_token=access-value&refresh_token=refresh-value&type=recovery&expires_in=3600",
        "recovery"
      )
    ).toEqual({
      kind: "recovery",
      accessToken: "access-value",
      refreshToken: "refresh-value",
      expiresIn: "3600",
    });
  });

  it("does not turn signup confirmation tokens into a recovery session", () => {
    expect(
      parseRecordsAuthFragment(
        "#access_token=access-value&refresh_token=refresh-value&type=signup",
        "confirmed"
      )
    ).toEqual({ kind: "confirmation" });
  });

  it("accepts invite and magic-link sessions only on attorney onboarding callbacks", () => {
    expect(
      parseRecordsAuthFragment(
        "#access_token=access-value&refresh_token=refresh-value&type=invite&expires_in=3600",
        "attorney-invite"
      )
    ).toEqual({
      kind: "attorney_invite",
      accessToken: "access-value",
      refreshToken: "refresh-value",
      expiresIn: "3600",
    });
    expect(
      parseRecordsAuthFragment(
        "#access_token=access-value&refresh_token=refresh-value&type=magiclink",
        "attorney-invite"
      )
    ).toMatchObject({ kind: "attorney_invite" });
  });

  it("rejects incomplete and unknown token fragments", () => {
    expect(parseRecordsAuthFragment("#access_token=access-value&type=recovery", "recovery")).toEqual({
      kind: "error",
    });
    expect(
      parseRecordsAuthFragment(
        "#access_token=access-value&refresh_token=refresh-value&type=magiclink",
        null
      )
    ).toEqual({ kind: "error" });
  });

  it("leaves ordinary records URLs alone", () => {
    expect(parseRecordsAuthFragment("", null)).toEqual({ kind: "none" });
  });

  it("recognizes the attorney email callback without a separate attorney token query parameter", () => {
    expect(
      isExplicitAttorneyInviteCallback(
        "?auth=attorney-invite",
        "#access_token=access-value&refresh_token=refresh-value&type=invite&expires_in=3600"
      )
    ).toBe(true);
    expect(
      isExplicitAttorneyInviteCallback(
        "?auth=attorney-invite",
        "#access_token=access-value&refresh_token=refresh-value&type=magiclink"
      )
    ).toBe(true);
  });

  it("does not treat ordinary or incomplete URLs as attorney email callbacks", () => {
    expect(
      isExplicitAttorneyInviteCallback(
        "",
        "#access_token=access-value&refresh_token=refresh-value&type=invite"
      )
    ).toBe(false);
    expect(
      isExplicitAttorneyInviteCallback(
        "?auth=attorney-invite",
        "#access_token=access-value&type=invite"
      )
    ).toBe(false);
  });
});
