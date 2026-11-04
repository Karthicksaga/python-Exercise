import {chromium,expect} from '@playwright/test';
import{mkdirSync,writeFileSync}from'node:fs';
import{fileURLToPath}from'node:url';
const out=fileURLToPath(new URL('./evidence/',import.meta.url));mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const results=[];
for(const [width,height] of [[320,760],[390,844],[1024,1040]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'});const errors=[],api=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/|\/auth\//.test(r.url()))api.push(r.url());});
 await page.goto('http://127.0.0.1:5292');
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
 const vehicle=page.locator('.rider .front-auto'),x=await vehicle.evaluate(e=>e.getBoundingClientRect().x);
 await page.waitForTimeout(400);const x2=await vehicle.evaluate(e=>e.getBoundingClientRect().x);expect(Math.abs(x2-x)).toBeGreaterThan(1);
 await page.locator('#motion').click();await expect(vehicle).toHaveCSS('animation-play-state','paused');
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const a=await vehicle.evaluate(e=>e.getBoundingClientRect().x);await page.waitForTimeout(120);const b=await vehicle.evaluate(e=>e.getBoundingClientRect().x);expect(Math.abs(a-b)).toBeLessThan(.5);
 for(const role of ['rider','captain']){
  await page.getByRole('button',{name:role==='rider'?'Rider':'Captain',exact:true}).click();
  await page.locator(`#${role}-phone`).fill('9876543210');await page.locator(`.${role} .continue`).click();
  await expect(page.locator(`.${role} .otp-preview`)).toBeVisible();await page.locator(`.${role} .back-step`).click();
 }
 await page.getByRole('button',{name:'Both',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);expect(api).toEqual([]);
 await page.screenshot({path:`${out}/both-${width}.png`,fullPage:true});
 for(const role of ['rider','captain'])await page.locator(`.phone.${role}`).screenshot({path:`${out}/${role}-${width}.png`});
 results.push({width,height,motion:true,pause:true,forms:true,overflow:false,apiRequests:api,errors});await page.close();
}
const p=await browser.newPage({reducedMotion:'reduce'});await p.goto('http://127.0.0.1:5292');
expect(await p.locator('.front-auto').first().evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
await expect(p.locator('#motion')).toBeDisabled();await browser.close();
writeFileSync(`${out}/validation.json`,JSON.stringify({profiles:results,reducedMotion:true},null,2));
console.log('Passed: three responsive profiles, actual movement, pause, both local form previews, zero API requests, and reduced motion.');
