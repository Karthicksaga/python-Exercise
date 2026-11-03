import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('./evidence/',import.meta.url));mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const results=[];
for(const [width,height] of [[320,640],[390,844],[1024,1100]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[],api=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/|\/auth\//.test(r.url()))api.push(r.url());});
 await page.goto('http://127.0.0.1:5293');await page.evaluate(()=>document.fonts.ready);
 for(const role of ['rider','captain']){
  const screens=await page.evaluate(role=>window.hopConcept.screens[role],role);
  for(const [screen] of screens){
   await page.locator(`[data-role=${role}] select[data-screen]`).selectOption(screen);
   await expect(page.locator(`[data-role=${role}] .phone`)).toHaveAttribute('data-screen',screen);
   const issues=await page.locator(`[data-role=${role}] .phone`).evaluate(host=>{
    const bounds=host.getBoundingClientRect(),issues=[];
    const body=host.querySelector('.app-body');if(body.scrollWidth>body.clientWidth+1)issues.push('body horizontal overflow');
    for(const el of host.querySelectorAll('button,input,select,textarea')){
     const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
     if(r.left<bounds.left-1||r.right>bounds.right+1)issues.push(`${el.getAttribute('aria-label')||el.textContent.trim().slice(0,25)} outside phone`);
    }
    const action=host.querySelector('.actions');if(action&&action.getBoundingClientRect().bottom>bounds.bottom+1)issues.push('footer clipped');
    return issues;
   });
   expect(issues,`${role}/${screen}/${width}`).toEqual([]);
   await page.locator(`[data-role=${role}] .phone`).screenshot({path:`${out}/${role}-${screen}-${width}.png`});
   results.push({role,screen,width,height,overflow:false,footerReachable:true});
  }
 }
 expect(errors).toEqual([]);expect(api).toEqual([]);
 await page.evaluate(()=>{hopConcept.go('rider','home');hopConcept.go('captain','home');});
 await page.screenshot({path:`${out}/both-home-${width}.png`,fullPage:true});await page.close();
}
const page=await browser.newPage({viewport:{width:1024,height:1100},reducedMotion:'reduce'});await page.goto('http://127.0.0.1:5293');
const rider=page.locator('[data-role=rider] .phone');
await rider.getByRole('button',{name:'Where are you going?'}).click();await rider.getByRole('textbox',{name:'Search destination'}).fill('Airport');await rider.locator('[data-destination="Chennai Airport"]').click();
await rider.locator('[data-vehicle=bike]').click();await expect(rider.locator('[data-vehicle=bike]')).toHaveAttribute('aria-checked','true');await rider.getByRole('button',{name:'Continue',exact:true}).click();await expect(rider).toContainText('₹92');await rider.locator('[data-modal=payment]').click();await rider.locator('[data-payment=Wallet]').click();await expect(rider).toContainText('Wallet');await rider.getByRole('button',{name:'Find a Captain'}).click();await expect(rider).toHaveAttribute('data-screen','matching');
const captain=page.locator('[data-role=captain] .phone');await page.locator('[data-role=captain] select[data-screen]').selectOption('request');await captain.getByRole('button',{name:'Accept ride'}).click();await captain.getByRole('button',{name:'I’ve arrived'}).click();await captain.getByRole('textbox',{name:'Six-digit pickup code'}).fill('123456');await captain.getByRole('button',{name:'Verify & start ride'}).click();await captain.getByRole('button',{name:'Complete trip'}).click();await captain.getByRole('button',{name:'Preview receipt'}).click();await expect(captain).toHaveAttribute('data-screen','receipt');
await page.locator('[data-role=rider] select[data-screen]').selectOption('preferences');const toggle=rider.getByRole('switch',{name:/Larger text/});await toggle.click();await expect(rider).toHaveClass(/large-text/);await rider.getByRole('button',{name:/Language/}).click();await expect(rider.getByRole('dialog')).toBeVisible();await rider.getByRole('button',{name:'Close dialog'}).click();await expect(rider.getByRole('dialog')).toHaveCount(0);
await browser.close();writeFileSync(`${out}/validation.json`,JSON.stringify({screens:results,interactions:{riderBooking:true,vehicleSelection:true,paymentChoice:true,captainTrip:true,settings:true},realApiCalls:0},null,2));console.log(`Passed ${results.length} role/screen/viewport combinations and connected Rider/Captain interactions.`);
