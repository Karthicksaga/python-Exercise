import {
  test,
  expect,
} from "../../../web/node_modules/@playwright/test/index.mjs";
const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
async function choose(page, screen) {
  if (await page.locator("#screen-select").isVisible())
    await page.locator("#screen-select").selectOption(screen);
  else {
    await page.getByRole("button", { name: "Choose prototype screen" }).click();
    await page.getByRole("dialog").locator(`[data-go="${screen}"]`).click();
  }
}
for (const width of widths)
  test(`all sample screens fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 430 ? 812 : 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const businessRequests = [];
    page.on("request", (request) => {
      if (/\/api\/|\/auth\//.test(request.url()))
        businessRequests.push(request.url());
    });
    await page.goto("/");
    for (const role of ["rider", "captain"]) {
      if (role === "captain") {
        if (await page.locator("[data-role=captain]").isVisible())
          await page.locator("[data-role=captain]").click();
        else await page.locator("#mobile-role").click();
      }
      const ids = await page
        .locator("#screen-select option")
        .evaluateAll((options) => options.map((option) => option.value));
      for (const id of ids) {
        await choose(page, id);
        await expect(page.locator("#app")).toBeVisible();
        const bounds = await page.evaluate(() => {
          const app = document.querySelector("#app"),
            phone = document.querySelector("#phone");
          return {
            pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            appOverflow: app.scrollWidth > app.clientWidth + 1,
            appHeight: app.getBoundingClientRect().height,
            phoneHeight: phone.clientHeight,
            footer: document
              .querySelector(".action-bar,.bottom-nav")
              ?.getBoundingClientRect().bottom,
            phoneBottom: phone.getBoundingClientRect().bottom,
          };
        });
        expect(bounds.pageOverflow, `${role}/${id}: document overflow`).toBe(
          false,
        );
        expect(bounds.appOverflow, `${role}/${id}: app overflow`).toBe(false);
        expect(
          bounds.appHeight,
          `${role}/${id}: app height`,
        ).toBeLessThanOrEqual(bounds.phoneHeight + 1);
        if (bounds.footer)
          expect(bounds.footer, `${role}/${id}: footer`).toBeLessThanOrEqual(
            bounds.phoneBottom + 1,
          );
      }
    }
    expect(errors).toEqual([]);
    expect(businessRequests).toEqual([]);
  });
test("rider journey keeps route, options, payment, promo and local trip state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Where are you going?" }).click();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("airport");
  await page
    .locator('#place-results [data-destination="Chennai Airport"]')
    .click();
  await page.getByRole("radio", { name: /Sedan/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".confirm-route")).toContainText("Chennai Airport");
  await page.locator("[data-modal=payment]").click();
  await page.locator("[data-payment=Cash]").click();
  await expect(page.locator("[data-modal=payment]")).toContainText("Cash");
  await page.locator("[data-modal=promo]").click();
  await page.locator("#promo-code").fill("INVALID");
  await page.getByRole("button", { name: "Apply sample code" }).click();
  await expect(page.getByRole("alert")).toContainText("HOP50");
  await page.locator("#promo-code").fill("HOP50");
  await page.getByRole("button", { name: "Apply sample code" }).click();
  await expect(page.locator(".footer-price")).toContainText("₹376");
  await page.locator("[data-modal=options]").click();
  await page.locator("#fare-offer").fill("1");
  await page.getByRole("button", { name: "Save ride options" }).click();
  await expect(page.getByRole("alert")).toContainText("outside");
  await page.locator("#fare-offer").fill("400");
  await page.getByRole("button", { name: "Save ride options" }).click();
  await page.getByRole("button", { name: "Request a ride" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re in good hands." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose prototype screen" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Next journey step" })
    .click();
  await expect(page.locator(".pin-code")).toContainText("431602");
  await page.locator("[data-go=chat]").click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("At the entrance.");
  await page.getByRole("button", { name: "Send sample message" }).click();
  await expect(page.locator(".chat-bubble.mine")).toContainText(
    "At the entrance.",
  );
});
test("captain six-digit pickup, completion and payment recording stay local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#mobile-role").click();
  await page.getByRole("button", { name: "Go online", exact: true }).click();
  await choose(page, "request");
  await page.getByRole("button", { name: "Accept ride" }).click();
  await page.getByRole("button", { name: "I’ve arrived" }).click();
  await page.getByRole("button", { name: "Verify & start ride" }).click();
  await expect(page.locator("#pin-error")).toContainText("431602");
  for (const [i, digit] of [..."431602"].entries())
    await page.locator(`#pin-${i}`).fill(digit);
  await page.getByRole("button", { name: "Verify & start ride" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep going. You’re close." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete trip", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview confirmed settlement" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Trip details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "5 stars" }).click();
  await expect(page.locator(".stars .active")).toHaveCount(5);
});
test("settings, wallet sample validation, family and onboarding are interactive", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "wallet");
  await page.getByRole("button", { name: "+ Add money" }).click();
  await page.locator("#topup-amount").fill("-1");
  await page.getByRole("button", { name: "Add sample money" }).click();
  await expect(page.getByRole("alert")).toContainText("₹1");
  await page.locator("#topup-amount").fill("200");
  await page.getByRole("button", { name: "Add sample money" }).click();
  await expect(page.locator(".wallet-hero .amount")).toContainText("₹700");
  await choose(page, "family");
  await page.getByRole("button", { name: "+ Invite a family member" }).click();
  await page.locator("#family-name").fill("Demo family");
  await page.getByRole("button", { name: "Preview invitation" }).click();
  await expect(page.locator(".screen-body")).toContainText("Demo family");
  await page.locator("[data-role=captain]").click();
  await choose(page, "onboarding");
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Confirm sample application" })
    .check();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toContainText("pending review");
});
test("strategy page explains sample boundaries and feature parity gates", async ({
  page,
}) => {
  await page.goto("/strategy.html");
  await expect(
    page.getByRole("heading", {
      name: "The same capabilities. A different way through them.",
    }),
  ).toBeVisible();
  await expect(page.locator(".coverage details")).toHaveCount(7);
  await expect(page.locator("body")).toContainText(/server-authoritative/i);
});

