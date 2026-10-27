import {useCallback,useEffect,useState} from 'react';
import {api} from '@hop/shared/api';
import CircleCaptainCard from '@hop/shared/CircleCaptainCard';
import {circleCaptains,circleChanged,type CircleCaptain} from '@hop/shared/circle';
import type {Ride} from '@hop/shared/types';
import '@hop/shared/circle.css';

export default function HopCirclePanel({rides=[],booking=false,choice=null,onChoice,disabled=false}:{rides?:Ride[];booking?:boolean;choice?:string|null;onChoice?:(id:string|null)=>void;disabled?:boolean}){
 const [captains,setCaptains]=useState<CircleCaptain[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await circleCaptains();setCaptains(r.captains??[]);}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();const update=()=>void load();window.addEventListener('hop-circle-changed',update);return()=>window.removeEventListener('hop-circle-changed',update);},[load]);
 const participating=captains.filter(c=>c.accepts_circle);
 useEffect(()=>{if(booking&&choice!==null&&(disabled||(!loading&&!error&&(participating.length===0||choice!==''&&!participating.some(c=>c.id===choice)))))onChoice?.(null);},[booking,disabled,loading,error,captains,choice,onChoice]);
 async function act(path:string,body:unknown,done:string){setBusy(true);setError('');setMessage('');try{await api(path,body);setMessage(done);circleChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const completed=rides.filter(r=>r.mine&&r.status==='completed'&&r.driver_id&&!captains.some(c=>c.id===r.driver_id));
 return <section className="hop-circle" aria-label={booking?'Circle booking preferences':'Hop Circle'} aria-busy={loading||busy}>
  {booking?<h3>Hop Circle</h3>:<><p className="eyebrow">YOUR PREFERRED CAPTAINS</p><h2>Hop Circle</h2></>}
  <p className="circle-description">Captains you have ridden with before. Circle is your personal preference, not an additional safety certification.</p>
  {loading&&<p role="status">Loading your Circle…</p>}
  {error&&<p role="alert" className="circle-feedback">{error} <button type="button" className="text-button" onClick={()=>void load()} disabled={busy}>Retry Circle</button></p>}
  {message&&<p role="status" className="circle-feedback">{message}</p>}
  {booking?<>
   <label className="circle-check"><input type="checkbox" checked={choice!==null} disabled={disabled||busy||loading||!!error||!participating.length} onChange={e=>onChoice?.(e.target.checked?'':null)}/>Offer to Hop Circle first</label>
   {choice!==null&&<label>Preferred Circle Captain<select value={choice} disabled={disabled||busy||loading} onChange={e=>onChoice?.(e.target.value)}><option value="">Any participating Captain</option>{participating.map(c=><option key={c.id} value={c.id}>{c.name} · {c.vehicle_number}</option>)}</select></label>}
   <p className="circle-description">{disabled?'Circle is unavailable for shared rides.':!loading&&!error&&!participating.length?'No participating Captains yet. Manage your Circle in Safety & more.':'Eligible preferred Captains receive the first 60-second window. Normal matching follows if nobody accepts. Participation does not guarantee availability.'}</p>
  </>:<>
   <div className="circle-list">{captains.map(c=><CircleCaptainCard key={c.id} captain={c} action={<button type="button" className="text-button" disabled={busy} aria-label={`Remove ${c.name} from Circle`} onClick={()=>void act(`/api/circle/captains/${c.id}/remove`,{},'Captain removed from your Circle')}>Remove</button>}/>)}</div>
   {!loading&&!error&&!captains.length&&<p>Your Circle starts after a completed ride. Add a Captain you would like to ride with again.</p>}
   {completed.length>0&&<form className="circle-inline-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;void act('/api/circle/captains',{ride_id:new FormData(form).get('ride')},'Captain added to your Circle');}}><label>Add from a completed ride<select name="ride" disabled={busy}>{completed.map(r=><option key={r.id} value={r.id}>{r.driver_name} · {r.vehicle_number} · {r.dropoff_label}</option>)}</select></label><button disabled={busy}>{busy?'Saving…':'Add to Circle'}</button></form>}
   <p className="circle-description">Captain participation is optional. Location and contact details stay private. Family sharing is not enabled in this release.</p>
  </>}
 </section>;
}
