// Hop app concept 03 — design preview only. Sample data; no API, GPS, payment or account calls.
const P={
  back:'m15 5-7 7 7 7',chevron:'m9 6 6 6-6 6',down:'m6 9 6 6 6-6',plus:'M12 5v14M5 12h14',close:'M6 6l12 12M18 6 6 18',arrow:'M5 12h14m-6-6 6 6-6 6',
  search:'m21 21-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0',bell:'M18 9a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.5 21h3',
  home:'m3 10.5 9-7 9 7V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z',work:'M4 7h16v13H4ZM9 7V4h6v3M4 12h16',
  clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',wallet:'M20 7H5a2 2 0 0 1 0-4h13v4m2 0v13H5a2 2 0 0 1-2-2V5m17 7h-4a2 2 0 0 0 0 4h4',
  user:'M19 21v-1a6 6 0 0 0-12 0v1M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',users:'M16 20v-1a5 5 0 0 0-10 0v1M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  pin:'M19 10c0 6-7 11-7 11s-7-5-7-11a7 7 0 1 1 14 0Zm-4 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',swap:'M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3',
  calendar:'M4 6h16v14H4ZM8 3v5m8-5v5M4 10h16',timer:'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4l2 2M9 2h6',road:'M8 3 4 21m12-18 4 18M12 4v3m0 4v3m0 4v3',
  shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z',phone:'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  chat:'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',share:'M12 3v13m0-13-4 4m4-4 4 4M5 13v7h14v-7',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z',check:'m5 12 5 5L20 7',
  nav:'m12 3 7 18-7-4-7 4Z',chart:'M4 20V10m6 10V4m6 16v-7m4 7H3',file:'M14 3H6v18h12V7Zm0 0v4h4M9 13h6M9 17h4',
  card:'M3 6h18v12H3ZM3 10h18M7 15h3',cash:'M3 7h18v10H3ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 10v4m12-4v4',
  gift:'M4 11h16v10H4ZM3 7h18v4H3Zm9 0v14M12 7S9 2 7 4s2 3 5 3Zm0 0s3-5 5-3-2 3-5 3Z',heart:'M20.5 5.5a5 5 0 0 0-7.6.6L12 7.3l-.9-1.2a5 5 0 1 0-7.6 6.5L12 21l8.5-8.4a5 5 0 0 0 0-7.1Z',
  settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.5 1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-4l-.4-2a7 7 0 0 1-2-1.2l-1.8.7-2-3.4 1.5-1.2a7 7 0 0 1 0-2.4L4.6 10.3l2-3.4 1.9.7a7 7 0 0 1 2-1.2L10.8 3h4l.3 2a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.4Z',
  help:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01',lock:'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5Z',
  logout:'M15 4h4v16h-4M10 8l-4 4 4 4m-4-4h11',power:'M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0',target:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-3.5h.01',
  layers:'m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',locate:'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3m0 14v3M2 12h3m14 0h3',
  upload:'M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4',alert:'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  sos:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v5m0 3h.01',bolt:'M13 2 4 14h7l-1 8 9-12h-7Z',minus:'M5 12h14',route:'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a3 3 0 0 1 3-3h4m5 3v6a3 3 0 0 1-3 3h-4',
};
const ic=(n,s=20)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const rb=(i,label,attrs='',extra='')=>`<button class="round" aria-label="${label}" ${attrs}>${ic(i)}${extra}</button>`;
const img=(v,cls='')=>`<img class="${cls}" src="assets/${v}.png" alt="">`;
const rs=n=>'₹'+n.toLocaleString('en-IN');

const VEH=[
  {id:'auto',name:'Auto',seats:3,fare:146,eta:3,note:'Everyday easy',share:102},
  {id:'bike',name:'Bike',seats:1,fare:92,eta:2,note:'Beat the traffic'},
  {id:'mini',name:'Mini',seats:4,fare:208,eta:4,note:'Compact AC cab',share:146},
  {id:'sedan',name:'Sedan',seats:4,fare:264,eta:5,note:'Extra legroom'},
  {id:'suv',name:'SUV',seats:6,fare:348,eta:6,note:'Room for everyone'},
];
const S={rider:{screen:'home',veh:'auto',tab:'rec',stars:5,plan:'rental',hours:4,offer:150,pay:'UPI'},captain:{screen:'home',goHome:false,period:'week',collect:'UPI',codeErr:false}};

