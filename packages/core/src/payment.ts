/**
 * The payment-processing capability seam a module supplies (see {@link Module}
 * in `plugin.ts`). Kept in core, not runtime, so route handlers depend only
 * on this interface rather than a specific provider's SDK/API shape — mirrors
 * {@link AIProvider}/{@link EmailProvider}.
 */

export interface Money {
  /** Smallest currency unit (e.g. cents for USD), matching Stripe's convention. */
  amount: number;
  currency: string;
}

export interface CreatePaymentIntentInput {
  amount: Money;
  description?: string;
  /** Opaque metadata round-tripped to the provider and back (e.g. `{ orderId }`). */
  metadata?: Record<string, string>;
}

export interface PaymentIntent {
  id: string;
  status: "requires_payment_method" | "requires_action" | "processing" | "succeeded" | "canceled";
  /** Provider-specific client secret/token the frontend needs to complete payment. */
  clientSecret: string;
  amount: Money;
}

export interface PaymentProvider {
  createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent>;
  retrieveIntent(id: string): Promise<PaymentIntent>;
  /** Full refund when `amount` is omitted. */
  refund(id: string, amount?: Money): Promise<void>;
}
