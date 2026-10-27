import {useCallback,useEffect,useState} from 'react';
import {api} from '@hop/shared/api';
import {money} from '@hop/shared/types';
import type {CirclePreferences,CircleInvitation} from '@hop/shared/circle';
import '@hop/shared/circle.css';
export default function CaptainCirclePanel({refresh}:{refresh:()=>Promise<void>}){
 const [data,setData]=useState<CirclePreferences|null>(null),[invitations,setInvitations]=useState<CircleInvitation[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[now,setNow]=useState(Date.now());
 const load=useCallback(async()=>{try{const [p,i]=await Promise.all([api<CirclePreferences>('/api/drivers/circle/preferences'),api<{invitations:CircleInvitation[]}>('/api/drivers/circle/invitations')]);setData(p);setInvitations(i.invitations??[]);setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();const timer=setInterval(()=>{setNow(Date.now());if(document.visibilityState==='visible')void load();},4000);return()=>clearInterval(timer);},[load]);
 async function act(path:string,body:unknown,done:string){setBusy(true);setError('');setMessage('');try{await api(path,body);setMessage(done);await load();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const open=invitations.filter(i=>Date.parse(i.expires_at)>now);
 return <section className="panel hop-circle" aria-label="Captain Hop Circle" aria-busy={busy||loading}>
  <p className="eyebrow">PREFERRED RIDES</p><h2>Hop Circle</h2><p className="circle-description">Choose whether riders you have driven before can send preferred requests. Your normal availability and ride eligibility still apply.</p>
  {loading&&<p role="status">Loading Circle preferences…</p>}
  {error&&<p role="alert">{error} <button type="button" onClick={()=>{setLoading(true);void load();}} disabled={busy}>Retry Circle</button></p>}
  {message&&<p role="status">{message}</p>}
  {data&&<>
   <label className="circle-check"><input type="checkbox" checked={data.opted_in} disabled={busy} onChange={e=>void act('/api/drivers/circle/preferences',{opted_in:e.target.checked},e.target.checked?'Circle participation enabled':'Circle participation disabled')}/>Accept preferred Circle invitations</label>
   <h3>Preferred invitations</h3>
   {open.length?open.map(i=><article key={i.id} className="circle-invitation"><strong>{i.rider_name} · {money(i.fare_paise)}</strong><p>{i.pickup_label} → {i.dropoff_label}</p><small>Preferred window ends {new Date(i.expires_at).toLocaleTimeString()}</small><div className="circle-actions"><button type="button" disabled={busy||!data.opted_in} onClick={()=>void act(`/api/rides/${i.id}/actions`,{action:'accept',version:i.version},'Ride accepted')}>Accept Circle ride</button><button type="button" className="secondary" disabled={busy} onClick={()=>void act(`/api/rides/${i.id}/decline`,{},'Invitation declined')}>Decline</button><button type="button" className="text-button" disabled={busy} onClick={()=>void act(`/api/drivers/circle/blocks/${i.rider_id}`,{blocked:true},'Circle requests blocked for this rider')}>Block Circle requests</button></div></article>):<p className="circle-description">No preferred invitations right now. Normal ride requests remain in your existing queue.</p>}
   <h3>Blocked Circle requests</h3><p className="circle-description">Blocks apply to Circle requests and do not cancel an accepted ride.</p>
   {data.blocked_riders.length?data.blocked_riders.map(r=><div key={r.id} className="circle-actions"><span>{r.name}</span><button type="button" disabled={busy} className="text-button" onClick={()=>void act(`/api/drivers/circle/blocks/${r.id}`,{blocked:false},'Circle requests unblocked')}>Unblock</button></div>):<p className="circle-description">You have not blocked any Circle requests.</p>}
  </>}
 </section>;
}
