import { test, expect } from '@playwright/test';
import { setupMockBackend } from './support/mockBackend.mjs';
const screens = {
 rider: ['home','search','plan','activity','wallet','account','personal','saved','family','preferences','safety','support','notifications','rewards','privacy'],
 captain: ['drive','earnings','activity','account','personal','vehicle','preferences','tools','safety','support','notifications','privacy','demand','insights','ledger','onboarding'],
};
for (const role of ['rider','captain']) {
 for (const [width,height] of [[320,640],[390,844],[430,932],[768,1024],[1280,800],[1920,1080],[844,390]]) {
  test(`${role}: all account and dashboard layouts at ${width}x${height}`,async({page})=>{
   await page.setViewportSize({width,height});
   await setupMockBackend(page,{role});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${role==='rider'?5183:5184}`);
   await expect(page.locator('#app[data-ready=true]')).toBeVisible();
   for(const screen of screens[role]) {
    await page.evaluate(s=>window.prototypeBridge.go(s),screen);
    await expect(page.locator('#app')).toHaveAttribute('data-motion-screen',screen);
    const issues=await page.evaluate(()=>{
     const shell=document.querySelector('#phone').getBoundingClientRect(),issues=[];
     const body=document.querySelector('.screen-body');
     if(body.scrollWidth>body.clientWidth+1)issues.push('content horizontal overflow');
     for(const el of document.querySelectorAll('#app button,#app input:not([type=hidden]),#app select,#app textarea')) {
      const style=getComputedStyle(el);if(el.closest('[inert]')||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')continue;
      const target=el.matches('input[type=checkbox],input[type=radio]')?el.closest('label')||el:el;
      const r=target.getBoundingClientRect();if(!r.width||!r.height)continue;
      if(r.width<43.9||r.height<43.9)issues.push(`${el.textContent.trim().slice(0,30)||el.id||el.className}: small touch target ${r.width}x${r.height}`);
      if(r.left<shell.left-1||r.right>shell.right+1)issues.push(`${el.id||el.className}: outside shell`);
     }
     return issues;
    });
    expect(issues,`${role}/${screen}/${width}`).toEqual([]);
    if(screen==='home'||screen==='drive') {
     const map=page.locator('.hop-map-canvas');
     await expect(map).toBeVisible();
     // Mobile-only layout at every size: the map spans the full phone-width shell above the sheet.
     const box=await map.boundingBox(), phone=await page.locator('#phone').boundingBox();
     expect(box.width).toBeGreaterThan(phone.width-2);
     expect(phone.width).toBeLessThanOrEqual(432);
     expect(box.height).toBeGreaterThan(100);
    }
   }
   expect(errors).toEqual([]);
  });
 }
 test(`${role}: login is compact and primary action survives keyboard resize`,async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await setupMockBackend(page,{role});
  await page.route('**/api/me',r=>r.fulfill({status:401,json:{error:'Sign in'}}));
  await page.goto(`http://127.0.0.1:${role==='rider'?5183:5184}`);
  await expect(page.locator('#app[data-ready=true]')).toBeVisible();
  const hero=await page.locator('.login-hero').boundingBox();
  expect(hero.height).toBeLessThan(300);
  const art = await page.locator('.login-illustration').boundingBox();
  // Redesigned landing (user request, Nov 2026): the animated route art replaces the vehicle image.
  expect(await page.locator('.login-vehicle').count()).toBe(0);
  const pin = await page.locator('.login-pin-dot').boundingBox();
  expect(pin.y).toBeGreaterThanOrEqual(art.y - 1);
  expect(pin.y + pin.height).toBeLessThanOrEqual(art.y + art.height + 1);
  await page.getByLabel('Mobile number',{exact:true}).fill('9876543210');
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:360});visualViewport.dispatchEvent(new Event('resize'));});
  await expect.poll(()=>page.locator('#phone').evaluate(el=>el.clientHeight)).toBe(360);
  const action=await page.getByRole('button',{name:'Send sign-in code',exact:true}).boundingBox();
  expect(action.y+action.height).toBeLessThanOrEqual(360);
 });
 test(`${role}: dark large-text settings keep text readable and controls reachable`,async({page})=>{
  await page.setViewportSize({width:320,height:640});await setupMockBackend(page,{role});
  await page.goto(`http://127.0.0.1:${role==='rider'?5183:5184}`);
  await expect(page.locator('#app[data-ready=true]')).toBeVisible();
  await page.evaluate(()=>{window.prototypeBridge.update({toggled:{dark:true,'large-text':true}});window.prototypeBridge.go('preferences');});
  await expect(page.locator('.live-preferences-page')).toBeVisible();
  await page.locator('[data-modal=appearance]').scrollIntoViewIfNeeded();
  const footer=await page.locator('.action-bar').boundingBox(),row=await page.locator('[data-modal=appearance]').boundingBox();
  expect(row.y+row.height).toBeLessThanOrEqual(footer.y+1);
  expect(await page.locator('.screen-body').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 });
}
test('wallet failure never displays a sample balance or sample transactions',async({page})=>{
 await setupMockBackend(page);
 await page.route('**/api/wallet',r=>r.fulfill({status:503,json:{error:'Wallet temporarily unavailable'}}));
 await page.goto('http://127.0.0.1:5183');await expect(page.locator('#app[data-ready=true]')).toBeVisible();
 await page.evaluate(()=>window.prototypeBridge.go('wallet'));
 await expect(page.locator('.wallet-hero .amount')).toHaveText('—');
 await expect(page.getByRole('alert')).toContainText('Wallet temporarily unavailable');
 await expect(page.locator('.screen-padding')).not.toContainText('sample credit');
 await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
});

test('Captain insights uses nested server totals with readable units',async({page})=>{
 await setupMockBackend(page,{role:'captain'});
 await page.route('**/api/drivers/insights',r=>r.fulfill({json:{totals:[{trips:12,meters:42000,avg_fare_paise:17500,avg_pickup_seconds:180,avg_rating:4.8,best_fare_paise:45000}],days:[{day:'2026-11-03',trips:3,fare_paise:52500}],areas:[],methods:[],types:[]}}));
 await page.goto('http://127.0.0.1:5184');await expect(page.locator('#app[data-ready=true]')).toBeVisible();
 await page.evaluate(()=>window.prototypeBridge.go('insights'));
 await expect(page.locator('.live-insight-grid')).toContainText('42.0 km');
 await expect(page.locator('.live-insight-grid')).toContainText('₹175');
 await expect(page.locator('.live-insight-grid')).toContainText('3 min');
 await expect(page.locator('.live-insight-grid')).toContainText('4.8 / 5');
 await expect(page.locator('.live-insight-row')).toContainText('₹525');
});

test('Captain pickup code fits six accessible inputs on a short phone',async({page})=>{
 await page.setViewportSize({width:320,height:640});await setupMockBackend(page,{role:'captain'});
 await page.route('**/api/state',r=>r.fulfill({json:{driver:[{status:'approved'}],offers:[],rides:[{id:'code-layout',version:1,status:'arrived',driving:true,pickup_lat:13.0,pickup_lng:80.2,dropoff_lat:13.1,dropoff_lng:80.3,pickup_label:'Pickup',dropoff_label:'Destination',vehicle_category:'auto',payment_method:'cash',fare_paise:10000}]}}));
 await page.goto('http://127.0.0.1:5184');await expect(page.locator('.pin-entry')).toBeVisible();
 const boxes=await page.locator('.pin-entry input').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};}));
 expect(boxes).toHaveLength(6);
 for(const box of boxes){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(320);}
});
