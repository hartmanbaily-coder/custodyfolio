export const attorneyInvitationDurationDays = 7;

const dayMs = 24 * 60 * 60 * 1000;

export const attorneyInvitationDurationMs = attorneyInvitationDurationDays * dayMs;
export const attorneyAcceptanceCookieMaxAge = attorneyInvitationDurationDays * 24 * 60 * 60;
export const attorneyOnboardingEmailDurationMs = 60 * 60 * 1000;
export const maxBrowserTimeoutMs = 2_147_000_000;
