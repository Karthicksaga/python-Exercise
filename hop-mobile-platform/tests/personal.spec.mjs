import { test, expect } from "@playwright/test";

async function setupProfileFixture(page, { role = "rider", initialProfile = {} } = {}) {
  const posts = [];
  let profile = {
    name: role === "captain" ? "Arun Captain" : "Deepa Rider",
    phone: "9876543210",
    phone_verified: true,
    email: "deepa@example.com",
    gender: "female",
    birth_date: "1995-05-15",
    default_payment: "cash",
    default_vehicle: "auto",
    ...initialProfile,
  };

  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : null;
    if (body) posts.push({ path: p, body });

    if (p === "/api/config") {
      return r.fulfill({
        json: {
          areas: [
            {
              id: "chennai",
              name: "Chennai",
              min_lat: 12.8,
              max_lat: 13.3,
              min_lng: 80,
              max_lng: 80.5,
            },
          ],
          vehicles: [{ area_id: "chennai", category: "auto", name: "Auto" }],
          development: true,
        },
      });
    }
    if (p === "/api/me") {
      return r.fulfill({
        json: { user: { id: role === "captain" ? "captain-1" : "rider-1" }, csrf: "csrf" },
      });
    }
    if (p === "/api/state") {
      return r.fulfill({ json: { rides: [], offers: [], driver: role === "captain" ? [{ status: "approved" }] : [] } });
    }
    if (p === "/api/profile") {
      if (body) {
        profile = { ...profile, ...body };
      }
      return r.fulfill({ json: { details: [profile], contacts: [] } });
    }
    if (p === "/api/profile/photo") {
      profile.has_photo = true;
      return r.fulfill({ json: { ok: true } });
    }
    if (p === "/api/companion") {
      return r.fulfill({
        json: {
          scheduled_rides: [],
          family: [],
          preferences: { language: "en", notifications_enabled: true },
        },
      });
    }
    return r.fulfill({ json: {} });
  });

  const port = role === "captain" ? "5184" : "5183";
  await page.goto(`http://127.0.0.1:${port}`);
  await expect(page.locator("#app[data-ready=true]")).toBeVisible();
  return { posts, getProfile: () => profile };
}

test("Personal details screen renders canonical prototype layout with modalRow components", async ({ page }) => {
  await setupProfileFixture(page, { role: "rider" });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="personal"]').click();

  // Verify header
  await expect(page.locator("header h1")).toHaveText("Personal details");

  // Verify account hero
  const hero = page.locator(".account-hero");
  await expect(hero).toBeVisible();
  await expect(hero.locator(".avatar")).toHaveText("D");
  await expect(hero.locator("h2")).toHaveText("Deepa Rider");
  await expect(hero.locator('button[data-action="portrait"]')).toHaveText("Change photo");

  // Verify full name field
  await expect(page.getByLabel("Full name")).toHaveValue("Deepa Rider");

  // Verify modalRow items with icons and chevrons/badges
  const rows = page.locator(".screen-padding > .list-row");
  await expect(rows).toHaveCount(4); // Mobile, Email, Gender & DOB, Business

  // 1. Mobile number
  const mobileRow = rows.nth(0);
  await expect(mobileRow.locator(".list-text strong")).toHaveText("Mobile number");
  await expect(mobileRow.locator(".list-text small")).toContainText("9876543210 · Verified");
  await expect(mobileRow.locator(".badge.green")).toHaveText("Verified");

  // 2. Email address
  const emailRow = rows.nth(1);
  await expect(emailRow.locator(".list-text strong")).toHaveText("Email address");
  await expect(emailRow.locator(".list-text small")).toHaveText("deepa@example.com");

  // 3. Gender & date of birth
  const genderRow = rows.nth(2);
  await expect(genderRow.locator(".list-text strong")).toHaveText("Gender & date of birth");
  await expect(genderRow.locator(".list-text small")).toHaveText("Female · 1995-05-15");

  // 4. Business receipt details
  const businessRow = rows.nth(3);
  await expect(businessRow.locator(".list-text strong")).toHaveText("Business receipt details");
  await expect(businessRow.locator(".list-text small")).toHaveText(
    "Company, GSTIN, cost centre & work email",
  );

  // Verify notice box
  await expect(page.locator(".screen-padding > .notice-box")).toContainText(
    "The existing exact-number verification and captain identity review checks remain required in the real application.",
  );

  // Verify bottom action bar has Save details
  const saveBtn = page.locator(".action-bar button");
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toContainText("Save details");
});

