import {test,expect} from '@playwright/test';
test('foreground sounds resume audio, search pulses stop, and hidden apps stay quiet',async({page})=>{
 await page.goto('http://127.0.0.1:5183/?prototype=login');
 await page.clock.install();
 const modulePath=`/@fs${new URL('../shared/sounds.ts',import.meta.url).pathname}`;
 await page.evaluate(async modulePath=>{
  window.played=[];
  window.AudioContext=class {
   state='suspended';currentTime=0;destination={};
   resume(){this.state='running';return Promise.resolve();}
   createDynamicsCompressor(){return {threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){},disconnect(){}};}
   createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
   createOscillator(){return {frequency:{},connect(){},disconnect(){},start(){window.played.push(1);},stop(){}};}
  };
  window.testSounds=await import(modulePath);
  window.testSounds.notificationSound();
 },modulePath);
 await expect.poll(()=>page.evaluate(()=>window.played.length)).toBe(6);
 await page.evaluate(()=>window.testSounds.startSearchingSound());
 expect(await page.evaluate(()=>window.played.length)).toBe(12);
 await page.clock.runFor(5001);
 expect(await page.evaluate(()=>window.played.length)).toBe(18);
 await page.evaluate(()=>window.testSounds.stopSearchingSound());
 await page.clock.runFor(10001);
 expect(await page.evaluate(()=>window.played.length)).toBe(18);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});window.testSounds.notificationSound();});
 expect(await page.evaluate(()=>window.played.length)).toBe(18);
});
