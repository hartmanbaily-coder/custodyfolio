import { readFile } from "node:fs/promises";
import type Stripe from "stripe";
import { Status, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applePlanInterval,
  mapAppleSubscription,
} from "@/lib/billing/apple";
import {
  deletedBillingUserHash,
  stripeSubscriptionNeedsCancellation,
} from "@/lib/billing/accountDeletion";
import {
  assertBillingCheckoutMode,
  assertBillingCheckoutModeForUser,
  assertBillingProviderMode,
  billingCheckoutEnabled,
  billingCheckoutEnabledForUser,
  billingPurchaseEnabledForUser,
  billingMode,
  configuredGracePeriodDays,
  configuredStaleToleranceHours,
  webPriceCatalog,
} from "@/lib/billing/config";
import { capabilitiesForEntitlementMode } from "@/lib/billing/policy";
import { evaluateLiveBillingReadiness } from "@/lib/billing/readiness";
import {
  createBillingReturnState,
  verifyBillingReturnState,
} from "@/lib/billing/returnState";
import {
  latestStripeInvoiceFullyRefunded,
  mapStripeSubscription,
  protectStripeRestrictionOrdering,
  stripeApiKeyMatchesMode,
} from "@/lib/billing/stripe";
import { createEmptyRecordsDatasetForUser, demoUserId } from "@/lib/records/seed";
import { planExportOnlyDatasetMutation } from "@/lib/records/datasetMutation";
import type { ProductionReadinessReport } from "@/lib/production/readiness";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stripeSubscription(
  status: Stripe.Subscription.Status,
  overrides: Partial<Stripe.Subscription> = {}
) {
  return {
    id: "sub_test_123",
    status,
    customer: "cus_test_123",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    items: {
      data: [
        {
          current_period_start: 1_788_000_000,
          current_period_end: 1_790_592_000,
          price: {
            id: "price_test_monthly",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function appleTransaction(
  overrides: Partial<JWSTransactionDecodedPayload> = {}
): JWSTransactionDecodedPayload {
  return {
    originalTransactionId: "100000000000001",
    transactionId: "100000000000002",
    productId: "io.custodyfolio.subscription.monthly",
    purchaseDate: Date.parse("2026-08-01T00:00:00.000Z"),
    expiresDate: Date.parse("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("billing capability policy", () => {
  it.each(["trial", "active", "grace_period"] as const)(
    "provides the complete tier for %s",
    (mode) => {
      expect(Object.values(capabilitiesForEntitlementMode(mode))).not.toContain(false);
    }
  );

  it("keeps all privacy, export, download, and attorney-revocation actions in export-only mode", () => {
    const capabilities = capabilitiesForEntitlementMode("export_only");
    expect(capabilities).toMatchObject({
      "records:read": true,
      "records:write": false,
      "records:delete": true,
      "evidence:download": true,
      "evidence:upload": false,
      "evidence:delete": true,
      "exports:create": true,
      "attorney:read": true,
      "attorney:invite": false,
      "attorney:revoke": true,
      "billing:manage": true,
      "account:delete": true,
    });
  });

  it("defaults unknown billing configuration to disabled and bounds tolerance values", () => {
    expect(billingMode({})).toBe("disabled");
    expect(billingMode({ BILLING_MODE: "unexpected" })).toBe("disabled");
    expect(billingCheckoutEnabled({ BILLING_MODE: "test" })).toBe(false);
    expect(
      billingCheckoutEnabled({
        BILLING_MODE: "test",
        BILLING_CHECKOUT_ENABLED: "true",
      })
    ).toBe(true);
    expect(assertBillingProviderMode({ BILLING_MODE: "live" })).toBe("live");
    expect(() =>
      assertBillingCheckoutMode({
        BILLING_MODE: "test",
        BILLING_CHECKOUT_ENABLED: "false",
      })
    ).toThrow("checkout is disabled");
    const canaryUserId = "724f81aa-b6d1-4b8a-ab59-aec5fe29e7ea";
    const canaryEnv = {
      BILLING_MODE: "live",
      BILLING_CHECKOUT_ENABLED: "false",
      BILLING_LIVE_CANARY_AUTHORIZED: "true",
      BILLING_LIVE_CANARY_USER_ID: canaryUserId,
      BILLING_LIVE_CANARY_EXPIRES_AT: "2026-08-14T21:00:00.000Z",
    };
    const canaryNow = new Date("2026-08-14T20:00:00.000Z");
    expect(billingCheckoutEnabledForUser(canaryUserId, canaryEnv, canaryNow)).toBe(true);
    expect(() =>
      assertBillingCheckoutModeForUser(canaryUserId, canaryEnv, canaryNow)
    ).toThrow("Live billing readiness failed");
    expect(
      billingPurchaseEnabledForUser(
        canaryUserId,
        { nativeIos: true },
        {
          BILLING_MODE: "live",
          BILLING_CHECKOUT_ENABLED: "false",
          APPLE_PURCHASE_ENABLED: "true",
        },
        canaryNow
      )
    ).toBe(true);
    expect(
      billingPurchaseEnabledForUser(
        canaryUserId,
        { nativeIos: true },
        { BILLING_MODE: "live", APPLE_PURCHASE_ENABLED: "false" },
        canaryNow
      )
    ).toBe(false);
    expect(
      billingPurchaseEnabledForUser(
        canaryUserId,
        { nativeIos: true },
        { BILLING_MODE: "disabled" },
        canaryNow
      )
    ).toBe(false);
    expect(
      billingCheckoutEnabled({
        NODE_ENV: "production",
        BILLING_MODE: "live",
        BILLING_CHECKOUT_ENABLED: "true",
      })
    ).toBe(true);
    expect(
      billingPurchaseEnabledForUser(
        canaryUserId,
        { nativeIos: true },
        { NODE_ENV: "production", BILLING_MODE: "live" },
        canaryNow
      )
    ).toBe(false);
    expect(
      billingCheckoutEnabledForUser(
        "00000000-0000-4000-8000-000000000000",
        canaryEnv,
        canaryNow
      )
    ).toBe(false);
    expect(
      billingCheckoutEnabledForUser(
        canaryUserId,
        { ...canaryEnv, BILLING_LIVE_CANARY_EXPIRES_AT: "2026-08-14T19:59:59.000Z" },
        canaryNow
      )
    ).toBe(false);
    expect(
      billingCheckoutEnabledForUser(
        canaryUserId,
        { ...canaryEnv, BILLING_CHECKOUT_ENABLED: "true" },
        canaryNow
      )
    ).toBe(true);
    expect(configuredGracePeriodDays({ BILLING_GRACE_PERIOD_DAYS: "31" })).toBe(7);
    expect(configuredStaleToleranceHours({ BILLING_STALE_TOLERANCE_HOURS: "0" })).toBe(72);
    expect(webPriceCatalog).toMatchObject({
      monthly: { amountCents: 599, interval: "month" },
      annual: { amountCents: 5999, interval: "year" },
    });
  });

  it("accepts least-privilege Stripe keys without allowing live secret keys", () => {
    expect(stripeApiKeyMatchesMode("test", "rk_test_custody_folio")).toBe(true);
    expect(stripeApiKeyMatchesMode("test", "sk_test_custody_folio")).toBe(true);
    expect(stripeApiKeyMatchesMode("test", "rk_live_custody_folio")).toBe(false);
    expect(stripeApiKeyMatchesMode("live", "rk_live_custody_folio")).toBe(true);
    expect(stripeApiKeyMatchesMode("live", "sk_live_custody_folio")).toBe(false);
  });

  it("allows an audit-only update or deletion plan but rejects edits in export-only mode", () => {
    const before = createEmptyRecordsDatasetForUser(
      demoUserId,
      "owner@example.test",
      "UTC"
    );
    const auditOnly = structuredClone(before);
    auditOnly.auditLogs.unshift({
      id: "audit-export",
      userId: demoUserId,
      action: "exported",
      entityType: "report",
      entityId: "full-profile",
      timestamp: "2026-08-13T00:00:00.000Z",
      metadataSummary: "Full profile exported without private contents.",
    });
    expect(planExportOnlyDatasetMutation(before, auditOnly)).toEqual({
      kind: "audit_only",
    });

    const deletion = structuredClone(before);
    before.dateNotes.push({
      id: "note-delete",
      userId: demoUserId,
      caseId: before.matters[0].id,
      noteDate: "2026-08-13",
      category: "other",
      title: "Delete me",
      body: "",
      tags: [],
      includeInReports: true,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
    deletion.dateNotes = structuredClone(before.dateNotes);
    deletion.dateNotes = [];
    expect(planExportOnlyDatasetMutation(before, deletion)?.kind).toBe("delete");

    const edit = structuredClone(before);
    edit.users[0].displayName = "Edited while expired";
    expect(planExportOnlyDatasetMutation(before, edit)).toBeNull();
  });
});

describe("signed billing return state", () => {
  const env = { BILLING_RETURN_STATE_SECRET: "return-state-secret-12345678901234567890" };

  it("accepts an unexpired authentic opaque state and rejects tampering or expiration", () => {
    const state = createBillingReturnState("success", { now: 10_000, env });
    expect(verifyBillingReturnState(state, { now: 11_000, env })?.outcome).toBe(
      "success"
    );
    expect(verifyBillingReturnState(`${state}x`, { now: 11_000, env })).toBeNull();
    expect(
      verifyBillingReturnState(state, { now: 10_000 + 31 * 60 * 1000, env })
    ).toBeNull();
  });

  it("does not reuse AUTH_SECRET as an implicit fallback", () => {
    expect(() =>
      createBillingReturnState("portal", {
        env: { AUTH_SECRET: "auth-secret-is-not-a-billing-secret-123456" },
      })
    ).toThrow("Billing return state requires a secret");
  });
});

describe("provider status mapping", () => {
  it("maps Stripe active, grace, cancellation, refund, and price allowlisting", () => {
    vi.stubEnv("BILLING_MODE", "test");
    vi.stubEnv("STRIPE_TEST_MONTHLY_PRICE_ID", "price_test_monthly");
    vi.stubEnv("STRIPE_TEST_ANNUAL_PRICE_ID", "price_test_annual");
    expect(mapStripeSubscription(stripeSubscription("active")).status).toBe("active");
    expect(
      mapStripeSubscription(
        stripeSubscription("active", {
          cancel_at: 1_790_592_000,
          cancel_at_period_end: false,
          canceled_at: 1_786_779_560,
        })
      )
    ).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
      canceledAt: "2026-08-15T07:39:20.000Z",
    });
    expect(
      mapStripeSubscription(stripeSubscription("past_due"), {
        occurredAt: new Date("2026-08-13T00:00:00.000Z"),
        allowNewGracePeriod: true,
      })
    ).toMatchObject({
      status: "grace_period",
      gracePeriodEndsAt: "2026-08-20T00:00:00.000Z",
    });
    expect(mapStripeSubscription(stripeSubscription("canceled")).status).toBe(
      "canceled"
    );
    expect(
      mapStripeSubscription(stripeSubscription("canceled"), {
        occurredAt: new Date("2026-08-13T00:00:00.000Z"),
        overrideStatus: "grace_period",
      })
    ).toMatchObject({ status: "canceled", gracePeriodEndsAt: null });
    expect(
      mapStripeSubscription(stripeSubscription("past_due"), {
        occurredAt: new Date("2026-09-13T00:00:00.000Z"),
        existingGracePeriodEndsAt: "2026-08-20T00:00:00.000Z",
        allowNewGracePeriod: false,
      })
    ).toMatchObject({
      status: "grace_period",
      gracePeriodEndsAt: "2026-08-20T00:00:00.000Z",
    });
    expect(
      mapStripeSubscription(stripeSubscription("past_due"), {
        allowNewGracePeriod: false,
      })
    ).toMatchObject({ status: "expired", gracePeriodEndsAt: null });
    expect(
      mapStripeSubscription(stripeSubscription("active"), {
        overrideStatus: "refunded",
      }).status
    ).toBe("refunded");
    expect(() =>
      mapStripeSubscription(
        stripeSubscription("active", {
          items: {
            data: [
              {
                current_period_start: 1,
                current_period_end: 2,
                price: {
                  id: "price_attacker_controlled",
                  recurring: { interval: "month", interval_count: 1 },
                },
              },
            ],
          } as Stripe.ApiList<Stripe.SubscriptionItem>,
        })
      )
    ).toThrow("not allowlisted");
  });

  it("keeps a subscription refunded when its latest paid invoice was fully refunded", async () => {
    const stripe = {
      invoicePayments: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              status: "paid",
              payment: {
                type: "payment_intent",
                payment_intent: "pi_test_123",
              },
            },
          ],
        }),
      },
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ latest_charge: "ch_test_123" }),
      },
      charges: {
        retrieve: vi.fn().mockResolvedValue({ amount: 599, amount_refunded: 599 }),
      },
    } as unknown as Stripe;
    const subscription = stripeSubscription("active", {
      latest_invoice: "in_test_123",
    });

    await expect(
      latestStripeInvoiceFullyRefunded(stripe, subscription)
    ).resolves.toBe(true);
  });

  it("gives disputes precedence and does not let ordinary events erase restrictions", () => {
    vi.stubEnv("BILLING_MODE", "test");
    vi.stubEnv("STRIPE_TEST_MONTHLY_PRICE_ID", "price_test_monthly");
    vi.stubEnv("STRIPE_TEST_ANNUAL_PRICE_ID", "price_test_annual");
    const active = mapStripeSubscription(stripeSubscription("active"));
    const disputed = mapStripeSubscription(stripeSubscription("active"), {
      occurredAt: new Date("2026-08-15T16:08:14.000Z"),
      overrideStatus: "grace_period",
    });

    expect(
      protectStripeRestrictionOrdering({
        eventType: "charge.dispute.created",
        occurredAt: new Date("2026-08-15T16:08:14.000Z"),
        receivedAt: new Date("2026-08-15T16:08:16.000Z"),
        subscription: disputed,
        current: {
          status: "active",
          grace_period_ends_at: null,
          last_provider_occurred_at: "2026-08-15T16:08:15.000Z",
        },
      })
    ).toMatchObject({
      occurredAt: new Date("2026-08-15T16:08:14.000Z"),
      subscription: { status: "grace_period" },
    });

    expect(
      protectStripeRestrictionOrdering({
        eventType: "customer.subscription.updated",
        occurredAt: new Date("2026-08-15T16:09:00.000Z"),
        receivedAt: new Date("2026-08-15T16:09:01.000Z"),
        subscription: active,
        current: {
          status: "grace_period",
          grace_period_ends_at: "2026-08-22T16:08:16.000Z",
          last_provider_occurred_at: "2026-08-15T16:08:16.000Z",
        },
      }).subscription
    ).toMatchObject({
      status: "grace_period",
      gracePeriodEndsAt: "2026-08-22T16:08:16.000Z",
    });

    expect(
      protectStripeRestrictionOrdering({
        eventType: "invoice.paid",
        occurredAt: new Date("2026-08-16T00:00:00.000Z"),
        receivedAt: new Date("2026-08-16T00:00:01.000Z"),
        subscription: active,
        current: {
          status: "grace_period",
          grace_period_ends_at: "2026-08-22T16:08:16.000Z",
          last_provider_occurred_at: "2026-08-15T16:08:16.000Z",
        },
      }).subscription.status
    ).toBe("active");

    expect(
      protectStripeRestrictionOrdering({
        eventType: "customer.subscription.updated",
        occurredAt: new Date("2026-08-16T00:00:00.000Z"),
        receivedAt: new Date("2026-08-16T00:00:01.000Z"),
        subscription: active,
        current: {
          status: "refunded",
          grace_period_ends_at: null,
          last_provider_occurred_at: "2026-08-15T16:08:16.000Z",
        },
      }).subscription.status
    ).toBe("refunded");
  });

  it("maps Apple active, grace, expiration, refund, revocation, and refund reversal", () => {
    vi.stubEnv("BILLING_MODE", "test");
    expect(
      mapAppleSubscription({
        transaction: appleTransaction(),
        status: Status.ACTIVE,
        occurredAt: new Date("2026-08-13T00:00:00.000Z"),
      }).status
    ).toBe("active");
    expect(
      mapAppleSubscription({
        transaction: appleTransaction(),
        status: Status.BILLING_GRACE_PERIOD,
        occurredAt: new Date("2026-08-13T00:00:00.000Z"),
      })
    ).toMatchObject({
      status: "grace_period",
      gracePeriodEndsAt: "2026-08-20T00:00:00.000Z",
    });
    expect(
      mapAppleSubscription({
        transaction: appleTransaction({ expiresDate: Date.parse("2026-08-01") }),
        status: Status.EXPIRED,
        occurredAt: new Date("2026-08-13T00:00:00.000Z"),
      }).status
    ).toBe("expired");
    expect(
      mapAppleSubscription({
        transaction: appleTransaction(),
        notificationType: "REFUND",
      }).status
    ).toBe("refunded");
    expect(
      mapAppleSubscription({
        transaction: appleTransaction({ revocationDate: Date.now() }),
        notificationType: "REVOKE",
      }).status
    ).toBe("revoked");
    expect(
      mapAppleSubscription({
        transaction: appleTransaction(),
        notificationType: "REFUND_REVERSED",
        occurredAt: new Date("2026-08-13T00:00:00.000Z"),
      }).status
    ).toBe("active");
    expect(applePlanInterval("io.custodyfolio.subscription.annual")).toBe("year");
    expect(applePlanInterval("io.attacker.product")).toBeNull();
  });
});

