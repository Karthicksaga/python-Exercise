const $ = id => document.getElementById(id);
let state = {places:{},rides:[]}, role = 'rider', quoteVersion = 0, submitting = false;
const activeStatuses = ['requested','accepted','arrived','in_progress'];
const labels = {requested:'Finding a driver',accepted:'Driver on the way',arrived:'Driver at pickup',in_progress:'Ride in progress',completed:'Completed',cancelled:'Cancelled'};
const tips = {requested:'Your request is available in the driver view of another browser session.',accepted:'Meet your driver at the selected pickup point.',arrived:'Share your pickup code with your driver when you meet.',in_progress:'Your ride is underway.',completed:'Thanks for riding. Settle the fare directly with your driver.',cancelled:'This ride was cancelled.'};
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Try again.');
  return result;
}
let messageTimer;
function notify(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('message').hidden=true,6500);}
function route(r){return `${state.places[r.pickup].name} → ${state.places[r.destination].name}`;}
function button(text, action, id, primary=false){return `<button class="${primary?'primary':'secondary'}" data-action="${action}" data-id="${id}">${text}</button>`;}
function card(r, driver=false){
  let actions='';
  if(driver){
    if(r.status==='requested') actions=button('Accept ride','accept',r.id,true);
    if(r.status==='accepted') actions=button('I’m at pickup','arrive',r.id,true);
    if(r.status==='arrived') actions=`<label for="pin-${r.id}">Rider’s 4-digit pickup code</label><input id="pin-${r.id}" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="Enter code">`+button('Start ride','start',r.id,true);
    if(r.status==='in_progress') actions=button('Complete ride','complete',r.id,true);
  } else if(['requested','accepted','arrived'].includes(r.status)) actions=button('Cancel ride','cancel',r.id);
  return `<article class="ride-card"><span class="status">${labels[r.status]}</span><h3>${route(r)}</h3><p>${r.distance} km estimated · ₹${r.fare} · ₹0 platform fee</p>${!driver?`<p>${tips[r.status]}</p>`:''}${r.mine&&['accepted','arrived'].includes(r.status)?`<p>Your pickup code</p><div class="code">${r.pin}</div>`:''}${actions}</article>`;
}
function render(){
  const own=state.rides.filter(r=>role==='rider'?r.mine:r.driving);
  const current=own.find(r=>activeStatuses.includes(r.status));
  $('active').innerHTML=current?card(current,role==='driver'):'';
  const available=state.rides.filter(r=>r.status==='requested'&&!r.mine);
  $('requests').innerHTML=current?'<p class="subtle">Finish your current ride to accept another.</p>':available.length?available.map(r=>card(r,true)).join(''):'<div class="empty">No requests yet. A rider’s new request will appear here automatically.</div>';
  const past=own.filter(r=>!activeStatuses.includes(r.status));
  $('history').innerHTML=past.length?past.map(r=>`<div class="history-row"><div>${route(r)}<small>${new Date(r.created_at).toLocaleString()} · ${labels[r.status]}</small></div><strong>₹${r.fare}</strong></div>`).join(''):'<div class="empty">A fresh start. Your completed and cancelled rides will appear here.</div>';
  $('booking').hidden=!!state.rides.find(r=>r.mine&&activeStatuses.includes(r.status));
}
async function refresh(){
  // Preserve an in-progress pickup-code entry during background polling.
  const focused=document.activeElement, pin=focused?.id?.startsWith('pin-')?{id:focused.id,value:focused.value}:null;
  state=await api('/api/state');render();
  if(pin&&$(pin.id)){$(pin.id).value=pin.value;$(pin.id).focus();}
}
async function estimate(){
  const version=++quoteVersion;$('book').disabled=true;
  if($('pickup').value===$('destination').value){$('estimate').textContent='Choose two different locations.';return;}
  try{const q=await api('/api/quote',{pickup:$('pickup').value,destination:$('destination').value});if(version!==quoteVersion)return;
  $('estimate').innerHTML=`<div><strong>Bike ride</strong><small>~${q.distance} km · ~${q.minutes} min · approximate</small></div><div class="price">₹${q.fare}<small>₹0 platform fee</small></div>`;$('book').disabled=submitting;
  }catch(e){if(version===quoteVersion){$('estimate').textContent=e.message;}}
}
for(const view of ['rider','driver'])$(view+'-tab').onclick=()=>{role=view;for(const v of ['rider','driver']){$(v+'-view').hidden=v!==view;$(v+'-tab').classList.toggle('selected',v===view);$(v+'-tab').setAttribute('aria-pressed',String(v===view));}render();};
$('pickup').onchange=estimate;$('destination').onchange=estimate;
$('booking').onsubmit=async e=>{e.preventDefault();if(submitting)return;submitting=true;$('book').disabled=true;try{await api('/api/rides',{pickup:$('pickup').value,destination:$('destination').value});await refresh();notify('Ride requested. Waiting for a driver.');}catch(e){notify(e.message);}finally{submitting=false;await estimate();}};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const {id,action}=b.dataset;if(action==='cancel'&&!confirm('Cancel this ride?'))return;b.disabled=true;try{await api('/api/action',{id,action,pin:$('pin-'+id)?.value});await refresh();notify(action==='complete'?'Ride completed. No payment was collected in this demo.':'Ride updated.');}catch(e){notify(e.message);}finally{b.disabled=false;}});
async function init(){try{await refresh();for(const key of ['pickup','destination']){for(const [id,p] of Object.entries(state.places)){const o=document.createElement('option');o.value=id;o.textContent=p.name;$(key).append(o);}}$('destination').value='tnagar';await estimate();setInterval(()=>refresh().catch(()=>notify('Connection lost. Retrying automatically…')),4000);}catch(e){notify(e.message+' Reload to retry.');}}
init();
