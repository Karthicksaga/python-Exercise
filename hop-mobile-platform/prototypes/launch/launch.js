const params=new URLSearchParams(location.search);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
const motion=document.getElementById('motion');
function updateMotion(){document.body.dataset.paused=String(paused||document.hidden);motion.disabled=reduced.matches;motion.textContent=reduced.matches?'Reduced motion':paused?'Play motion':'Pause motion';motion.setAttribute('aria-pressed',String(paused));}
function view(value){document.body.dataset.view=value;document.querySelectorAll('[data-view]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.view===value));});}
view(['rider','captain'].includes(params.get('view'))?params.get('view'):'both');updateMotion();
document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>{view(b.dataset.view);const url=new URL(location.href);url.searchParams.set('view',b.dataset.view);history.replaceState(null,'',url);}));
motion.addEventListener('click',()=>{paused=!paused;updateMotion();});document.addEventListener('visibilitychange',updateMotion);reduced.addEventListener('change',()=>{paused=reduced.matches;updateMotion();});
for(const concept of document.querySelectorAll('.concept')){const form=concept.querySelector('form'),input=form.querySelector('input'),button=form.querySelector('button'),otp=concept.querySelector('.otp-preview');input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,10);button.disabled=!/^[6-9]\d{9}$/.test(input.value);});form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;form.hidden=true;otp.hidden=false;});concept.querySelector('.back-step').addEventListener('click',()=>{otp.hidden=true;form.hidden=false;input.focus();});}
