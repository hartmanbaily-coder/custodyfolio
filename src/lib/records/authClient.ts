export type RecordsAuthFragment =
  | { kind: "none" }
  | { kind: "confirmation" }
  | {
      kind: "attorney_invite";
      accessToken: string;
      refreshToken: string;
      expiresIn: string | null;
    }
  | {
      kind: "recovery";
      accessToken: string;
      refreshToken: string;
      expiresIn: string | null;
    }
  | { kind: "error" };

const confirmationTypes = new Set(["email", "signup"]);
const attorneyInviteTypes = new Set(["invite", "magiclink"]);

export function parseRecordsAuthFragment(
  rawHash: string,
  authState: string | null
): RecordsAuthFragment {
  const hash = new URLSearchParams(rawHash.replace(/^#/, ""));
  if (hash.has("error") || hash.has("error_description")) return { kind: "error" };

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (!accessToken && !refreshToken) return { kind: "none" };
  if (!accessToken || !refreshToken) return { kind: "error" };

  const type = hash.get("type")?.toLowerCase() || "";
  if (
    authState === "attorney-invite" &&
    (attorneyInviteTypes.has(type) || !type)
  ) {
    return {
      kind: "attorney_invite",
      accessToken,
      refreshToken,
      expiresIn: hash.get("expires_in"),
    };
  }

  if (type === "recovery" || (!type && authState === "recovery")) {
    return {
      kind: "recovery",
      accessToken,
      refreshToken,
      expiresIn: hash.get("expires_in"),
    };
  }

  if (confirmationTypes.has(type) || (!type && authState === "confirmed")) {
    return { kind: "confirmation" };
  }

  return { kind: "error" };
}

export function isExplicitAttorneyInviteCallback(
  rawSearch: string,
  rawHash: string
) {
  const params = new URLSearchParams(rawSearch);
  if (params.get("auth") !== "attorney-invite") return false;

  return parseRecordsAuthFragment(rawHash, "attorney-invite").kind === "attorney_invite";
}