describe("account deletion billing safety", () => {
  it("uses a separate keyed pseudonym and recognizes every Stripe state that can still bill", () => {
    const env = {
      BILLING_DELETION_HASH_SECRET:
        "delete-only-secret-123456789012345678901234",
    };
    const first = deletedBillingUserHash(demoUserId, env);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(deletedBillingUserHash(demoUserId, env));
    expect(first).not.toBe(
      deletedBillingUserHash("11111111-1111-4111-8111-111111111111", env)
    );
    for (const status of [
      "incomplete",
      "trialing",
      "active",
      "past_due",
      "unpaid",
      "paused",
    ] as Stripe.Subscription.Status[]) {
      expect(stripeSubscriptionNeedsCancellation(status)).toBe(true);
    }
    expect(stripeSubscriptionNeedsCancellation("canceled")).toBe(false);
    expect(stripeSubscriptionNeedsCancellation("incomplete_expired")).toBe(false);
  });
});

describe("live billing fail-closed report", () => {
  const productionReady: ProductionReadinessReport = {
    ready: true,
    generatedAt: "2026-08-13T00:00:00.000Z",
    checks: [],
    blockers: [],
    warnings: [],
  };

  it("blocks live activation when any operational approval or provider setting is missing", () => {
    const report = evaluateLiveBillingReadiness(
      { BILLING_MODE: "live" },
      "2026-08-13T00:00:00.000Z",
      productionReady
    );
    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "stripe-live-key",
        "stripe-live-webhook",
        "stripe-live-portal-configuration",
        "billing-tax-review",
        "live-billing-approval",
      ])
    );
  });

  it("passes only with explicit live, provider, policy, testing, tax, and user activation evidence", () => {
    const now = "2026-08-13T00:00:00.000Z";
    const report = evaluateLiveBillingReadiness(
      {
        BILLING_MODE: "live",
        BILLING_CHECKOUT_ENABLED: "true",
        APPLE_PURCHASE_ENABLED: "false",
        APPLE_BILLING_ENVIRONMENT: "production",
        AUTH_SECRET: "auth-secret-123456789012345678901234",
        STRIPE_LIVE_RESTRICTED_KEY: "rk_live_test_fixture",
        STRIPE_LIVE_WEBHOOK_SECRET: "whsec_test_fixture",
        STRIPE_LIVE_MONTHLY_PRICE_ID: "price_monthly_live",
        STRIPE_LIVE_ANNUAL_PRICE_ID: "price_annual_live",
        STRIPE_LIVE_PORTAL_CONFIGURATION_ID: "bpc_custody_folio_live",
        STRIPE_CUSTOMER_PORTAL_VERIFIED_AT: now,
        BILLING_RETURN_STATE_SECRET: "return-secret-1234567890123456789012",
        BILLING_DELETION_HASH_SECRET: "delete-secret-1234567890123456789012",
        APPLE_BUNDLE_ID: "io.lendori.losttofound",
        APPLE_APP_ID: "1234567890",
        APPLE_MONTHLY_PRODUCT_ID: "io.custodyfolio.subscription.monthly",
        APPLE_ANNUAL_PRODUCT_ID: "io.custodyfolio.subscription.annual",
        APPLE_NOTIFICATIONS_V2_URL:
          "https://custodyfolio.com/api/records/billing/apple/notifications",
        APPLE_NOTIFICATIONS_V2_VERIFIED_AT: now,
        APPLE_APP_STORE_SERVER_KEY_ID: "KEY123",
        APPLE_APP_STORE_SERVER_ISSUER_ID: "issuer-123",
        APPLE_APP_STORE_SERVER_PRIVATE_KEY_BASE64: "base64-private-key",
        APPLE_ROOT_CA_CERTIFICATES_BASE64: "base64-root-ca",
        BILLING_PROVIDER_TESTED_AT: now,
        BILLING_RECONCILIATION_TESTED_AT: now,
        BILLING_MIGRATION_VERIFIED_AT: now,
        BILLING_TERMS_VERSION: "2026-08-13-reviewed",
        BILLING_PRIVACY_VERSION: "2026-08-13-reviewed",
        BILLING_SUBPROCESSOR_VERSION: "2026-08-13-reviewed",
        BILLING_DISCLOSURE_VERSION: "2026-08-13-reviewed",
        BILLING_POLICY_APPROVED: "true",
        BILLING_POLICY_APPROVAL_BASIS: "operator_self_review",
        BILLING_POLICY_VERSIONS_VERIFIED_AT: now,
        STRIPE_TAX_MODE: "not_collecting",
        BILLING_TAX_REVIEW_APPROVED: "true",
        BILLING_TAX_REVIEWED_AT: now,
        LIVE_BILLING_APPROVED: "true",
        BILLING_LIVE_ACTIVATION_AUTHORIZED: "true",
        APPLE_SMALL_BUSINESS_PROGRAM_STATUS: "not_enrolled",
      },
      now,
      productionReady
    );
    expect(report.blockers).toEqual([]);
    expect(report.ready).toBe(true);
  });
});

