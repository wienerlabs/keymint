/**
 * Smoke test — boots the proxy in-process and asserts public-API contracts.
 * Run with `npm test` from the proxy/ directory. No live network required for
 * the assertions below; the proxy is started once and torn down at the end.
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const app = require("../index.js");
const payments = require("../src/payments");

let server;
let baseUrl;

test("smoke", async (t) => {
  await t.test("server boots", async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  await t.test("GET /health returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
  });

  await t.test("GET /api/config exposes runtime metadata", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.version, "version present");
    assert.ok(Array.isArray(body.endpoints), "endpoints array");
    assert.ok(body.endpoints.length > 0, "at least one endpoint");
    assert.ok(body.runtime, "runtime block");
    assert.equal(typeof body.runtime.pricingApiEnabled, "boolean");
  });

  await t.test("GET /v1/... without payment returns 402 with instruction", async () => {
    const res = await fetch(
      `${baseUrl}/v1/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045/portfolio`
    );
    assert.equal(res.status, 402);
    const body = await res.json();
    assert.equal(body.status, 402);
    assert.equal(body.currency, "USDC");
    assert.ok(body.paymentInstruction, "payment instruction present");
    assert.equal(body.paymentInstruction.method, "verify_and_pay");
  });

  await t.test("GET /v1/... unknown endpoint returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/does/not/exist`);
    assert.equal(res.status, 404);
  });

  await t.test("PUT /api/endpoints/price without key is rejected", async () => {
    const prevKey = process.env.PUBLISHER_API_KEY;
    process.env.PUBLISHER_API_KEY = "test-key";
    try {
      const res = await fetch(`${baseUrl}/api/endpoints/price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/v1/tokens/price", price: 5000 }),
      });
      assert.equal(res.status, 401);
    } finally {
      if (prevKey === undefined) delete process.env.PUBLISHER_API_KEY;
      else process.env.PUBLISHER_API_KEY = prevKey;
    }
  });

  await t.test("PUT /api/endpoints/price with valid key updates price", async () => {
    const prevKey = process.env.PUBLISHER_API_KEY;
    process.env.PUBLISHER_API_KEY = "test-key";
    try {
      const res = await fetch(`${baseUrl}/api/endpoints/price`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-publisher-key": "test-key",
        },
        body: JSON.stringify({ endpoint: "/v1/tokens/price", price: 5000 }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
    } finally {
      if (prevKey === undefined) delete process.env.PUBLISHER_API_KEY;
      else process.env.PUBLISHER_API_KEY = prevKey;
    }
  });

  await t.test("replay protection: markConsumed/isConsumed", () => {
    const sig = "test-signature-" + Date.now();
    assert.equal(payments.isConsumed(sig), false);
    payments.markConsumed(sig);
    assert.equal(payments.isConsumed(sig), true);
  });

  await t.test("findMatchingRecord matches within 60s window", () => {
    const payer = "TestPayer" + Date.now();
    const rec = payments.recordPayment({
      payer,
      endpoint: "/v1/tokens/price",
      amount: 5000,
      txSignature: "tx-test-" + Date.now(),
    });
    const match = payments.findMatchingRecord(payer, 5000, rec.timestamp);
    assert.ok(match, "should find matching record");
    assert.equal(match.txSignature, rec.txSignature);

    const noMatch = payments.findMatchingRecord(payer, 9999, rec.timestamp);
    assert.equal(noMatch, null, "different amount → no match");
  });

  server.close();
});
