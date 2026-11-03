// Run with the preview server on :5295 (see README).
import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('./evidence/',import.meta.url));mkdirSync(out,{recursive:true});
const URL_='http://127.0.0.1:5295/';
const browser=await chromium.launch();const results=[];
for(const theme of ['light','dark'])for(const [width,height] of [[320,700],[390,844],[1024,1000]]){
  if(theme==='dark'&&width!==390)continue;
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/|\/auth\//.test(r.url()))api.push(r.url());});
  await page.goto(`${URL_}?theme=${theme}&view=both`);await page.evaluate(()=>document.fonts.ready);
  for(const role of ['rider','captain']){
    const screens=await page.evaluate(r=>window.hopConcept.screens[r],role);
    for(const [screen] of screens){
      await page.locator(`[data-role=${role}] select[data-screen]`).selectOption(screen);
      const phone=page.locator(`[data-role=${role}] .phone`);
      await expect(phone).toHaveAttribute('data-screen',screen);
      const issues=await phone.evaluate(host=>{
        const b=host.getBoundingClientRect(),issues=[];
        for(const s of host.querySelectorAll('.page,.sheet-body'))if(s.scrollWidth>s.clientWidth+1)issues.push('horizontal overflow');
        for(const el of host.querySelectorAll('button,input,select')){
          const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
          const name=el.getAttribute('aria-label')||el.textContent.trim().slice(0,24);
          if(!el.closest('.chips')&&(r.left<b.left-1||r.right>b.right+1))issues.push(`${name} outside phone`);
          if(r.height<31.5||r.width<31.5)issues.push(`${name} target ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        const a=host.querySelector('.actions');if(a&&a.getBoundingClientRect().bottom>b.bottom+1)issues.push('actions clipped');
        return issues;});
      expect(issues,`${role}/${screen}/${width}/${theme}`).toEqual([]);
      await phone.screenshot({path:`${out}/${role}-${screen}-${width}${theme==='dark'?'-dark':''}.png`,animations:'disabled'});
      results.push({role,screen,width,theme});
    }
  }
  expect(errors).toEqual([]);expect(api).toEqual([]);
  await page.evaluate(()=>{hopConcept.go('rider','choose');hopConcept.go('captain','request');});
  await page.screenshot({path:`${out}/both-${width}${theme==='dark'?'-dark':''}.png`,fullPage:true,animations:'disabled'});
  await page.close();
}
// Connected interactions
const page=await browser.newPage({viewport:{width:1024,height:1000},reducedMotion:'reduce'});
await page.goto(`${URL_}?theme=light&view=both`);
const rider=page.locator('[data-role=rider] .phone'),captain=page.locator('[data-role=captain] .phone');
await rider.getByRole('button',{name:'Where are you going?'}).click();
await rider.getByRole('button',{name:/Chennai Airport/}).click();
await rider.getByRole('button',{name:'Cheaper'}).click();
await rider.locator('[data-vehicle=bike]').click();await expect(rider.locator('[data-vehicle=bike]')).toHaveAttribute('aria-checked','true');
await expect(rider.getByRole('button',{name:/Confirm Bike · ₹92/})).toBeVisible();
await rider.getByRole('button',{name:/Confirm Bike/}).click();await expect(rider).toHaveAttribute('data-screen','matching');
await page.locator('[data-role=captain] select').selectOption('code');
await captain.getByRole('button',{name:'Verify & start trip'}).click();await expect(captain.getByRole('alert')).toBeVisible();
await captain.getByRole('textbox',{name:'Six-digit pickup code'}).fill('482916');
await captain.getByRole('button',{name:'Verify & start trip'}).click();await expect(captain).toHaveAttribute('data-screen','trip');
await page.getByRole('button',{name:'Colour review'}).click();await expect(page.locator('#palette')).toBeVisible();
await page.screenshot({path:`${out}/colour-review-1024.png`,fullPage:true});
await browser.close();
writeFileSync(`${out}/validation.json`,JSON.stringify({checked:results.length,results,interactions:{riderBooking:true,sortAndSelect:true,pickupCodeValidation:true,colourReview:true},realApiCalls:0},null,2));
console.log(`Passed ${results.length} screen/viewport/theme combinations and connected interactions.`);
