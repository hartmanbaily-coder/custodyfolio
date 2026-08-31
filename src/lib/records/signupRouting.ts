export function recordsSignupRoute(search: string, publicSignupsEnabled: boolean) {
  const params = new URLSearchParams(search);
  const invitedAttorney =
    params.get("next") === "/attorney/accept" &&
    params.get("invite") === "1";
  const signupRequested = params.get("mode") === "signup";

  return {
    invitedAttorney,
    openSignup:
      signupRequested && (invitedAttorney || publicSignupsEnabled),
  };
}
