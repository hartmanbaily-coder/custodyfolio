import { describe, expect, it } from "vitest";
import {
  stripeUnitedStatesCheckoutControls,
  stripeWebCheckoutCountry,
} from "@/lib/billing/stripe";

describe("Stripe web checkout market controls", () => {
  it("limits hosted Checkout address options to the United States", () => {
    const controls = stripeUnitedStatesCheckoutControls();

    expect(stripeWebCheckoutCountry).toBe("US");
    expect(controls.shipping_address_collection).toEqual({
      allowed_countries: ["US"],
    });
    expect(controls.customer_update).toEqual({ shipping: "auto" });
    expect(controls.custom_text?.shipping_address).toEqual({
      message:
        "Custody Folio is a digital service. Enter your U.S. service address to confirm web-purchase eligibility; nothing will be shipped.",
    });
    expect(controls).not.toHaveProperty("payment_method_types");
    expect(controls).not.toHaveProperty("automatic_tax");
  });
});
