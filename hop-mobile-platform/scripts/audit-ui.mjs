import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { setupMockBackend } from '../tests/support/mockBackend.mjs';

const phase = process.env.HOP_AUDIT_PHASE || 'before';
const out = path.resolve(process.env.HOP_AUDIT_ROOT || 'artifacts/ui-ux-audit', phase);
mkdirSync(out, { recursive: true });
const sizes = process.env.HOP_AUDIT_FULL ? [[320,640],[390,844],[430,932],[768,1024],[1280,800],[1920,1080],[844,390],[320,640,true],[390,844,true]] : [[390,844]];
const browser = await chromium.launch();
const results = [];
const liveScreens = {
 rider: ['home','search','plan','activity','wallet','account','personal','saved','family','preferences','safety','support','notifications','rewards','privacy'],
 captain: ['drive','earnings','activity','account','personal','vehicle','preferences','tools','safety','support','notifications','privacy','demand','insights','ledger','onboarding'],
};
const cases = [...readFileSync('../hop-platform/prototypes/mobile-first/app.js','utf8').matchAll(/case "([\w-]+)":/g)].map(m=>m[1]);
const modalSource = readFileSync('../hop-platform/prototypes/mobile-first/app.js','utf8').split('function modalContent(name)')[1].split('function render()')[0];
const modals = [...modalSource.matchAll(/case "([\w-]+)":/g)].map(m=>m[1]).filter(m=>m!=='review-screens');
for (const role of ['rider','captain']) {
 for (const mode of ['reference','live']) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await setupMockBackend(page,{role});
  await page.goto(`http://127.0.0.1:${role==='rider'?5183:5184}/${mode==='reference'?'?map=reference':''}`);
  await page.locator('#app[data-ready=true]').waitFor();
  const screens = mode==='reference' ? [...new Set([...(await page.locator('#screen-select option').evaluateAll(es=>es.map(e=>e.value))), ...(role==='rider'?['statement','ledger']:['demand','ledger','statement'])])] : liveScreens[role];
  for (const [width,height,darkLarge] of sizes) {
   await page.setViewportSize({width,height});
   await page.evaluate(darkLarge=>window.prototypeBridge.update({toggled:{dark:!!darkLarge,'large-text':!!darkLarge}}),!!darkLarge);
   for (const screen of screens) {
    await page.evaluate(s=>window.prototypeBridge.go(s),screen);
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const measure = await page.evaluate(()=>{
     const app=document.querySelector('#app'), shell=document.querySelector('#phone');
     const bounds=shell.getBoundingClientRect();
     const targets=[],overflow=[],unlabelled=[];
     for(const el of app.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href]')) {
      const target=el.matches('input[type=checkbox],input[type=radio]') ? el.closest('label') || el : el;
      const r=target.getBoundingClientRect(), style=getComputedStyle(el);
      if(!r.width||!r.height||style.visibility==='hidden'||style.opacity==='0'||el.closest('[inert]'))continue;
      const name=(el.textContent||el.getAttribute('aria-label')||el.id||el.className).trim().slice(0,65);
      if(Math.min(r.width,r.height)<43.9)targets.push({name,class:el.className,w:Math.round(r.width),h:Math.round(r.height)});
      if(r.left<bounds.left-1||r.right>bounds.right+1)overflow.push({name,left:Math.round(r.left),right:Math.round(r.right)});
      if(el.tagName==='BUTTON'&&!el.textContent.trim()&&!el.getAttribute('aria-label'))unlabelled.push(el.outerHTML.slice(0,150));
     }
     const body=app.querySelector('.screen-body');
     return {rendered:app.dataset.motionScreen,targets,overflow,unlabelled,bodyOverflow:body?body.scrollWidth>body.clientWidth+1:false,scrollable:body?body.scrollHeight>body.clientHeight:false};
    });
    const file=`${role}-${mode}-${screen}-${width}x${height}${darkLarge?'-dark-large':''}.png`;
    if (mode !== 'reference' || screen === 'chat' || !existsSync(path.join(out,file))) await page.screenshot({path:path.join(out,file)});
    results.push({role,mode,screen,width,height,darkLarge:!!darkLarge,file,...measure,errors:errors.splice(0)});
   }
  }
  if(mode==='reference') {
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(()=>window.prototypeBridge.go('account'));
   for(const modal of modals) {
    await page.evaluate(modal=>window.prototypeBridge.update({modal}),modal);
    const file=`${role}-modal-${modal}-390x844.png`;
    if (!existsSync(path.join(out,file))) await page.screenshot({path:path.join(out,file)});
    const box=await page.locator('.modal-sheet').boundingBox();
    results.push({role,mode:'reference-modal',screen:modal,width:390,height:844,file,box,errors:errors.splice(0)});
   }
  }
  await page.close();
 }
}
await browser.close();
writeFileSync(path.join(out,'inventory.json'),JSON.stringify({phase,sourceCases:[...new Set(cases)],results},null,2));
console.log(JSON.stringify({phase,captures:results.length,screensWithSmallTargets:results.filter(r=>r.targets?.length).length,overflows:results.filter(r=>r.overflow?.length||r.bodyOverflow).map(r=>({role:r.role,screen:r.screen,mode:r.mode,width:r.width,overflow:r.overflow,bodyOverflow:r.bodyOverflow})),errors:results.filter(r=>r.errors?.length)},null,2));
