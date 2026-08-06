import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

function cspDirective(policy: string, name: string) {
  return (
    policy
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive === name || directive.startsWith(`${name} `)) || ""
  );
}

describe("content security policy", () => {
  it("uses a nonce for production scripts without allowing inline or eval scripts", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "testNonce123+/=",
      isDevelopment: false,
    });
    const scriptSrc = cspDirective(policy, "script-src");

    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'nonce-testNonce123+/='");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("keeps required baseline CSP directives", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "testNonce123+/=",
      isDevelopment: false,
    });

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("connect-src 'self'");
  });
});
