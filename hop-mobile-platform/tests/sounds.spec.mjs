import {test,expect} from '@playwright/test';
// Sound redesign approved Nov 2026: one FM "chime" voice (2 oscillators per note), a repeating
// captain ride-request alert that stops on its own, and a softer 4.5 s search pulse.
test('foreground sounds resume audio, repeating alerts stop, and hidden apps stay quiet',async({page})=>{
 await page.goto('http://127.0.0.1:5183/?prototype=login');
 await page.clock.install();
 const modulePath=`/@fs${new URL('../shared/sounds.ts',import.meta.url).pathname}`;
 await page.evaluate(async modulePath=>{
  window.played=[];window.vibrated=0;
  navigator.vibrate=()=>{window.vibrated++;return true;};
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  window.AudioContext=class {
   state='suspended';currentTime=0;destination={};
   resume(){this.state='running';return Promise.resolve();}
   createDynamicsCompressor(){return {threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){},disconnect(){}};}
   createBiquadFilter(){return {type:'',frequency:{},Q:{},connect(){},disconnect(){}};}
   createGain(){return {gain:param(),connect(){},disconnect(){}};}
   createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){window.played.push(1);},stop(){}};}
  };
  window.testSounds=await import(modulePath);
  window.testSounds.notificationSound();
 },modulePath);
 const played=()=>page.evaluate(()=>window.played.length);
 // Resumes the suspended context, then plays 2 notes × 2 oscillators.
 await expect.poll(played).toBe(4);
 // Rider search pulse: immediately, then every 4.5 s until stopped.
 await page.evaluate(()=>window.testSounds.startSearchingSound());
 expect(await played()).toBe(8);
 await page.clock.runFor(4501);
 expect(await played()).toBe(12);
 await page.evaluate(()=>window.testSounds.stopSearchingSound());
 await page.clock.runFor(10001);
 expect(await played()).toBe(12);
 // Captain ride request: 4 notes every 2.6 s with vibration, until accepted or declined...
 await page.evaluate(()=>window.testSounds.startOfferAlert());
 expect(await played()).toBe(20);
 await page.clock.runFor(2601);
 expect(await played()).toBe(28);
 expect(await page.evaluate(()=>window.vibrated)).toBe(2);
 await page.evaluate(()=>window.testSounds.stopOfferAlert());
 await page.clock.runFor(10001);
 expect(await played()).toBe(28);
 // ...and never longer than 45 s if nobody responds.
 await page.evaluate(()=>window.testSounds.startOfferAlert());
 await page.clock.runFor(45001);
 const afterTimeout=await played();
 await page.clock.runFor(10001);
 expect(await played()).toBe(afterTimeout);
 // An app in the background makes no sound.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});window.testSounds.captainArrivedSound();});
 expect(await played()).toBe(afterTimeout);
});