/* ---------- Map: flat light style mirroring a muted Google/OSM tile ---------- */
const HR=[40,130,220,310,400,520,640,760],VR=[30,120,215,300,375];
const PARKS=new Set(['3-1','0-5','4-3']);
function map(o={}){
  const xs=[0,...VR,390],ys=[0,...HR,800];let s=`<svg class="map" viewBox="0 0 390 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect class="m-land" width="390" height="800"/>`;
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
    const x=xs[i]+9,y=ys[j]+9,w=xs[i+1]-xs[i]-18,h=ys[j+1]-ys[j]-18;if(w<12||h<12)continue;
    if(PARKS.has(`${i}-${j}`)){s+=`<rect class="m-park" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`;continue;}
    if(w>70){const a=Math.round(w*.55);s+=`<rect class="m-block" x="${x}" y="${y}" width="${a-4}" height="${h}" rx="6"/><rect class="m-block" x="${x+a+4}" y="${y}" width="${w-a-4}" height="${h}" rx="6"/>`;}
    else s+=`<rect class="m-block" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
  }
  s+=`<path class="m-water" d="M-10 575C70 548 140 600 230 566S360 520 400 548V604C340 586 280 626 196 618S50 596-10 628Z"/>`;
  const lines=[...HR.map(y=>`M-5 ${y}H395`),...VR.map(x=>`M${x} -5V805`)].join('');
  s+=`<path class="m-edge" stroke-width="15" d="${lines}"/><path class="m-road" stroke-width="12" d="${lines}"/>`;
  s+=`<path class="m-edge" stroke-width="22" d="M-10 470 395 90"/><path class="m-road" stroke-width="18" d="M-10 470 395 90"/>`;
  for(const [x,y,t] of o.labels||[[150,190,'ADYAR'],[236,370,'GUINDY'],[40,700,'BESANT NAGAR']])s+=`<text class="m-label" x="${x}" y="${y}">${t}</text>`;
  for(const [x,y,r] of o.hot||[])s+=`<circle class="m-hot" cx="${x}" cy="${y}" r="${r}" opacity=".10"/><circle class="m-hot" cx="${x}" cy="${y}" r="${r*.55}" opacity=".16"/>`;
  if(o.route){const p=o.route.map(q=>q.join(',')).join(' ');s+=`<polyline class="m-case" points="${p}"/><polyline class="m-route" points="${p}"/>`;}
  if(o.approach){const p=o.approach.map(q=>q.join(',')).join(' ');s+=`<polyline class="m-approach" points="${p}"/>`;}
  if(o.radar){const [x,y]=o.radar;s+=`<circle class="m-radar" cx="${x}" cy="${y}" r="90"/><circle class="m-radar" cx="${x}" cy="${y}" r="90"/>`;}
  if(o.pick){const [x,y]=o.pick;s+=`<g transform="translate(${x} ${y})"><circle class="m-halo" r="20"/><circle class="m-pick" r="8"/></g>`;}
  if(o.drop){const [x,y]=o.drop;s+=`<g transform="translate(${x} ${y})"><path class="m-drop" d="M0 0C-3-9-14-14-14-27a14 14 0 1 1 28 0C14-14 3-9 0 0Z"/><rect class="m-drop-dot" x="-5" y="-32" width="10" height="10" rx="2"/></g>`;}
  for(const [v,x,y] of o.cars||[]){const w=v==='bike'||v==='auto'?40:52;s+=`<image class="m-car" href="assets/${v}.png" x="${x-w/2}" y="${y-w*.42}" width="${w}" height="${w*.84}" preserveAspectRatio="xMidYMid meet"/>`;}
  return s+'</svg>';
}

const nav=(role,cur)=>{
  const items=role==='rider'?[['home','home','Home'],['activity','clock','Activity'],['wallet','wallet','Wallet'],['account','user','Account']]:[['home','nav','Drive'],['earnings','chart','Earnings'],['documents','file','Vehicle'],['account','user','Account']];
  return `<nav class="nav" aria-label="Main">${items.map(([s,i,l])=>`<button data-go="${s}" aria-label="${l}" ${s===cur?'aria-current="page"':''}>${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
};
const topBar=(title,back,right='<span class="round ghost"></span>')=>`<div class="topbar">${rb('back','Back',`data-go="${back}"`)}<div class="title-pill">${title}</div>${right}</div>`;
const route=(a,b,opts={})=>`<div class="route"><div class="stop"><span class="pt"></span><div class="txt"><small>${opts.aLabel||'Pickup point'}</small><b>${a}</b></div></div>${opts.swap?`<button class="swap" aria-label="Swap pickup and destination">${ic('swap',18)}</button>`:''}<span class="line"></span><span class="sep"></span><div class="stop"><span class="pt end"></span><div class="txt"><small>${opts.bLabel||'Destination'}</small><b>${b}</b></div></div></div>`;
const listRow=(i,t,s,attrs='',end=ic('chevron',18))=>`<button ${attrs}><span class="ic-box">${ic(i)}</span><span class="t"><b>${t}</b>${s?`<small>${s}</small>`:''}</span><span class="end">${end}</span></button>`;
const head=(title,back,right='')=>`<div class="title">${back?rb('back','Back',`data-go="${back}"`):''}<h1>${title}</h1>${right}</div>`;

/* ---------- Rider ---------- */
const R={};
R.home=()=>`<div class="screen">${map({pick:null,cars:[['auto',95,420],['bike',300,470],['mini',170,560],['auto',330,380]],labels:[[150,370,'ADYAR'],[40,700,'BESANT NAGAR']]})}
 <svg class="map" viewBox="0 0 390 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="pointer-events:none"><g transform="translate(215 465)"><circle class="m-halo" r="34"/><circle r="9" fill="var(--primary)" stroke="#fff" stroke-width="4"/></g></svg>
 <div class="map-fade"></div>
 <header class="hello"><div class="avatar sm">PR</div><div><b>Priya Raman</b><small>${ic('pin',14)} Adyar, Chennai</small></div><span class="spacer"></span>${rb('search','Search','data-go="search"')}${rb('bell','Notifications','',`<i class="dot"></i>`)}</header>
 <section class="card where">
  <button class="search-field" data-go="search">${ic('search')}<span>Where are you going?</span><span class="when">${ic('clock',14)} Now</span></button>
  <div class="saved"><button data-go="choose"><span class="ic-box">${ic('home',18)}</span><span><b>Home</b><small>2nd Cross St, Adyar</small></span></button><button data-go="choose"><span class="ic-box">${ic('work',18)}</span><span><b>Work</b><small>Olympia Tech Park</small></span></button></div>
 </section>
 <div class="home-bottom">
  <div class="quick"><button class="card" data-go="search" data-pick="auto"><span class="q-top"><span class="veh">${img('auto')}</span><b>Auto</b></span><span class="eta">3 <small>min away</small></span></button><button class="card" data-go="search" data-pick="bike"><span class="q-top"><span class="veh">${img('bike')}</span><b>Bike</b></span><span class="eta">2 <small>min away</small></span></button></div>
  <div class="card types"><button data-go="plan" data-plan="schedule">${ic('calendar',18)}Schedule</button><button data-go="plan" data-plan="rental">${ic('timer',18)}Rental</button><button data-go="plan" data-plan="outstation">${ic('road',18)}Outstation</button></div>
 </div>${nav('rider','home')}</div>`;

R.search=()=>`<div class="screen"><div class="page no-nav"><div class="stack">${head('Plan your ride','home')}
 <div class="card"><div class="route"><div class="stop"><span class="pt"></span><div class="txt"><small>Pickup</small><b>Current location · Adyar</b></div></div><button class="swap" aria-label="Swap pickup and destination">${ic('swap',18)}</button><span class="line"></span><span class="sep"></span><div class="stop"><span class="pt end"></span><div class="txt"><small>Destination</small><input aria-label="Search destination" placeholder="Search a place in Chennai" value=""></div></div></div></div>
 <div class="chips"><button class="chip" aria-pressed="true">${ic('clock',16)} Now</button><button class="chip">${ic('user',16)} For me</button><button class="chip">${ic('plus',16)} Add stop</button><button class="chip">${ic('pin',16)} Choose on map</button></div>
 <div class="card" style="padding:4px 16px"><div class="list">
  ${listRow('pin','Chennai Airport','Meenambakkam · 14.2 km','data-go="choose"','<span class="label">22 min</span>')}
  ${listRow('pin','Olympia Tech Park','Guindy · 6.1 km','data-go="choose"','<span class="label">14 min</span>')}
  ${listRow('pin','Phoenix Marketcity','Velachery · 7.8 km','data-go="choose"','<span class="label">18 min</span>')}
  ${listRow('pin','Elliot’s Beach','Besant Nagar · 2.4 km','data-go="choose"','<span class="label">8 min</span>')}
 </div></div>
 <p class="eyebrow">Saved places</p>
 <div class="card" style="padding:4px 16px"><div class="list">${listRow('home','Home','2nd Cross St, Adyar','data-go="choose"')}${listRow('work','Work','Olympia Tech Park, Guindy','data-go="choose"')}${listRow('heart','Amma’s place','T. Nagar','data-go="choose"')}</div></div>
 </div></div></div>`;

const sortV=t=>{const v=VEH.map(x=>({...x}));if(t==='fast')v.sort((a,b)=>a.eta-b.eta);if(t==='cheap')v.sort((a,b)=>a.fare-b.fare);if(t==='shared')return v.filter(x=>x.share);return v;};
R.choose=()=>{const st=S.rider,list=sortV(st.tab);if(!list.find(v=>v.id===st.veh))st.veh=list[0].id;const sel=VEH.find(v=>v.id===st.veh),fare=st.tab==='shared'?sel.share:sel.fare;
 return `<div class="screen">${map({route:[[120,310],[120,220],[215,220],[215,130],[300,130]],pick:[120,310],drop:[300,130],cars:[['auto',60,300]]})}
 ${topBar(`Adyar ${ic('arrow',16)} Airport`,'search',rb('plus','Add a stop'))}
 <section class="sheet" style="max-height:63%"><div class="sheet-body">
  <div class="chips" role="tablist" aria-label="Sort rides">${[['rec','Recommended'],['fast','Faster'],['cheap','Cheaper'],['shared','Shared']].map(([k,l])=>`<button class="chip" data-tab="${k}" aria-pressed="${st.tab===k}">${l}</button>`).join('')}</div>
  <div class="row between"><h2 style="font-size:19px">Select your ride</h2><span class="label">14.2 km · 22 min</span></div>
  ${st.tab==='shared'?`<div class="notice info">${ic('users',18)}<span>Share with up to 2 riders going your way. Pickup may take a few minutes longer.</span></div>`:''}
  <div class="rides" role="radiogroup" aria-label="Vehicle">${list.map(v=>`<button class="ride" role="radio" data-vehicle="${v.id}" aria-checked="${v.id===st.veh}"><span class="pic">${img(v.id)}</span><span><b>${v.name}</b><small>${ic('users',14)} ${v.seats} ${v.seats>1?'seats':'seat'} · ${v.note}</small></span><span class="r"><b>${rs(st.tab==='shared'?v.share:v.fare)}</b><small>${st.tab==='shared'?`<span class="save">Save ${rs(v.fare-v.share)}</span>`:`${ic('clock',13)} ${v.eta} min`}</small></span></button>`).join('')}</div>
 </div><div class="actions">
  <div class="row between"><button class="link" data-cycle-pay>${ic(st.pay==='Cash'?'cash':st.pay==='Wallet'?'wallet':'card',18)}&nbsp;${st.pay}${st.pay==='UPI'?' · GPay':''} ${ic('down',16)}</button><button class="link" data-go="fare">Offer your fare</button></div>
  <button class="btn primary block" data-go="matching">Confirm ${sel.name} · ${rs(fare)}</button>
 </div></section></div>`;};

R.fare=()=>{const st=S.rider;return `<div class="screen">${map({route:[[120,310],[120,220],[215,220],[215,130],[300,130]],pick:[120,310],drop:[300,130]})}
 ${topBar('Offer your fare','choose')}
 <section class="sheet"><div class="sheet-body">
  <div class="center stack" style="gap:6px"><span class="label">Your offer for Auto · 14.2 km</span>
   <div class="row" style="justify-content:center;gap:18px">${rb('minus','Lower offer by ₹5','data-offer="-5"')}<span class="big" aria-live="polite">${rs(st.offer)}</span>${rb('plus','Raise offer by ₹5','data-offer="5"')}</div>
   <span class="badge ${st.offer<140?'warn':'ok'}" style="align-self:center">${st.offer<140?'Below usual — fewer Captains may respond':'Captains usually accept ₹140–₹170'}</span></div>
  <hr><div class="row between"><h2 style="font-size:17px">Captain offers</h2><span class="label">Waiting for more…</span></div>
  ${[['AK','Arun Kumar','4.8 · 1,240 trips',160,3],['SV','Sathish V','4.6 · 820 trips',155,5]].map(([i,n,r,f,e])=>`<div class="tile row"><div class="avatar xs">${i}</div><div class="spacer"><b>${n}</b><div class="label">★ ${r} · ${e} min away</div></div><div class="center"><div class="price" style="font-size:18px">${rs(f)}</div></div><button class="btn primary sm" data-go="pickup">Accept</button></div>`).join('')}
 </div><div class="actions"><button class="btn primary block" data-go="matching">Send offer · ${rs(st.offer)}</button></div></section></div>`;};

R.matching=()=>`<div class="screen">${map({radar:[195,260],pick:[195,260],cars:[['auto',120,190],['auto',300,300],['bike',90,330]]})}
 ${topBar('Finding your Captain','choose')}
 <section class="sheet"><div class="sheet-body">
  <div><h2 style="font-size:21px">Contacting nearby Captains</h2><p class="label" style="margin-top:4px">Usually under a minute · 4 Autos nearby</p></div>
  <div class="progress indet" role="progressbar" aria-label="Searching"><i></i></div>
  <div class="tile">${route('2nd Cross St, Adyar','Chennai Airport, Terminal 1')}</div>
  <div class="row between"><span class="label">Auto · UPI</span><b class="price" style="font-size:18px">${rs(146)}</b></div>
 </div><div class="actions"><button class="btn outline block" data-go="choose">Cancel request</button></div></section></div>`;

const captainCard=(fare=true)=>`<div class="row" style="align-items:flex-start"><div class="avatar">AK</div><div class="spacer" style="min-width:0"><b style="font:600 18px Outfit">Arun Kumar</b><div class="label">Bajaj RE · Yellow-green</div><div class="row" style="gap:6px;margin-top:6px"><span class="tag">TN 07 BX 4821</span><span class="tag">${ic('star',12)} 4.8</span></div></div>${fare?`<div style="text-align:right"><div class="price">${rs(146)}</div><div class="label">UPI</div></div>`:''}</div>`;
R.pickup=()=>`<div class="screen">${map({approach:[[300,130],[215,130],[215,220],[120,220]],pick:[120,220],cars:[['auto',300,140]]})}
 ${topBar('Pickup','home',rb('share','Share trip'))}
 <section class="sheet" style="max-height:62%"><div class="sheet-body">
  <div class="row between"><span class="badge ok"><i class="pulse"></i> Arriving in 3 min</span><span class="label">650 m away</span></div>
  ${captainCard()}
  <div class="tile row between"><div><div class="label">Share this code at pickup</div><b style="font:700 26px Outfit;letter-spacing:6px">482916</b></div>${ic('lock',22)}</div>
  ${route('North gate, 2nd Cross St','Chennai Airport, Terminal 1',{swap:false})}
 </div><div class="actions"><div class="grid2"><button class="btn primary">${ic('phone',18)} Call</button><button class="btn">${ic('chat',18)} Message</button></div>
 <div class="row between"><button class="link" data-go="trip">${ic('shield',16)}&nbsp;Safety</button><button class="link" style="color:var(--danger)" data-go="home">Cancel ride</button></div></div></section></div>`;

R.trip=()=>`<div class="screen">${map({route:[[120,310],[120,220],[215,220],[215,130],[300,130]],drop:[300,130],cars:[['auto',168,220]]})}
 ${topBar('On your way','pickup',rb('share','Share live trip'))}
 <section class="sheet"><div class="sheet-body">
  <div class="row between"><div><span class="eyebrow">Arriving</span><h2 style="font-size:24px">9:58 PM</h2></div><div style="text-align:right"><b>14 min</b><div class="label">6.2 km left</div></div></div>
  <div class="progress"><i style="width:58%"></i></div>
  <div class="tile">${captainCard(false)}</div>
  <div class="notice info">${ic('shield',18)}<span>Your trip is shared with Amma. Ride check is on.</span></div>
 </div><div class="actions"><div class="grid2"><button class="btn">${ic('share',18)} Share trip</button><button class="btn danger">${ic('sos',18)} SOS</button></div><button class="btn primary block" data-go="done">Preview arrival</button></div></section></div>`;

R.done=()=>{const st=S.rider;return `<div class="screen"><div class="page no-nav"><div class="stack">
 <div class="done-mark">${ic('check',34)}</div>
 <div class="center"><h1 style="font-size:26px">You’ve arrived</h1><p class="label">Chennai Airport, Terminal 1 · 9:57 PM</p></div>
 <div class="card stack" style="gap:10px"><div class="row between"><span class="muted">Trip fare</span><b>${rs(138)}</b></div><div class="row between"><span class="muted">Booking fee</span><b>${rs(8)}</b></div><hr><div class="row between"><b>Total</b><span class="price">${rs(146)}</span></div><span class="badge warn" style="align-self:flex-start;white-space:normal">Paid to Captain by UPI · awaiting confirmation</span></div>
 <div class="card stack center"><div class="row" style="justify-content:center"><div class="avatar sm">AK</div><div style="text-align:left"><b>Rate Arun</b><div class="label">Bajaj RE · TN 07 BX 4821</div></div></div>
 <div class="stars" role="group" aria-label="Rating">${[1,2,3,4,5].map(n=>`<button data-star="${n}" aria-label="${n} star${n>1?'s':''}" aria-pressed="${n<=st.stars}">${ic('star',30)}</button>`).join('')}</div>
 <div class="chips wrap">${['Smooth driving','On time','Clean vehicle','Friendly'].map((t,i)=>`<button class="chip" data-toggle-chip aria-pressed="${i===0}">${t}</button>`).join('')}</div></div>
 <div class="grid2"><button class="btn">${ic('file',18)} Statement</button><button class="btn primary" data-go="home">Done</button></div>
 </div></div></div>`;};

R.plan=()=>{const st=S.rider,tabs=[['schedule','Schedule'],['rental','Rental'],['outstation','Outstation']];
 const body=st.plan==='rental'?`<p class="label">Keep one Captain for a few hours. Distance is included per hour.</p>
  <div class="card row between"><div><b>Hours</b><div class="label">${st.hours*10} km included</div></div><div class="row" style="gap:10px">${rb('minus','Fewer hours','data-hours="-1"')}<b class="price" aria-live="polite">${st.hours} h</b>${rb('plus','More hours','data-hours="1"')}</div></div>
  <div class="rides" role="radiogroup" aria-label="Vehicle">${['auto','mini','sedan'].map((v,i)=>{const x=VEH.find(q=>q.id===v);const f=[199,289,349][i]*st.hours;return `<button class="ride" role="radio" data-vehicle="${v}" aria-checked="${S.rider.veh===v}"><span class="pic">${img(v)}</span><span><b>${x.name}</b><small>${rs([199,289,349][i])}/hour</small></span><span class="r"><b>${rs(f)}</b><small>${st.hours} h</small></span></button>`;}).join('')}</div>`
 :st.plan==='outstation'?`<p class="label">Travel beyond the city, one way or round trip. Minimum 40 km.</p>
  <div class="card">${route('Adyar, Chennai','Puducherry',{aLabel:'From',bLabel:'To'})}</div>
  <div class="chips"><button class="chip" aria-pressed="true">Round trip</button><button class="chip">One way</button><button class="chip">${ic('calendar',16)} Sat, 8 Nov</button><button class="chip">2 days</button></div>
  <div class="rides">${['mini','sedan','suv'].map((v,i)=>`<button class="ride" role="radio" data-vehicle="${v}" aria-checked="${S.rider.veh===v}"><span class="pic">${img(v)}</span><span><b>${VEH.find(q=>q.id===v).name}</b><small>304 km · driver allowance incl.</small></span><span class="r"><b>${rs([4890,5640,7320][i])}</b><small>est.</small></span></button>`).join('')}</div>`
 :`<p class="label">Book 15 minutes to 30 days ahead. We’ll find a Captain shortly before.</p>
  <div class="card">${route('2nd Cross St, Adyar','Chennai Airport',{})}</div>
  <div class="grid2"><div class="tile"><div class="label">Date</div><b>Wed, 5 Nov</b></div><div class="tile"><div class="label">Pickup time</div><b>5:30 AM</b></div></div>
  <div class="notice info">${ic('bell',18)}<span>You can cancel free of charge until a Captain is assigned.</span></div>`;
 return `<div class="screen"><div class="page no-nav"><div class="stack">${head('Plan a trip','home')}
 <div class="seg" role="tablist" style="align-self:stretch">${tabs.map(([k,l])=>`<button style="flex:1" data-plan="${k}" aria-pressed="${st.plan===k}">${l}</button>`).join('')}</div>${body}
 <button class="btn primary block" data-go="${st.plan==='schedule'?'activity':'matching'}">${st.plan==='schedule'?'Schedule ride':'Continue'}</button></div></div></div>`;};

R.activity=()=>`<div class="screen"><div class="page"><div class="stack">${head('Activity','')}
 <div class="chips"><button class="chip" aria-pressed="true">All</button><button class="chip">Completed</button><button class="chip">Cancelled</button><button class="chip">Scheduled</button></div>
 <div class="card row"><div class="ic-box" style="width:48px;height:48px;border-radius:16px;background:var(--primary-soft);color:var(--primary-ink);display:grid;place-items:center">${ic('calendar')}</div><div class="spacer"><span class="badge brand">Upcoming</span><b style="display:block;margin-top:6px">Airport · Wed, 5 Nov, 5:30 AM</b><span class="label">Mini · est. ${rs(212)}</span></div></div>
 ${[['auto','Chennai Airport','Today, 9:35 PM',146,'ok','Completed'],['bike','Olympia Tech Park','Yesterday, 9:02 AM',74,'ok','Completed'],['mini','Phoenix Marketcity','Sun, 2 Nov',0,'bad','Cancelled'],['auto','T. Nagar','Sat, 1 Nov',121,'ok','Completed']].map(([v,d,t,f,c,l])=>`<div class="card row" style="padding:12px"><span class="ride" style="all:unset"><span class="pic" style="width:64px;height:52px;border-radius:14px;background:var(--surface-2);display:grid;place-items:center">${img(v).replace('<img','<img style="width:54px;height:40px;object-fit:contain"')}</span></span><div class="spacer" style="min-width:0"><b>${d}</b><div class="label">${t}</div></div><div style="text-align:right"><b>${f?rs(f):'—'}</b><div><span class="badge ${c}" style="padding:2px 8px;font-size:11px">${l}</span></div></div></div>`).join('')}
 </div></div>${nav('rider','activity')}</div>`;

R.wallet=()=>`<div class="screen"><div class="page"><div class="stack">${head('Wallet','')}
 <div class="wallet-card stack"><span class="label">Hop balance</span><div class="big">${rs(420)}<span style="font-size:20px">.00</span></div><div class="grid2"><button class="btn sm">${ic('plus',16)} Add money</button><button class="btn sm">${ic('gift',16)} 240 points</button></div></div>
 <p class="eyebrow">Pay with</p>
 <div class="card" style="padding:4px 16px"><div class="list">${listRow('card','UPI · Google Pay','priya@okaxis','','<span class="badge ok">Default</span>')}${listRow('cash','Cash','Pay your Captain directly')}${listRow('wallet','Hop wallet',rs(420)+' available')}</div></div>
 <div class="row between"><p class="eyebrow">Recent</p><button class="link">See all</button></div>
 <div class="card" style="padding:4px 16px"><div class="list">${listRow('arrow','Ride to Chennai Airport','Today · UPI','','<b style="color:var(--ink)">−'+rs(146)+'</b>')}${listRow('plus','Wallet top-up','Yesterday · UPI','','<b style="color:var(--success)">+'+rs(500)+'</b>')}${listRow('gift','Referral reward','1 Nov · Meena joined','','<b style="color:var(--success)">+100 pts</b>')}</div></div>
 </div></div>${nav('rider','wallet')}</div>`;

R.account=()=>`<div class="screen"><div class="page"><div class="stack">${head('Account','')}
 <div class="card row"><div class="avatar">PR</div><div class="spacer"><b style="font:600 19px Outfit">Priya Raman</b><div class="label">+91 98400 12345</div><span class="badge ok" style="margin-top:6px">${ic('check',13)} Verified</span></div>${rb('chevron','Edit profile')}</div>
 <div class="grid2">${[['pin','Saved places','3 places'],['users','Family','2 members'],['shield','Safety','Trusted contacts'],['gift','Rewards','240 points']].map(([i,t,s])=>`<button class="card" style="border:0;text-align:left;display:flex;flex-direction:column;gap:10px;color:var(--ink)"><span class="ic-box" style="width:40px;height:40px;border-radius:13px;background:var(--primary-soft);color:var(--primary-ink);display:grid;place-items:center">${ic(i,18)}</span><span><b style="display:block">${t}</b><small class="label">${s}</small></span></button>`).join('')}</div>
 <div class="card" style="padding:4px 16px"><div class="list">${listRow('settings','Preferences','Language, accessibility')}${listRow('bell','Notifications','')}${listRow('lock','Privacy & data','')}${listRow('help','Help & support','')}${listRow('logout','Sign out','')}</div></div>
 </div></div>${nav('rider','account')}</div>`;

/* ---------- Captain ---------- */
const C={};
C.home=()=>{const st=S.captain;return `<div class="screen"><div class="page"><div class="stack">
 <div class="row"><div class="avatar sm">AK</div><div class="spacer"><b style="font:600 18px Outfit">Arun Kumar</b><div class="label">Captain · ★ 4.8 · Auto</div></div>${rb('bell','Notifications','',`<i class="dot"></i>`)}</div>
 <div class="card stack"><div class="row between"><span class="badge"><i class="pulse" style="color:var(--muted)"></i> You’re offline</span><span class="label">Adyar zone</span></div>
  <div><h1 style="font-size:26px">Ready to drive?</h1><p class="label" style="margin-top:2px">High demand near Guindy right now.</p></div>
  <button class="btn primary block" data-go="online">${ic('power',18)} Go online</button></div>
 <div class="card row"><div class="ring" style="--p:62"><b>62%</b></div><div class="spacer"><span class="label">Today</span><div class="big" style="font-size:30px">${rs(1240)}</div><div class="label">of ${rs(2000)} goal · 6 trips · 5h 20m</div></div></div>
 <div class="grid3">${[['Pickup radius','3 km'],['Min. fare',rs(80)],['Acceptance','92%']].map(([l,v])=>`<div class="tile"><div class="label">${l}</div><b style="font:700 17px Outfit">${v}</b></div>`).join('')}</div>
 <div class="card switch-row" style="padding:10px 16px"><span class="ic-box" style="width:40px;height:40px;border-radius:13px;background:var(--surface-2);display:grid;place-items:center">${ic('home',18)}</span><span class="t"><b>Go-home mode</b><div class="label">Only rides toward Tambaram · 2 left today</div></span><button class="switch" role="switch" aria-label="Go-home mode" aria-checked="${st.goHome}" data-switch="goHome"></button></div>
 <div class="notice warn">${ic('alert',18)}<span><b>Insurance expires 15 Nov.</b> Upload the renewal to keep driving.</span></div>
 </div></div>${nav('captain','home')}</div>`;};

C.online=()=>`<div class="screen">${map({hot:[[230,300,70],[90,220,50],[320,130,40]],cars:[['auto',195,380]],labels:[[236,370,'GUINDY'],[150,190,'ADYAR']]})}
 <div class="topbar"><div class="title-pill"><span class="badge ok" style="padding:4px 8px"><i class="pulse"></i> Online</span>0:42 h</div><span class="spacer"></span>${rb('layers','Demand layers')}${rb('locate','Recenter')}</div>
 <section class="sheet"><div class="sheet-body">
  <div><h2 style="font-size:21px">Looking for rides</h2><p class="label">Stay near the shaded areas for faster requests.</p></div>
  <div class="grid3">${[['Today',rs(1240)],['Trips','6'],['Online','5h 20m']].map(([l,v])=>`<div class="tile"><div class="label">${l}</div><b style="font:700 17px Outfit">${v}</b></div>`).join('')}</div>
  <div class="tile row"><span class="badge brand">${ic('bolt',13)} High</span><span class="spacer">Guindy · 1.4 km away</span>${ic('chevron',18)}</div>
 </div><div class="actions"><div class="grid2"><button class="btn" data-go="home">Go offline</button><button class="btn primary" data-go="request">Preview request</button></div></div></section></div>`;

C.request=()=>`<div class="screen">${map({approach:[[30,130],[30,220],[120,220]],route:[[120,220],[215,220],[215,130],[300,130]],pick:[120,220],drop:[300,130],cars:[['auto',30,150]]})}
 <section class="sheet" style="max-height:66%"><div class="sheet-body">
  <div class="row"><div class="ring timer" style="--p:72"><b>11</b></div><div class="spacer"><span class="badge brand">New request · Auto</span><div class="row" style="gap:8px;margin-top:6px"><span class="big" style="font-size:32px">${rs(146)}</span><span class="label">UPI</span></div></div></div>
  <div class="grid2"><div class="tile"><div class="label">To pickup</div><b>0.8 km · 3 min</b></div><div class="tile"><div class="label">Trip</div><b>14.2 km · 22 min</b></div></div>
  ${route('North gate, 2nd Cross St, Adyar','Chennai Airport, Terminal 1')}
  <div class="row"><div class="avatar xs">PR</div><span class="spacer"><b>Priya R</b> <span class="label">· ★ 4.9 · 1 rider</span></span><button class="link">Counter ${rs(160)}</button></div>
 </div><div class="actions"><div class="grid2"><button class="btn" data-go="online">Decline</button><button class="btn primary" data-go="pickup">Accept ride</button></div></div></section></div>`;

const riderCard=()=>`<div class="row"><div class="avatar">PR</div><div class="spacer"><b style="font:600 18px Outfit">Priya Raman</b><div class="label">★ 4.9 · Pays by UPI</div></div><div style="text-align:right"><div class="price">${rs(146)}</div><div class="label">Auto</div></div></div>`;
C.pickup=()=>`<div class="screen">${map({approach:[[300,130],[215,130],[215,220],[120,220]],pick:[120,220],cars:[['auto',300,140]]})}
 ${topBar('To pickup','request',rb('nav','Open navigation'))}
 <section class="sheet"><div class="sheet-body">
  <div class="row between"><span class="badge ok"><i class="pulse"></i> 3 min · 650 m</span><span class="label">Rider notified</span></div>
  ${riderCard()}
  <div class="tile">${route('North gate, 2nd Cross St, Adyar','Chennai Airport, Terminal 1')}</div>
 </div><div class="actions"><div class="grid2"><button class="btn">${ic('phone',18)} Call</button><button class="btn">${ic('chat',18)} Message</button></div><button class="btn primary block" data-go="code">I’ve arrived</button></div></section></div>`;

C.code=()=>`<div class="screen"><div class="page no-nav"><div class="stack">${head('Start the trip','pickup')}
 <div class="card stack"><div><h2 style="font-size:20px">Enter pickup code</h2><p class="label" style="margin-top:4px">Ask Priya for the 6-digit code shown in her app.</p></div>
 <label class="code-wrap ${S.captain.codeErr?'err':''}"><input inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Six-digit pickup code" data-code><span class="code" aria-hidden="true">${[0,1,2,3,4,5].map(i=>`<span class="${i===0?'cur':''}"></span>`).join('')}</span></label>
 ${S.captain.codeErr?`<p class="err-text" role="alert">Enter all 6 digits to continue.</p>`:''}
 <button class="btn primary block" data-verify>Verify & start trip</button></div>
 ${riderCard()}
 <button class="link" style="align-self:center">Rider not here? Report no-show</button>
 </div></div></div>`;

C.trip=()=>`<div class="screen">${map({route:[[120,310],[120,220],[215,220],[215,130],[300,130]],drop:[300,130],cars:[['auto',168,220]]})}
 ${topBar('Drop-off','pickup',rb('nav','Open navigation'))}
 <section class="sheet"><div class="sheet-body">
  <div class="row between"><div><span class="eyebrow">Drop at</span><h2 style="font-size:21px">Chennai Airport, T1</h2></div><div style="text-align:right"><b>14 min</b><div class="label">6.2 km</div></div></div>
  <div class="progress"><i style="width:58%"></i></div>
  <div class="tile row"><div class="avatar xs">PR</div><span class="spacer"><b>Priya Raman</b><div class="label">${rs(146)} · UPI</div></span>${rb('phone','Call rider')}</div>
 </div><div class="actions"><div class="grid2"><button class="btn danger">${ic('sos',18)} SOS</button><button class="btn primary" data-go="collect">Complete trip</button></div></div></section></div>`;

C.collect=()=>{const m=S.captain.collect;return `<div class="screen"><div class="page no-nav"><div class="stack">${head('Collect payment','trip')}
 <div class="card stack center"><span class="label">Amount due</span><div class="big">${rs(146)}</div>
 <div class="seg" style="align-self:center">${['UPI','Cash'].map(k=>`<button data-collect="${k}" aria-pressed="${m===k}" style="min-width:96px">${k}</button>`).join('')}</div>
 ${m==='UPI'?`<div class="qr">${qr()}</div><p class="label">Rider scans to pay <b style="color:var(--ink)">arun.k@okhdfc</b></p>`:`<div class="tile row" style="justify-content:center">${ic('cash',22)}<b>Collect ${rs(146)} in cash</b></div>`}</div>
 <div class="notice info">${ic('help',18)}<span>Direct UPI and cash are recorded from your report. Hop doesn’t verify these payments.</span></div>
 <button class="btn primary block" data-go="earnings">Payment received</button><button class="btn outline block">Rider couldn’t pay</button>
 </div></div></div>`;};
function qr(){let s='<svg viewBox="0 0 25 25" width="100%" height="100%" shape-rendering="crispEdges" aria-label="Sample UPI QR code" role="img">';let seed=7;const r=()=>(seed=(seed*9301+49297)%233280)/233280;
  const fin=(x,y)=>`<rect x="${x}" y="${y}" width="7" height="7" fill="#14151f"/><rect x="${x+1}" y="${y+1}" width="5" height="5" fill="#fff"/><rect x="${x+2}" y="${y+2}" width="3" height="3" fill="#14151f"/>`;
  for(let y=0;y<25;y++)for(let x=0;x<25;x++){if((x<8&&y<8)||(x>16&&y<8)||(x<8&&y>16))continue;if(r()>.52)s+=`<rect x="${x}" y="${y}" width="1" height="1" fill="#14151f"/>`;}
  return s+fin(0,0)+fin(18,0)+fin(0,18)+'</svg>';}

C.earnings=()=>{const st=S.captain,d=[[ 'M',62],['T',80],['W',45],['T',92],['F',70],['S',100],['S',38]];return `<div class="screen"><div class="page"><div class="stack">${head('Earnings','')}
 <div class="seg">${[['today','Today'],['week','This week'],['month','Month']].map(([k,l])=>`<button style="flex:1" data-period="${k}" aria-pressed="${st.period===k}">${l}</button>`).join('')}</div>
 <div class="card stack"><div class="row between"><div><span class="label">${st.period==='today'?'Today':st.period==='week'?'3 – 9 Nov':'November'}</span><div class="big">${rs(st.period==='today'?1240:st.period==='week'?8460:21380)}</div></div><span class="badge ok">+12% vs last</span></div>
 <div class="bars">${d.map(([l,v],i)=>`<div class="${i===5?'on':''}"><i style="height:${v}%"></i><small>${l}</small></div>`).join('')}</div></div>
 <div class="grid3">${[['Trips','41'],['Online','32 h'],['Avg fare',rs(206)]].map(([l,v])=>`<div class="tile"><div class="label">${l}</div><b style="font:700 17px Outfit">${v}</b></div>`).join('')}</div>
 <div class="card row"><span class="ic-box" style="width:44px;height:44px;border-radius:14px;background:var(--success-soft);color:var(--success);display:grid;place-items:center">${ic('wallet')}</span><div class="spacer"><b>Next payout · Fri</b><div class="label">${rs(3120)} to HDFC ••4821</div></div><button class="link">Details</button></div>
 <div class="card" style="padding:4px 16px"><div class="list">${listRow('route','Adyar → Airport','Today, 9:35 PM · UPI','','<b style="color:var(--ink)">'+rs(146)+'</b>')}${listRow('route','Guindy → T. Nagar','Today, 7:10 PM · Cash','','<b style="color:var(--ink)">'+rs(118)+'</b>')}${listRow('route','Velachery → Adyar','Today, 5:42 PM · UPI','','<b style="color:var(--ink)">'+rs(164)+'</b>')}</div></div>
 </div></div>${nav('captain','earnings')}</div>`;};

C.documents=()=>`<div class="screen"><div class="page"><div class="stack">${head('Vehicle & documents','')}
 <div class="card row"><div class="pic" style="width:96px;height:80px;border-radius:18px;background:var(--surface-2);display:grid;place-items:center">${img('auto').replace('<img','<img style="width:80px;height:66px;object-fit:contain"')}</div><div class="spacer"><b style="font:600 18px Outfit">Bajaj RE</b><div class="label">Yellow-green · Auto</div><span class="tag" style="margin-top:6px">TN 07 BX 4821</span></div></div>
 <div class="notice warn">${ic('alert',18)}<span><b>Insurance expires 15 Nov 2026.</b> You’ll go offline automatically after this date.</span></div>
 <div class="card" style="padding:4px 16px"><div class="list">
  ${listRow('user','Profile photo','Approved','','<span class="badge ok">'+ic('check',13)+' Verified</span>')}
  ${listRow('file','Identity (Aadhaar)','Approved','','<span class="badge ok">'+ic('check',13)+' Verified</span>')}
  ${listRow('file','Driving licence','Valid until Aug 2031','','<span class="badge ok">'+ic('check',13)+' Verified</span>')}
  ${listRow('file','Registration (RC)','Approved','','<span class="badge ok">'+ic('check',13)+' Verified</span>')}
  ${listRow('file','Insurance','Expires in 12 days','','<span class="badge warn">Update</span>')}
 </div></div>
 <button class="btn primary block">${ic('upload',18)} Upload renewal</button>
 </div></div>${nav('captain','documents')}</div>`;

C.account=()=>`<div class="screen"><div class="page"><div class="stack">${head('Account','')}
 <div class="card row"><div class="avatar">AK</div><div class="spacer"><b style="font:600 19px Outfit">Arun Kumar</b><div class="label">+91 98410 55678 · Captain since 2024</div><span class="badge ok" style="margin-top:6px">${ic('check',13)} Approved</span></div></div>
 <div class="grid3">${[['Rating','4.8'],['Trips','1,240'],['Years','2']].map(([l,v])=>`<div class="tile center"><b style="font:700 19px Outfit">${v}</b><div class="label">${l}</div></div>`).join('')}</div>
 <div class="card" style="padding:4px 16px"><div class="list">${listRow('target','Ride preferences','Pickup radius 3 km · min fare '+rs(80))}${listRow('wallet','Payout account','HDFC ••4821')}${listRow('user','Personal details','')}${listRow('shield','Safety','Emergency contacts, SOS')}${listRow('help','Help & support','')}${listRow('logout','Sign out','')}</div></div>
 </div></div>${nav('captain','account')}</div>`;

const SCREENS={
  rider:[['home','Home'],['search','Where to'],['choose','Choose a ride'],['fare','Offer your fare'],['matching','Finding a Captain'],['pickup','Captain on the way'],['trip','On the trip'],['done','Arrived & rate'],['plan','Schedule · rental · outstation'],['activity','Activity'],['wallet','Wallet'],['account','Account']],
  captain:[['home','Drive · offline'],['online','Online · demand'],['request','Ride request'],['pickup','Going to pickup'],['code','Pickup code'],['trip','Trip in progress'],['collect','Collect payment'],['earnings','Earnings'],['documents','Vehicle & documents'],['account','Account']],
};
const FLOW={rider:['home','search','choose','matching','pickup','trip','done'],captain:['home','online','request','pickup','code','trip','collect','earnings']};

function statusBar(){return `<div class="status"><span>9:41</span><span class="sb"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5" width="3" height="7" rx="1" fill="currentColor"/><rect x="10" y="2" width="3" height="10" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg><svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor"/><rect x="24" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5"/></svg></span></div>`;}

function render(role){
  const host=document.querySelector(`[data-role=${role}]`);if(!host)return;
  const st=S[role],fn=(role==='rider'?R:C)[st.screen];
  const phone=host.querySelector('.phone');phone.dataset.screen=st.screen;
  phone.innerHTML=statusBar()+fn();
  host.querySelector('select').value=st.screen;
}
function go(role,screen){S[role].screen=screen;if(role==='captain')S.captain.codeErr=false;render(role);const p=document.querySelector(`[data-role=${role}] .page,[data-role=${role}] .sheet-body`);if(p)p.scrollTop=0;}

function mount(){
  const gal=document.getElementById('gallery');
  gal.innerHTML=['rider','captain'].map(role=>`<section class="device" data-role="${role}" aria-label="${role==='rider'?'Rider':'Captain'} app"><div class="device-bar"><strong>${role==='rider'?'Rider':'Captain'}</strong><select data-screen aria-label="${role} screen">${SCREENS[role].map(([k,l],i)=>`<option value="${k}">${String(i+1).padStart(2,'0')} · ${l}</option>`).join('')}</select><button class="next" data-next>Next ${'→'}</button></div><div class="phone"></div></section>`).join('');
  render('rider');render('captain');
  gal.addEventListener('change',e=>{const d=e.target.closest('[data-role]');if(e.target.matches('select[data-screen]'))go(d.dataset.role,e.target.value);});
  gal.addEventListener('input',e=>{if(e.target.matches('[data-code]')){const v=e.target.value.replace(/\D/g,'').slice(0,6);e.target.value=v;e.target.parentNode.querySelectorAll('.code span').forEach((b,i)=>{b.textContent=v[i]||'';b.classList.toggle('cur',i===Math.min(v.length,5));});}});
  gal.addEventListener('click',e=>{
    const d=e.target.closest('[data-role]');if(!d)return;const role=d.dataset.role,st=S[role],t=e.target.closest('button');if(!t)return;
    if(t.matches('[data-next]')){const f=FLOW[role],i=f.indexOf(st.screen);return go(role,f[(i+1)%f.length]);}
    if(t.dataset.pick)st.veh=t.dataset.pick;
    if(t.dataset.plan&&!t.dataset.go){st.plan=t.dataset.plan;return render(role);}
    if(t.dataset.plan)st.plan=t.dataset.plan;
    if(t.dataset.go!==undefined&&t.dataset.go!=='')return go(role,t.dataset.go);
    if(t.dataset.tab){st.tab=t.dataset.tab;return render(role);}
    if(t.dataset.vehicle){st.veh=t.dataset.vehicle;return render(role);}
    if(t.dataset.offer){st.offer=Math.max(100,Math.min(260,st.offer+ +t.dataset.offer));return render(role);}
    if(t.dataset.hours){st.hours=Math.max(1,Math.min(12,st.hours+ +t.dataset.hours));return render(role);}
    if(t.dataset.star){st.stars=+t.dataset.star;return render(role);}
    if(t.hasAttribute('data-toggle-chip')){t.setAttribute('aria-pressed',t.getAttribute('aria-pressed')!=='true');return;}
    if(t.hasAttribute('data-cycle-pay')){const o=['UPI','Cash','Wallet'];st.pay=o[(o.indexOf(st.pay)+1)%3];return render(role);}
    if(t.dataset.switch){st[t.dataset.switch]=!st[t.dataset.switch];return render(role);}
    if(t.dataset.collect){st.collect=t.dataset.collect;return render(role);}
    if(t.dataset.period){st.period=t.dataset.period;return render(role);}
    if(t.hasAttribute('data-verify')){const v=d.querySelector('[data-code]').value;if(/^\d{6}$/.test(v))return go(role,'trip');st.codeErr=true;render(role);d.querySelector('[data-code]').focus();}
  });
  // Review toolbar
  const setView=v=>{document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===v));
    document.getElementById('palette').hidden=v!=='palette';gal.hidden=v==='palette';
    gal.querySelectorAll('.device').forEach(x=>x.hidden=!(v==='both'||v===x.dataset.role));
    try{localStorage.setItem('hop03-view',v)}catch{}};
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  const setTheme=t=>{document.documentElement.dataset.theme=t;document.querySelectorAll('[data-theme-btn]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.themeBtn===t));};
  document.querySelectorAll('[data-theme-btn]').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.themeBtn)));
  const q=new URLSearchParams(location.search);
  setTheme(q.get('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
  let v=q.get('view');if(!v){try{v=localStorage.getItem('hop03-view')}catch{}}setView(v||'both');
}
window.hopConcept={screens:SCREENS,go,state:S};
mount();
