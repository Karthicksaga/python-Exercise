// Screenshot-only API fixtures. No ride/payment mutation is sent to a real server.
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setupMockBackend } from '../tests/support/mockBackend.mjs';
const out=`${process.env.HOP_AUDIT_ROOT || 'artifacts/ui-ux-audit'}/after`;mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const records=[];
for(const role of ['rider','captain']) {
 for(const [width,height] of [[320,640],[390,844],[1280,800]]) {
  for(const status of ['auth','requested','accepted','arrived','in_progress','completed']) {
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   await setupMockBackend(page,{role});
   const ride={id:'audit-ride',version:1,status,mine:role==='rider',driving:role==='captain',pickup_lat:13.0067,pickup_lng:80.22,dropoff_lat:12.99,dropoff_lng:80.17,pickup_label:'Adyar pickup',dropoff_label:'Airport destination',vehicle_category:'auto',payment_method:'cash',fare_paise:26800,payable_paise:26800,payment_status:'unconfirmed',route:[{lat:13.0067,lng:80.22},{lat:12.99,lng:80.17}]};
   if(status==='auth')await page.route('**/api/me',r=>r.fulfill({status:401,json:{error:'Sign in'}}));
   await page.route('**/api/state',r=>r.fulfill({json:{rides:status==='auth'||(role==='captain'&&status==='requested')?[]:[ride],offers:role==='captain'&&status==='requested'?[ride]:[],driver:role==='captain'?[{status:'approved',online:true}]:[]}}));
   await page.route('**/api/wallet',r=>r.fulfill({json:{balance_paise:12800,entries:[]}}));
   await page.route('**/api/rides/audit-ride/chat',r=>r.fulfill({json:{messages:[]}}));
   await page.route('**/api/rides/audit-ride/nav',r=>r.fulfill({json:{route:ride.route,stale:false,meters:900,seconds:120,steps:[{instruction:'Continue on the verified road',meters:150}]}}));
   await page.goto(`http://127.0.0.1:${role==='rider'?5183:5184}`);
   await expect(page.locator('#app[data-ready=true]')).toBeVisible({timeout:15000});
   if(status==='completed') {
    await page.getByRole('button',{name:role==='rider'?'Activity':'Trips',exact:true}).click();
    await page.getByRole('tab',{name:'Past',exact:true}).click();
    await page.getByRole('button',{name:'Payment & receipt',exact:false}).click();
    await expect(page.locator('[data-live-payment]')).toBeVisible();
   }
   await page.evaluate(()=>document.fonts.ready);
   const screen=await page.locator('#app').getAttribute('data-motion-screen');
   const file=`${role}-live-${status}-${width}x${height}.png`;
   await page.screenshot({path:`${out}/${file}`});records.push({role,status,screen,width,height,file});
   if(role==='captain' && ['accepted','in_progress'].includes(status)) {
    await page.locator('[data-action="toggle-cockpit"]').click();
    const file=`${role}-live-cockpit-${status}-${width}x${height}.png`;
    await page.screenshot({path:`${out}/${file}`});records.push({role,status,screen:'cockpit',width,height,file});
    await page.locator('[data-action="toggle-cockpit"]').click();
   }
   if(['accepted','arrived','in_progress'].includes(status)) {
    await page.evaluate(()=>window.prototypeBridge.go('chat'));
    await expect(page.locator('#app')).toHaveAttribute('data-motion-screen','chat');
    const overflow=await page.locator('.screen-body').evaluate(e=>e.scrollWidth>e.clientWidth);
    const file=`${role}-live-chat-${status}-${width}x${height}.png`;
    await page.screenshot({path:`${out}/${file}`});records.push({role,status,screen:'chat',width,height,file,overflow});
   }
   await page.close();
  }
 }
}
await browser.close();writeFileSync(`${out}/ride-state-inventory.json`,JSON.stringify(records,null,2));console.log(JSON.stringify({captures:records.length,chatOverflow:records.filter(r=>r.overflow)},null,2));