test("short phone and larger text keep sheets bounded and actions visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await choose(page, "preferences");
  await page.locator("[data-modal=appearance]").click();
  await page.getByRole("switch", { name: /Dark appearance/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("switch", { name: /Larger text/ })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#app")).toHaveClass(/dark/);
  await expect(page.locator("#app")).toHaveClass(/large-text/);
  for (const role of ["rider", "captain"]) {
    if (role === "captain") await page.locator("#mobile-role").click();
    for (const screen of role === "rider"
      ? ["home", "choose", "confirm", "tracking"]
      : ["drive", "request", "pickup", "trip", "collect"]) {
      await choose(page, screen);
      const fit = await page.evaluate(() => {
        const sheet = document.querySelector(".sheet"),
          body = document.querySelector(".screen-body"),
          footer = document.querySelector(".action-bar,.bottom-nav");
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          top: sheet?.getBoundingClientRect().top,
          bodyTop: body.getBoundingClientRect().top,
          footerBottom: footer?.getBoundingClientRect().bottom,
          viewport: innerHeight,
        };
      });
      expect(fit.overflow).toBe(false);
      if (fit.top !== undefined)
        expect(fit.top).toBeGreaterThanOrEqual(fit.bodyTop - 1);
      if (fit.footerBottom)
        expect(fit.footerBottom).toBeLessThanOrEqual(fit.viewport + 1);
      const primary = page.locator(".action-bar .primary");
      if (await primary.count()) await expect(primary).toBeInViewport();
    }
  }
});

test("capture review views for Rider and Captain", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1020 });
  await page.goto("/");
  await page.screenshot({
    path: "/private/tmp/hop-mobile-review/rider-home.png",
    fullPage: true,
  });
  await choose(page, "choose");
  await page.screenshot({
    path: "/private/tmp/hop-mobile-review/rider-choose.png",
    fullPage: true,
  });
  await choose(page, "confirm");
  await page.screenshot({
    path: "/private/tmp/hop-mobile-review/rider-confirm.png",
    fullPage: true,
  });
  await page.locator("[data-role=captain]").click();
  await choose(page, "request");
  await page.screenshot({
    path: "/private/tmp/hop-mobile-review/captain-request.png",
    fullPage: true,
  });
});