describe("billing migration and attorney boundary", () => {
  it("enforces one trial, event deduplication, ordering, provider uniqueness, forced RLS, and service-role-only access", async () => {
    const sql = await readFile(
      new URL(
        "../supabase/migrations/20260814232024_custody_folio_billing_entitlements.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(sql).toContain("primary key\n    references public.custody_folio_billing_accounts(id)");
    expect(sql).toContain("p_now + interval '30 days'");
    expect(sql).toContain(
      "on conflict on constraint custody_folio_trials_pkey do nothing"
    );
    expect(sql).toContain("unique (provider, environment, provider_event_id)");
    expect(sql).toContain("custody_folio_one_current_provider_idx");
    expect(sql).toContain("excluded.last_provider_occurred_at >= public.custody_folio_provider_subscriptions.last_provider_occurred_at");
    expect(sql).toContain("cross_provider_subscription");
    expect(sql).toContain("s.environment = p_environment");
    expect(sql).toContain("environment = excluded.environment");
    expect(sql).toContain(
      "custody_folio_refresh_entitlement(uuid, text, timestamptz)"
    );
    expect(sql).toContain("force row level security");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    const hardeningSql = await readFile(
      new URL(
        "../supabase/migrations/20260815001500_harden_billing_environment.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(hardeningSql).toContain("s.environment = p_environment");
    expect(hardeningSql).toContain("e.environment = p_environment");
    expect(hardeningSql).toContain(
      "drop function if exists public.custody_folio_refresh_entitlement(uuid, timestamptz)"
    );

    const waiverRemovalSql = await readFile(
      new URL(
        "../supabase/migrations/20260815054500_remove_billing_waivers.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(waiverRemovalSql).toContain(
      "drop function if exists public.custody_folio_grant_waiver"
    );
    expect(waiverRemovalSql).toContain(
      "drop function if exists public.custody_folio_revoke_waiver"
    );
    expect(waiverRemovalSql).toContain(
      "drop table if exists public.custody_folio_waiver_grants"
    );
    expect(waiverRemovalSql).toContain(
      "mode in ('trial', 'active', 'grace_period', 'export_only')"
    );
    expect(waiverRemovalSql).toContain(
      "source in ('trial', 'stripe', 'apple', 'none')"
    );
    expect(waiverRemovalSql).not.toContain("next_mode := 'waiver'");
    expect(waiverRemovalSql).not.toContain("next_source := 'waiver'");
  });

  it("keeps the StoreKit test catalog in one offer-free group at the approved App Store prices", async () => {
    const raw = await readFile(
      new URL("../ios/CustodyFolio/CustodyFolio.storekit", import.meta.url),
      "utf8"
    );
    const config = JSON.parse(raw) as {
      subscriptionGroups: Array<{
        subscriptions: Array<{
          productID: string;
          displayPrice: string;
          recurringSubscriptionPeriod: string;
          introductoryOffer: unknown;
          adHocOffers: unknown[];
          codeOffers: unknown[];
          winBackOffers: unknown[];
        }>;
      }>;
    };
    expect(config.subscriptionGroups).toHaveLength(1);
    expect(config.subscriptionGroups[0].subscriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productID: "io.custodyfolio.subscription.monthly",
          displayPrice: "6.99",
          recurringSubscriptionPeriod: "P1M",
        }),
        expect.objectContaining({
          productID: "io.custodyfolio.subscription.annual",
          displayPrice: "69.99",
          recurringSubscriptionPeriod: "P1Y",
        }),
      ])
    );
    for (const product of config.subscriptionGroups[0].subscriptions) {
      expect(product.introductoryOffer).toBeNull();
      expect(product.adHocOffers).toEqual([]);
      expect(product.codeOffers).toEqual([]);
      expect(product.winBackOffers).toEqual([]);
    }

    const manager = await readFile(
      new URL(
        "../ios/CustodyFolio/CustodyFolio/StoreKitBillingManager.swift",
        import.meta.url
      ),
      "utf8"
    );
    expect(manager).toContain(".appAccountToken(appAccountToken)");
    expect(manager).toContain("Transaction.currentEntitlements");
    expect(manager).toContain("Transaction.updates");
    expect(manager).toContain("AppStore.sync()");
    expect(manager).toContain("AppStore.showManageSubscriptions");
  });

  it("keeps attorney guest routes independent from owner billing while gating new owner invitations", async () => {
    const guestRoutes = [
      "../src/app/api/records/attorney/portal/route.ts",
      "../src/app/api/records/attorney/evidence/download/route.ts",
    ];
    for (const path of guestRoutes) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).not.toContain("requireRecordsCapability");
    }
    const ownerInvitations = await readFile(
      new URL("../src/app/api/records/attorney/invitations/route.ts", import.meta.url),
      "utf8"
    );
    expect(ownerInvitations).toContain('"attorney:read"');
    expect(ownerInvitations).toContain('"attorney:invite"');
  });
});
