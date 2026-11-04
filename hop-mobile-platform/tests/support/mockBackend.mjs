export async function setupMockBackend(page, { role = "rider", driverApproved = true, onboardingDraft = null } = {}) {
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : null;

    if (p === "/api/config") {
      return r.fulfill({
        json: {
          areas: [
            { id: "chennai", name: "Chennai", min_lat: 12.8, max_lat: 13.3, min_lng: 80, max_lng: 80.5 },
            { id: "bengaluru", name: "Bengaluru", min_lat: 12.8, max_lat: 13.2, min_lng: 77.4, max_lng: 77.8 },
          ],
          vehicles: [
            { area_id: "chennai", category: "auto", name: "Auto" },
            { area_id: "chennai", category: "bike", name: "Bike" },
            { area_id: "chennai", category: "sedan", name: "Sedan" },
          ],
          development: true,
        },
      });
    }
    if (p === "/api/me") {
      return r.fulfill({
        json: { user: { id: role === "captain" ? "captain-1" : "rider-1" }, csrf: "csrf-token" },
      });
    }
    if (p === "/api/state") {
      return r.fulfill({
        json: {
          rides: [],
          offers: [],
          driver: role === "captain" ? [{ status: driverApproved ? "approved" : "onboarding" }] : [],
        },
      });
    }
    if (p === "/api/profile") {
      return r.fulfill({
        json: {
          details: [{
            name: role === "captain" ? "Arun Captain" : "Deepa Rider",
            phone: "9876543210",
            phone_verified: true,
            email: "deepa@example.com",
            gender: "female",
            birth_date: "1995-05-15",
            default_payment: "cash",
            default_vehicle: "auto",
          }],
          contacts: [{ name: "Anand R", mobile: "9876543211", relationship: "Family" }],
        },
      });
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
    if (p === "/api/wallet") {
      return r.fulfill({
        json: {
          balance: 650,
          transactions: [
            { title: "Added to wallet", amount: 500, type: "credit", date: "Today" },
            { title: "Ride payment", amount: -268, type: "debit", date: "Yesterday" },
          ],
        },
      });
    }
    if (p === "/api/notifications") {
      return r.fulfill({
        json: {
          notifications: [
            { id: "1", title: "Trip confirmed", body: "Your ride with Arun is scheduled.", read: false },
          ],
        },
      });
    }
    if (p === "/api/drivers/onboarding") {
      return r.fulfill({
        json: {
          draft: onboardingDraft || {
            step: 0,
            area_id: "chennai",
            vehicle_category: "bike",
            vehicle_number: "TN 09 AB 1234",
            vehicle_make: "Honda",
            vehicle_model: "Activa",
            vehicle_color: "Black",
          },
          phone_verified: true,
          has_photo: true,
          documents: ["license", "rc", "insurance", "identity"].map((kind) => ({ kind })),
        },
      });
    }
    return r.fulfill({ json: {} });
  });
}
