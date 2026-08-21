import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

interface BillingReturnState {
  version: 1;
  outcome: "success" | "cancel" | "portal";
  expiresAt: number;
  nonce: string;
}

function returnStateSecret(
  env: Record<string, string | undefined> = process.env
) {
  const secret = env.BILLING_RETURN_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Billing return state requires a secret of at least 32 characters.");
  }
  return secret;
}

function sign(encoded: string, env?: Record<string, string | undefined>) {
  return createHmac("sha256", returnStateSecret(env))
    .update(encoded)
    .digest("base64url");
}

export function createBillingReturnState(
  outcome: BillingReturnState["outcome"],
  options: {
    now?: number;
    env?: Record<string, string | undefined>;
  } = {}
) {
  const now = options.now || Date.now();
  const payload: BillingReturnState = {
    version: 1,
    outcome,
    expiresAt: now + 30 * 60 * 1000,
    nonce: randomBytes(24).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, options.env)}`;
}

export function verifyBillingReturnState(
  state: string,
  options: {
    now?: number;
    env?: Record<string, string | undefined>;
  } = {}
) {
  const [encoded, suppliedSignature, extra] = state.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  try {
    const expected = Buffer.from(sign(encoded, options.env), "base64url");
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    ) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<BillingReturnState>;
    if (
      payload.version !== 1 ||
      !["success", "cancel", "portal"].includes(payload.outcome || "") ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= (options.now || Date.now()) ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 24
    ) {
      return null;
    }
    return payload as BillingReturnState;
  } catch {
    return null;
  }
}