test("interactive enhancements: commute carpools, cockpit HUD, service area and dynamic earnings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // 1. Hop Commute
  await page.getByRole("button", { name: "Hop Commute" }).click();
  await expect(page.locator(".app-head h1")).toContainText("Hop Commute");
  await expect(page.locator(".commute-list")).toContainText(
    "OMR IT Expressway",
  );
  await page.locator('[data-reserve-commute="c1"]').click();
  await expect(page.locator(".toast")).toContainText("Commute seat reserved");
  await expect(page.locator('[data-reserve-commute="c1"]')).toContainText(
    "Cancel seat",
  );

  // 2. Route alternative on choose screen
  await choose(page, "choose");
  await page.locator('[data-route-alt="omr"]').click();
  await expect(page.locator(".subline")).toContainText("26 min via OMR");

  // 3. Simulated chat partner reply
  await choose(page, "chat");
  await page.locator('[data-message="Wearing blue shirt."]').click();
  await expect(page.locator(".chat-bubble.mine")).toContainText(
    "Wearing blue shirt.",
  );
  await page.waitForTimeout(700);
  await expect(page.locator(".chat-bubble.partner")).toBeVisible();

  // 4. RideCheck safety check
  await choose(page, "safety");
  await page.locator('[data-modal="ridecheck"]').click();
  await expect(
    page.getByRole("heading", { name: "Is everything okay?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I’m fine, just stopped in traffic" })
    .click();
  await expect(page.locator(".toast")).toContainText("Glad you’re okay");

  // Switch to Captain
  if (await page.locator("[data-role=captain]").isVisible()) {
    await page.locator("[data-role=captain]").click();
  } else {
    await page.locator("#mobile-role").click();
  }

  // 5. Dynamic earnings periods
  await choose(page, "earnings");
  await page.getByRole("button", { name: "This week" }).click();
  await expect(page.locator(".earnings-hero .amount")).toContainText("₹7,840");
  await page.getByRole("button", { name: "This month" }).click();
  await expect(page.locator(".earnings-hero .amount")).toContainText("₹32,450");

  // 6. Service Area change request
  await choose(page, "drive");
  await page.locator("[data-modal=service-area]").click();
  await expect(
    page.getByRole("heading", { name: "Operating Service Area" }),
  ).toBeVisible();
  await page
    .locator("#target-area")
    .selectOption("Chennai Airport & Guindy Corridor");
  await page
    .getByRole("button", { name: "Submit area change request" })
    .click();
  await expect(page.locator(".toast")).toContainText("Airport");

  // 7. Cockpit Navigation mode
  await choose(page, "pickup");
  await page.getByRole("button", { name: "Fullscreen Cockpit HUD" }).click();
  await expect(page.locator(".cockpit-turn-dist")).toContainText("In 200 m");
  await expect(page.locator(".speed-num")).toContainText("38");
  await page.getByRole("button", { name: "Exit Cockpit HUD" }).click();
  await expect(
    page.getByRole("button", { name: "I’ve arrived" }),
  ).toBeVisible();
});

test("end-to-end booking dispatch: radar search, multi-offer switcher, ride taken race condition and OTP start", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // 1. Rider books a ride
  await choose(page, "confirm");
  await page.getByRole("button", { name: "Request a ride" }).click();

  // 2. Rider sees the radar searching screen
  await expect(page.locator(".matching-radar-status")).toContainText(
    "Broadcasting to 4 nearby Captains",
  );
  await expect(page.locator(".radar-wave").first()).toBeVisible();

  // 3. Captain receives incoming request dispatch
  await page.locator('[data-action="preview-captain-notification"]').click();
  await expect(page.locator(".app-head h1")).toContainText("New ride request");

  // 4. Captain sees multiple incoming offers
  await expect(page.locator(".offer-switcher")).toBeVisible();
  await page.locator('[data-switch-offer="1"]').click();
  await expect(page.locator(".confirm-route")).toContainText("Guindy Industrial Estate");

  // 5. Test race condition: Pickup claimed by another captain
  await page.locator('[data-modal="ride-taken"]').click();
  await expect(
    page.getByRole("heading", { name: "Ride claimed by another captain" }),
  ).toBeVisible();
  await expect(page.locator(".notice-box")).toContainText(
    "Hop Fair Dispatch Guarantee",
  );
  await page.getByRole("button", { name: "Return to active radar" }).click();

  // 6. Return to Offer 1 and accept ride
  await choose(page, "request");
  await page.locator('[data-switch-offer="0"]').click();
  await page.getByRole("button", { name: "Accept ride" }).click();
  await expect(page.locator(".app-head h1")).toContainText("Head to pickup");

  // 7. Captain arrives at pickup
  await page.getByRole("button", { name: "I’ve arrived" }).click();
  await expect(page.locator(".app-head h1")).toContainText("Start the ride");

  // 8. Captain uses Autofill OTP helper and starts trip
  await page.locator('[data-action="autofill-otp"]').click();
  await expect(page.locator("#pin-0")).toHaveValue("4");
  await expect(page.locator("#pin-5")).toHaveValue("2");
  await page.getByRole("button", { name: "Verify & start ride" }).click();
  await expect(page.locator(".toast")).toContainText("OTP 431602 Verified");
  await expect(page.locator(".app-head h1")).toContainText("On trip");
});
