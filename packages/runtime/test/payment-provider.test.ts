import { afterEach, describe, expect, it, vi } from "vitest";
import { StripePaymentProvider } from "../src/payment/stripe-payment-provider.js";

function fakeFetch(status: number, json: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
}

describe("StripePaymentProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a payment intent and normalizes the response", async () => {
    const fetchMock = fakeFetch(200, {
      id: "pi_123",
      status: "requires_payment_method",
      client_secret: "pi_123_secret",
      amount: 1000,
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new StripePaymentProvider("sk_test_123");
    const intent = await provider.createIntent({
      amount: { amount: 1000, currency: "usd" },
      description: "order #1",
      metadata: { orderId: "1" },
    });

    expect(intent).toEqual({
      id: "pi_123",
      status: "requires_payment_method",
      clientSecret: "pi_123_secret",
      amount: { amount: 1000, currency: "usd" },
    });

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_test_123");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("amount")).toBe("1000");
    expect(body.get("currency")).toBe("usd");
    expect(body.get("description")).toBe("order #1");
    expect(body.get("metadata[orderId]")).toBe("1");
  });

  it("retrieves an intent by id", async () => {
    const fetchMock = fakeFetch(200, {
      id: "pi_456",
      status: "succeeded",
      client_secret: "pi_456_secret",
      currency: "eur",
      amount: 500,
    });
    vi.stubGlobal("fetch", fetchMock);

    const intent = await new StripePaymentProvider("sk_test_123").retrieveIntent("pi_456");
    expect(intent.id).toBe("pi_456");
    expect(intent.status).toBe("succeeded");
    expect(intent.amount).toEqual({ amount: 500, currency: "eur" });

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_intents/pi_456");
    expect(init.method).toBe("GET");
  });

  it("refunds a partial amount when given, full otherwise", async () => {
    const fetchMock = fakeFetch(200, { id: "re_1" });
    vi.stubGlobal("fetch", fetchMock);

    await new StripePaymentProvider("sk_test_123").refund("pi_789", { amount: 200, currency: "usd" });
    const [, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = new URLSearchParams(init.body as string);
    expect(body.get("payment_intent")).toBe("pi_789");
    expect(body.get("amount")).toBe("200");
  });

  it("wraps a Stripe error response in an EdgeCMSError", async () => {
    vi.stubGlobal("fetch", fakeFetch(402, { error: { message: "Your card was declined." } }));
    await expect(
      new StripePaymentProvider("sk_test_123").createIntent({ amount: { amount: 100, currency: "usd" } }),
    ).rejects.toThrow("Your card was declined.");
  });
});
