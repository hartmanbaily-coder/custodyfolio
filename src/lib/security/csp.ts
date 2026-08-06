interface ContentSecurityPolicyOptions {
  nonce: string;
  isDevelopment?: boolean;
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment = process.env.NODE_ENV !== "production",
}: ContentSecurityPolicyOptions) {
  const scriptSrc = [
    "script-src",
    "'self'",
    `'nonce-${nonce}'`,
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc.join(" "),
    "connect-src 'self'",
  ].join("; ");
}
