import { EdgeCMSError, type CreatePaymentIntentInput, type Money, type PaymentIntent, type PaymentProvider } from "@kalayaan/core";

/**
 * PaymentProvider backed by the Stripe REST API. Stripe has no native
 * Cloudflare binding, so this is a plain `fetch`-based client keyed by a
 * secret — constructed per request from a module's `provides.payment`
 * factory, e.g. `new StripePaymentProvider(env.STRIPE_SECRET_KEY)`.
 */
export class StripePaymentProvider implements PaymentProvider {
  constructor(private readonly secretKey: string) {}

  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
    const body = new URLSearchParams({
      amount: String(input.amount.amount),
      currency: input.amount.currency,
      ...(input.description !== undefined && { description: input.description }),
    });
    for (const [key, value] of Object.entries(input.metadata ?? {})) body.set(`metadata[${key}]`, value);
    const res = await this.request("POST", "/v1/payment_intents", body);
    return toPaymentIntent(res, input.amount.currency);
  }

  async retrieveIntent(id: string): Promise<PaymentIntent> {
    const res = await this.request("GET", `/v1/payment_intents/${id}`);
    return toPaymentIntent(res, res.currency as string);
  }

  async refund(id: string, amount?: Money): Promise<void> {
    const body = new URLSearchParams({ payment_intent: id });
    if (amount) body.set("amount", String(amount.amount));
    await this.request("POST", "/v1/refunds", body);
  }

  private async request(method: string, path: string, body?: URLSearchParams): Promise<Record<string, unknown>> {
    const res = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        ...(body && { "Content-Type": "application/x-www-form-urlencoded" }),
      },
      ...(body && { body }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const message = (json.error as { message?: string } | undefined)?.message ?? `Stripe request failed (${res.status})`;
      throw new EdgeCMSError("internal", message);
    }
    return json;
  }
}

function toPaymentIntent(res: Record<string, unknown>, currency: string): PaymentIntent {
  return {
    id: res.id as string,
    status: res.status as PaymentIntent["status"],
    clientSecret: (res.client_secret as string | null) ?? "",
    amount: { amount: res.amount as number, currency },
  };
}