test("Gender & date of birth modal sheet allows selecting gender, date of birth and saves cleanly", async ({
  page,
}) => {
  const { posts } = await setupProfileFixture(page, {
    role: "rider",
    initialProfile: { gender: "", birth_date: "" },
  });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="personal"]').click();

  // Initially "Personal information"
  const genderRow = page.locator('.list-row[data-modal="personal-more"]');
  await expect(genderRow.locator(".list-text small")).toHaveText("Personal information");

  // Tap Gender & date of birth row to open modal
  await genderRow.click();

  // Verify modal opened
  const sheet = page.locator(".modal-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("#modal-title")).toHaveText("Gender & date of birth");

  // Select Gender
  await sheet.locator("#account-gender").selectOption("female");
  // Fill DOB
  await sheet.locator("#account-birth_date").fill("1998-11-20");

  // Click Save details button in modal
  await sheet.locator('button[data-account-action="personal-more"]').click();

  // Modal should close
  await expect(sheet).not.toBeVisible();

  // Row should now display updated gender and date of birth
  await expect(genderRow.locator(".list-text small")).toHaveText("Female · 1998-11-20");

  // Verify API call payload
  const updatePost = posts.find(
    (p) => p.path === "/api/profile" && p.body.gender === "female",
  );
  expect(updatePost).toBeDefined();
  expect(updatePost.body).toMatchObject({
    gender: "female",
    birth_date: "1998-11-20",
  });
});

test("Email address modal sheet allows entering email and updates row", async ({ page }) => {
  await setupProfileFixture(page, {
    role: "rider",
    initialProfile: { email: "" },
  });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="personal"]').click();

  // Initially "Add or update your email"
  const emailRow = page.locator('.list-row[data-modal="email"]');
  await expect(emailRow.locator(".list-text small")).toHaveText("Add or update your email");

  // Open email modal
  await emailRow.click();
  const sheet = page.locator(".modal-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("#modal-title")).toHaveText("Email address");

  // Enter new email
  await sheet.locator("#account-email").fill("newrider@example.com");
  await sheet.locator('button[data-account-action="email"]').click();

  // Modal should close and row update
  await expect(sheet).not.toBeVisible();
  await expect(emailRow.locator(".list-text small")).toHaveText("newrider@example.com");
});

test("Captain personal details does not render business details row and has Captain avatar", async ({ page }) => {
  await setupProfileFixture(page, { role: "captain" });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="personal"]').click();

  // Captain avatar
  await expect(page.locator(".account-hero .avatar")).toHaveText("A");
  await expect(page.locator(".account-hero h2")).toHaveText("Arun Captain");

  // Business receipt details must NOT be shown for captain
  await expect(page.locator('.list-row[data-modal="business"]')).toHaveCount(0);

  // Other 3 modal rows must be present
  await expect(page.locator('.list-row[data-modal="verify"]')).toBeVisible();
  await expect(page.locator('.list-row[data-modal="email"]')).toBeVisible();
  await expect(page.locator('.list-row[data-modal="personal-more"]')).toBeVisible();
});

test("Change photo triggers file input, updates avatar preview, and uploads photo upon save", async ({
  page,
}) => {
  const { posts } = await setupProfileFixture(page, { role: "rider" });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="personal"]').click();

  // Verify file input exists
  const fileInput = page.locator('input[data-account-photo]');
  await expect(fileInput).toHaveCount(1);

  // Provide a valid PNG image file
  await fileInput.setInputFiles("../hop-platform/prototypes/mobile-first/assets/auto.png");

  // Verify avatar in account-hero now shows the image preview
  const avatarImg = page.locator(".account-hero .avatar img");
  await expect(avatarImg).toBeVisible();

  // Verify "Save photo" button appears in the hero
  const savePhotoBtn = page.locator('button[data-account-action="photo"]');
  await expect(savePhotoBtn).toBeVisible();

  // Save via bottom action bar Save details
  await page.locator('.action-bar button[data-action="save-personal"]').click();

  // Wait for status message indicating completion
  await expect(page.locator('.screen-padding [role="status"]')).toContainText("Personal details saved.");

  // Verify photo was posted
  const photoPost = posts.find((p) => p.path === "/api/profile/photo");
  expect(photoPost).toBeDefined();
  expect(typeof photoPost.body.image).toBe("string");
});
