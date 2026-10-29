import { test, expect } from '@playwright/test';
for (const [role, port] of [['rider',5183],['captain',5184]]) {
 test(`${role} notification cards filter actual unread state and only mark read after server success`, async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  let rejected=true;
  await page.route('https://**',r=>r.abort());
  await page.route('**/api/**',r=>r.fulfill({json:{}}));
  await page.route('**/api/me',r=>r.fulfill({json:{user:{id:role},csrf:'csrf'}}));
  await page.route('**/api/state',r=>r.fulfill({json:{rides:[],offers:[],driver:role==='captain'?[{status:'approved'}]:[]}}));
  await page.route('**/api/config',r=>r.fulfill({json:{areas:[],vehicles:[],development:true}}));
  await page.route('**/api/companion',r=>r.fulfill({json:{notifications:[
   {id:'new',kind:'ride',title:'Your ride update',body:'The Captain is on the way to your selected pickup.',created_at:new Date().toISOString(),read_at:null},
   {id:'old',kind:'account',title:'Account updated',body:'Your saved preferences were updated.',created_at:'2026-10-28T08:00:00Z',read_at:'2026-10-28T09:00:00Z'}
  ]}}));
  await page.route('**/api/notifications/read',r=>r.fulfill(rejected?{status:500,json:{error:'Could not save read status'}}:{json:{ok:true}}));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await expect(page.locator('.notice-card')).toHaveCount(2);
  await expect(page.locator('.notice-unread-dot')).toHaveCount(1);
  await expect(page.locator('.notice-card time').first()).toContainText('Today');
  await page.getByRole('button',{name:'Unread (1)',exact:true}).click();
  await expect(page.locator('.notice-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Mark all as read',exact:true}).click();
  await expect(page.getByText('Could not save read status',{exact:true})).toBeVisible();
  await expect(page.locator('.notice-card.is-unread')).toHaveCount(1);
  rejected=false;
  await page.getByRole('button',{name:'Mark all as read',exact:true}).click();
  await expect(page.getByRole('heading',{name:'You’re all caught up',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'All',exact:true}).click();
  await expect(page.locator('.notice-card')).toHaveCount(2);
  await expect(page.locator('.notice-unread-dot')).toHaveCount(0);
  await page.screenshot({path:`/tmp/hop-${role}-notifications.png`,fullPage:true});
  await page.setViewportSize({width:320,height:700});
  await page.locator('#app').evaluate(el=>el.classList.add('dark','large-text'));
  expect(await page.locator('#app').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 });
}

test('ride planning has one anchored action and clear trip options on a short phone', async ({page}) => {
 await page.setViewportSize({width:320,height:640});
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 await page.route('**/api/me',r=>r.fulfill({json:{user:{id:'rider'},csrf:'csrf'}}));
 await page.route('**/api/config',r=>r.fulfill({json:{areas:[],vehicles:[],development:true}}));
 await page.route('**/api/state',r=>r.fulfill({json:{rides:[],offers:[],driver:[]}}));
 await page.goto('http://127.0.0.1:5183/');
 await page.getByRole('button',{name:'Plan a ride',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save trip plan',exact:true})).toHaveCount(1);
 const save=page.getByRole('button',{name:'Save trip plan',exact:true});
 const bounds=await save.boundingBox();expect(bounds.y+bounds.height).toBeLessThanOrEqual(640);
 await expect(page.locator('#trip-type option')).toHaveText(['City ride','Hourly rental','Outstation']);
 await page.locator('#trip-type').selectOption('rental');
 await expect(page.getByLabel('Rental hours (1–12)',{exact:true})).toBeVisible();
 await page.locator('#trip-type').selectOption('outstation');
 await expect(page.getByLabel('Trip days (1–10)',{exact:true})).toBeVisible();
 expect(await page.locator('#app').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/hop-ride-plan.png',fullPage:true});
});
