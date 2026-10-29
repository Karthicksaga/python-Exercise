import { test, expect } from "@playwright/test";
const base = "http://127.0.0.1:5183";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function fallback(page) {
  await page.route("https://maps.googleapis.com/**", (route) => route.abort());
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
}
const ride = {
  id: "ride-test",
  version: 1,
  status: "accepted",
  mine: true,
  pickup_lat: 13.0067,
  pickup_lng: 80.2206,
  dropoff_lat: 13.02,
  dropoff_lng: 80.24,
  pickup_label: "Pickup",
  dropoff_label: "Dropoff",
  vehicle_category: "auto",
  fare_paise: 15000,
  payment_method: "cash",
};
test("Google load failure falls back to OSM and never renders sample cars", async ({
  page,
}) => {
  await fallback(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { user: { id: "rider" }, csrf: "csrf" } }),
  );
  await page.goto(base);
  await expect(page.locator(".hop-map-status")).toContainText("OpenStreetMap");
  await expect(page.locator(".login-screen")).toHaveCount(0);
  await expect(page.locator(".mini-car,.map-pin,.map-bubble")).toHaveCount(0);
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Where to next?" }),
  ).toBeVisible();
});
test("trip markers follow measured backend positions and disappear when stale or failed", async ({
  page,
}) => {
  await fallback(page);
  let lat = 13.0067,
    stale = false,
    fail = false;
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "rider" }, csrf: "test-csrf" } }),
  );
  await page.route("**/api/state", (r) =>
    r.fulfill({ json: { rides: [ride], offers: [], driver: [] } }),
  );
  await page.route("**/api/rides/ride-test/position", (r) =>
    r.fulfill(
      fail
        ? { status: 503, json: { error: "Unavailable" } }
        : {
            json: {
              lat,
              lng: 80.2206,
              at: new Date().toISOString(),
              stale,
              status: "accepted",
            },
          },
    ),
  );
  await page.goto(base);
  const marker = page.locator('.leaflet-marker-icon[title="Live captain"]');
  await expect(marker).toHaveCount(1);
  const before = await marker.getAttribute("style");
  lat = 13.008;
  await expect.poll(() => marker.getAttribute("style")).not.toBe(before);
  stale = true;
  await expect(marker).toHaveCount(0);
  await expect(page.locator(".hop-map-status")).toContainText(
    "fresh captain GPS",
  );
  stale = false;
  await expect(marker).toHaveCount(1);
  fail = true;
  await expect(marker).toHaveCount(0);
  await expect(page.locator(".hop-map-status")).toContainText("unavailable");
});
test("nearby vehicles come only from the backend and disappear from the map when removed", async ({
  page,
}) => {
  await fallback(page);
  let drivers = [
    { id: "nearby-1", category: "sedan", lat: 13.0067, lng: 80.2206 },
  ];
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "rider" }, csrf: "test" } }),
  );
  await page.route("**/api/state", (r) =>
    r.fulfill({
      json: {
        rides: [],
        offers: [],
        driver: [{ online: true, lat: 13.0067, lng: 80.2206 }],
      },
    }),
  );
  await page.route("**/api/nearby?*", (r) => r.fulfill({ json: { drivers } }));
  await page.goto(base);
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);
  drivers = [];
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(0);
  await expect(page.locator(".hop-map-status")).toContainText(
    "No nearby vehicles",
  );
});
test("Captain sends measured foreground GPS only after sharing is explicitly enabled", async ({
  page,
  context,
}) => {
  await fallback(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 13.0067,
    longitude: 80.2206,
    accuracy: 10,
  });
  const sent = [];
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "captain" }, csrf: "test-csrf" } }),
  );
  await page.route("**/api/state", (r) =>
    r.fulfill({
      json: {
        rides: [],
        offers: [],
        driver: [
          { online: true, status: "approved", lat: 13.0067, lng: 80.2206 },
        ],
      },
    }),
  );
  await page.route("**/api/nearby?*", (r) =>
    r.fulfill({ json: { drivers: [] } }),
  );
  await page.route("**/api/drivers/location", (r) => {
    sent.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".hop-map-status")).toContainText("OpenStreetMap");
  expect(sent).toEqual([]);
  await page
    .getByRole("button", { name: "Start or stop live GPS sharing" })
    .click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ lat: 13.0067, lng: 80.2206, accuracy: 10 });
  await page
    .getByRole("button", { name: "Start or stop live GPS sharing" })
    .click();
  await expect(page.locator(".hop-map-status")).toContainText(
    "GPS sharing off",
  );
});

test('live map preferences change fallback rendering and explain unavailable provider layers', async ({page}) => {
 await fallback(page);
 await page.route(`${base}/api/**`,r=>r.fulfill({json:{}}));
 await page.route('**/api/me',r=>r.fulfill({json:{user:{id:'rider'},csrf:'csrf'}}));
 await page.route('**/api/state',r=>r.fulfill({json:{rides:[],offers:[],driver:[]}}));
 await page.route('**/api/config',r=>r.fulfill({json:{areas:[],vehicles:[],development:true}}));
 await page.goto(base);
 await expect(page.locator('.hop-map-status')).toContainText('OpenStreetMap');
 await page.getByRole('button',{name:'Map layers',exact:true}).click();
 await expect(page.locator('[data-map-pref="traffic"]')).toBeDisabled();
 await expect(page.locator('[data-map-pref="satellite"]')).toBeDisabled();
 await expect(page.locator('[data-map-pref="satellite"]')).toContainText('unavailable on the current map');
 await expect(page.getByText('Sample visual option',{exact:true})).toHaveCount(0);
 await page.locator('[data-map-pref="lowdata"]').click();
 await expect(page.locator('[data-map-pref="lowdata"]')).toHaveAttribute('aria-checked','true');
 await expect(page.locator('.hop-map-canvas')).toHaveAttribute('data-low-data','true');
 await page.locator('[data-map-pref="night"]').click();
 await expect(page.locator('.hop-night-tiles')).toHaveCount(1);
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Map layers',exact:true}).click();
 await expect(page.locator('[data-map-pref="night"]')).toHaveAttribute('aria-checked','true');
 await page.locator('[data-map-pref="lowdata"]').click();
 await expect(page.locator('.hop-map-canvas')).toHaveAttribute('data-low-data','false');
});

test('Google preferences select provider imagery and traffic while low-data removes extra layers', async ({page}) => {
 await page.goto(`${base}/?prototype=login`);
 const modulePath = `/@fs${new URL('../shared/maps/google.ts',import.meta.url).pathname}`;
 const result=await page.evaluate(async modulePath=>{
  const {GoogleMapView}=await import(modulePath);
  const types=[], traffic=[], styles=[];
  window.google={maps:{TrafficLayer:class {setMap(map){traffic.push(Boolean(map));}}}};
  const view=Object.create(GoogleMapView.prototype);
  view.map={setMapTypeId(value){types.push(value);},setOptions(options){styles.push(options.styles);}};
  view.setPreferences({traffic:true,satellite:true,lowdata:false,night:false});
  view.setPreferences({traffic:false,satellite:false,lowdata:true,night:true});
  return {types,traffic,styles};
 },modulePath);
 expect(result.types).toEqual(['hybrid','roadmap']);
 expect(result.traffic).toEqual([true,false]);
 expect(result.styles[1]).toContainEqual({featureType:'poi',stylers:[{visibility:'off'}]});
 expect(result.styles[1].some(style=>style.elementType==='geometry')).toBe(true);
});
