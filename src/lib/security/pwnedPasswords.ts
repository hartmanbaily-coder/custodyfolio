import { createHash } from "node:crypto";

const pwnedPasswordsRangeUrl = "https://api.pwnedpasswords.com/range";
const defaultTimeoutMs = 5_000;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type PwnedPasswordResult =
  | { status: "safe" }
  | { status: "compromised"; occurrenceCount: number }
  | { status: "unavailable" };

export function isPwnedPasswordCheckEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.PWNED_PASSWORD_CHECK_ENABLED === "true";
}

export async function checkPwnedPassword(
  password: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): Promise<PwnedPasswordResult> {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const fetchImpl = options.fetchImpl || fetch;
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    options.timeoutMs ?? defaultTimeoutMs
  );

  try {
    const response = await fetchImpl(`${pwnedPasswordsRangeUrl}/${prefix}`, {
      method: "GET",
      headers: {
        Accept: "text/plain",
        "Add-Padding": "true",
        "User-Agent": "CustodyFolio-Records/1.0",
      },
      cache: "no-store",
      signal: abortController.signal,
    });

    if (!response.ok) return { status: "unavailable" };

    const lines = (await response.text()).split(/\r?\n/);
    for (const line of lines) {
      const [candidateSuffix, rawCount] = line.trim().split(":", 2);
      if (candidateSuffix?.toUpperCase() !== suffix) continue;

      const occurrenceCount = Number(rawCount || 0);
      if (Number.isFinite(occurrenceCount) && occurrenceCount > 0) {
        return { status: "compromised", occurrenceCount };
      }
    }

    return { status: "safe" };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
