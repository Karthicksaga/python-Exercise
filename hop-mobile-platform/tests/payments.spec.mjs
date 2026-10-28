import { test, expect } from "@playwright/test";
const completed = {
  id: "settle-ride",
  version: 7,
  status: "completed",
  mine: true,
  driving: true,
  pickup_label: "Adyar",
  dropoff_label: "Airport",
  pickup_lat: 13.0067,
  pickup_lng: 80.22,
  dropoff_lat: 12.99,
  dropoff_lng: 80.17,
  fare_paise: 26800,
  payable_paise: 26800,
  payment_method: "cash",
  payment_status: "unconfirmed",
  vehicle_category: "auto",
};
async function setup(page, ride, wallet = () => 12800) {
  await page.route("https://maps.googleapis.com/**", (r) => r.abort());
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.route(/^http:\/\/127\.0\.0\.1:518[34]\/api\//, (r) =>
    r.fulfill({ json: {} }),
  );
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "account" }, csrf: "csrf" } }),
  );
  await page.route("**/api/config", (r) =>
    r.fulfill({ json: { areas: [], vehicles: [], development: true } }),
  );
  await page.route("**/api/state", (r) =>
    r.fulfill({ json: { rides: [ride()], offers: [], driver: [] } }),
  );
  await page.route("**/api/wallet", (r) =>
    r.fulfill({ json: { balance_paise: wallet(), dev_topup: true } }),
  );
}
async function openPayment(page, role = "rider") {
  await page.goto(`http://127.0.0.1:${role === "rider" ? 5183 : 5184}`);
  await page
    .getByRole("button", {
      name: role === "rider" ? "Activity" : "Trips",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Payment & receipt", exact: false })
    .click();
  await expect(page.locator("[data-live-payment]")).toBeVisible();
}
test("rider checkout waits for backend settlement and reuses an existing order", async ({
  page,
}) => {
  let ride = { ...completed },
    orders = 0,
    verify = 0;
  await setup(page, () => ride);
  await page.route("**/api/rides/settle-ride/pay", (r) => {
    orders++;
    return r.fulfill({
      json: {
        order_id: "order-test",
        amount_paise: 26800,
        currency: "INR",
        key_id: "rzp_test_fixture",
      },
    });
  });
  await page.route("**/api/rides/settle-ride/pay/verify", (r) => {
    verify++;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: 'window.Razorpay=class{constructor(options){this.options=options}on(){}open(){this.options.handler({razorpay_order_id:"order-test",razorpay_payment_id:"payment-test",razorpay_signature:"signed-by-test-provider"})}}',
    }),
  );
  await openPayment(page);
  await page.getByRole("radio", { name: /UPI \/ online/ }).click();
  await page.getByRole("button", { name: "Pay online", exact: true }).click();
  await expect.poll(() => verify).toBe(1);
  await expect(
    page.getByRole("heading", { name: "We’re checking." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "All settled." })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Reopen existing checkout" }).click();
  await expect.poll(() => verify).toBe(2);
  expect(orders).toBe(1);
  ride = { ...ride, payment_status: "paid_online" };
  await page
    .getByRole("button", { name: "Check payment status", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All settled." }),
  ).toBeVisible();
  await expect(
    page.getByText("Backend confirmed", { exact: true }),
  ).toBeVisible();
});
test("Captain payment receipt is a backend report, not an online verification", async ({
  page,
}) => {
  let ride = { ...completed },
    action;
  await setup(page, () => ride);
  await page.route("**/api/rides/settle-ride/actions", (r) => {
    action = r.request().postDataJSON();
    ride = { ...ride, payment_status: "driver_reported_received", version: 8 };
    return r.fulfill({ json: { ok: true } });
  });
  await openPayment(page, "captain");
  await page.getByRole("button", { name: "Record payment received" }).click();
  await page.getByRole("button", {name:"Yes, payment received"}).click();
  await expect(
    page.getByRole("heading", { name: "Payment handover recorded." }),
  ).toBeVisible();
  expect(action).toMatchObject({ action: "payment_received", version: 7 });
  await expect(
    page.getByText("Captain reported received", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Backend confirmed", { exact: true }),
  ).toHaveCount(0);
});
test("wallet top-up and payment use backend amounts and never credit locally", async ({
  page,
}) => {
  let ride = { ...completed },
    balance = 12800,
    topup,
    settlement;
  await setup(
    page,
    () => ride,
    () => balance,
  );
  await page.route("**/api/wallet/topup", (r) => {
    topup = r.request().postDataJSON();
    balance = 26800;
    return r.fulfill({ json: { balance_paise: balance } });
  });
  await page.route("**/api/rides/settle-ride/actions", (r) => {
    settlement = r.request().postDataJSON();
    ride = {
      ...ride,
      payment_method: "wallet",
      payment_status: "paid_online",
      version: 8,
    };
    balance = 0;
    return r.fulfill({ json: { ok: true } });
  });
  await openPayment(page);
  await page.getByRole("radio", { name: /Hop Wallet/ }).click();
  await page.getByRole("button", { name: /Add.*to Wallet/ }).click();
  await expect.poll(() => topup).toEqual({ amount_paise: 14000 });
  await expect(page.getByRole("radio", { name: /Hop Wallet/ })).toContainText(
    "268.00",
  );
  await page
    .getByRole("button", { name: "Pay with Wallet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All settled." }),
  ).toBeVisible();
  expect(settlement).toMatchObject({
    action: "change_payment_method",
    version: 7,
    payment_method: "wallet",
  });
});
test("uncertain order creation cannot silently create a duplicate payment", async ({
  page,
}) => {
  let orders = 0;
  await setup(page, () => ({ ...completed }));
  await page.route("**/api/rides/settle-ride/pay", (r) => {
    orders++;
    return r.fulfill({
      status: 503,
      json: { error: "Payment provider unavailable" },
    });
  });
  await openPayment(page);
  await page.getByRole("radio", { name: /UPI \/ online/ }).click();
  await page.getByRole("button", { name: "Pay online", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(
    page.getByRole("button", { name: "Pay online", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Check payment status", exact: true })
    .click();
  expect(orders).toBe(1);
  await expect(page.getByRole("heading", { name: "All settled." })).toHaveCount(
    0,
  );
});
test("approved Outfit and Inter fonts are served locally", async ({ page }) => {
  const external = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url()))
      external.push(r.url());
  });
  await page.goto("http://127.0.0.1:5183/?prototype=login");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page
      .locator(".login-hero h2")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Outfit");
  expect(
    await page
      .locator(".login-form-copy")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Inter");
  expect(external).toEqual([]);
});
