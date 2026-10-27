import { test, expect, type Page } from '@playwright/test';
const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
const details = { id: 'ui-user', name: 'Responsive Test Rider With A Long Name', email: 'ui@example.invalid', phone: '9092112969', phone_verified: true, phone_login: true, has_photo: false, photo_approved: false, created_at: '2026-01-01T00:00:00Z', gender: '', birth_date: null, avatar_color: 'indigo', default_payment: 'cash', default_vehicle: '', company_name: '', business_gstin: '', cost_centre: '', work_email: '', deletion_requested_at: null };
const stats = { rides_taken: 0, rides_cancelled: 0, spent_paise: 0, meters: 0, rating_avg: null, rating_count: 0, wallet_paise: 0, reward_points: 0, drives_completed: 0, saved_places: 0 };
async function fixture(page: Page, captain: boolean) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const bodies: Record<string, unknown> = {
      '/api/config': { areas: [{ id: 'chennai', name: 'Chennai', min_lat: 12.8, max_lat: 13.2, min_lng: 80, max_lng: 80.4 }], vehicles: [], development: true, phone_login: true },
      '/api/me': { user: { id: 'ui-user', name: details.name, email: details.email, role: 'rider' }, csrf: 'ui-test' },
      '/api/state': { rides: [], driver: captain ? [{ user_id: 'ui-user', area_id: 'chennai', status: 'approved', online: false, vehicle_category: 'auto', vehicle_number: 'TN22EB2250', pickup_radius_meters: 3000, minimum_fare_paise: 0, upi_id: '', review_note: '', location_at: '', license_expires: '2028-01-01', insurance_expires: '2028-01-01' }] : [], offers: [], incidents: [], saved_locations: [] },
      '/api/profile': { details: [details], stats: [stats], contacts: [] },
      '/api/drivers/insights': { totals: [], days: [], areas: [], methods: [], types: [], peak_hours: [], trips: [] },
      '/api/nearby': { nearby: [], drivers: [] },
      '/api/wallet': { balance_paise: 0, entries: [], gateway: false, dev_topup: true },
      '/api/promos': { promos: [] },
      '/api/notifications/new': { notifications: [], now: '2026-10-26T00:00:00Z' },
      '/api/companion': { preferences: { language: 'en', notifications_enabled: true }, notifications: [], referral: [], rewards: [], family: [], favorite_drivers: [], scheduled_rides: [], lost_items: [] },
      '/api/drivers/earnings': { summary: { today_fare_paise: 0, today_completed_trips: 0 }, rides: [] },
      '/api/drivers/wallet': { balance_paise: 0, upi_id: '', min_payout_paise: 10000, ledger: [], payouts: [], daily: [], safety: { score: 100, label: 'Good', cancellations: 0, incidents: 0, rating_avg: 0, ratings: 0, completed_trips: 0 } },
    };
    if (!(path in bodies)) return route.fulfill({ status: 404, json: { error: `Unmocked endpoint: ${path}` } });
    return route.fulfill({ json: bodies[path] });
  });
}
const captain = {id:'11111111-1111-4111-8111-111111111111',name:'Arun Captain With A Longer Name',vehicle_category:'auto',vehicle_number:'TN22EB2250',accepts_circle:true,rides_together:3};
async function circleFixture(page:Page,isCaptain:boolean,enabled=true){
 await fixture(page,isCaptain);
 await page.route('**/api/config',r=>r.fulfill({json:{areas:[{id:'chennai',name:'Chennai',min_lat:12.8,max_lat:13.2,min_lng:80,max_lng:80.4}],vehicles:[],development:true,phone_login:true,features:{hopCircle:enabled}}}));
 let captains=[captain];let opted=false;let blocked:{id:string;name:string}[]=[];
 let invitations=[{id:'ride-circle',version:1,rider_id:'rider-one',rider_name:'Meena',vehicle_category:'auto',pickup_label:'Main entrance, Chennai',dropoff_label:'Central railway station, Chennai',fare_paise:6000,expires_at:'2099-01-01T00:00:00Z'}];
 const writes:{path:string;body:any}[]=[];const reads:string[]=[];
 await page.route('**/api/**circle**',route=>{
  const path=new URL(route.request().url()).pathname;reads.push(path);
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();writes.push({path,body});
   if(path==='/api/drivers/circle/preferences')opted=body.opted_in;
   if(path.endsWith('/remove'))captains=[];
   if(path==='/api/circle/captains')captains=[captain];
   if(path.includes('/blocks/')){blocked=body.blocked?[{id:'rider-one',name:'Meena'}]:[];invitations=[];}
   return route.fulfill({json:{ok:true}});
  }
  if(path==='/api/circle/captains')return route.fulfill({json:{captains}});
  if(path==='/api/drivers/circle/preferences')return route.fulfill({json:{opted_in:opted,blocked_riders:blocked}});
  if(path==='/api/drivers/circle/invitations')return route.fulfill({json:{invitations:opted?invitations:[]}});
  return route.fulfill({status:404,json:{error:'Unknown Circle path'}});
 });
 await page.route('**/api/rides/ride-circle/**',route=>{
  const path=new URL(route.request().url()).pathname;writes.push({path,body:route.request().postDataJSON()});invitations=[];
  return route.fulfill({json:{ok:true}});
 });
 return {writes,reads};
}
async function openSection(page:Page,name:string,width:number){
 if(width>820)await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name,exact:true}).click();
 else{await page.getByRole('button',{name:'Open app menu',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();}
}
for(const isCaptain of [false,true])for(const theme of ['light','dark'])for(const width of [320,375,390,430,768,1024,1440,1920]){
 test(`circle layout ${isCaptain?'captain':'rider'} ${theme} ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:950});await page.addInitScript(t=>localStorage.setItem('hop.theme',t),theme);
  await circleFixture(page,isCaptain);await page.goto(`http://127.0.0.1:${isCaptain?5174:5173}`);
  await openSection(page,isCaptain?'Vehicle':'Safety & more',width);
  const panel=page.getByRole('region',{name:isCaptain?'Captain Hop Circle':'Hop Circle',exact:true});
  await expect(panel.getByRole('heading',{name:'Hop Circle',exact:true})).toBeVisible();
  if(isCaptain){await panel.getByLabel('Accept preferred Circle invitations').click();await expect(panel.getByText('Meena · ₹60.00')).toBeVisible();}
  else await expect(panel.getByText(captain.name,{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await panel.screenshot({path:info.outputPath('circle.png')});
 });
}
for(const isCaptain of [false,true])test(`flag off leaves legacy ${isCaptain?'captain':'rider'} untouched`,async({page})=>{
 const {reads}=await circleFixture(page,isCaptain,false);await page.goto(`http://127.0.0.1:${isCaptain?5174:5173}`);await openSection(page,isCaptain?'Vehicle':'Safety & more',1280);
 await expect(page.getByRole('heading',{name:'Hop Circle',exact:true})).toHaveCount(0);
 if(!isCaptain)await expect(page.getByRole('heading',{name:'Favorite drivers',exact:true})).toBeVisible();
 expect(reads).toHaveLength(0);
});
test('rider removes a Circle Captain and sees the empty state',async({page})=>{
 const {writes}=await circleFixture(page,false);await page.goto('http://127.0.0.1:5173');await openSection(page,'Safety & more',1280);
 const panel=page.getByRole('region',{name:'Hop Circle',exact:true});
 await panel.getByRole('button',{name:`Remove ${captain.name} from Circle`}).click();
 await expect(panel.getByText('Your Circle starts after a completed ride.',{exact:false})).toBeVisible();expect(writes[0].path).toBe(`/api/circle/captains/${captain.id}/remove`);
});
test('Captain opts in, declines, blocks and unblocks using existing acceptance paths',async({page})=>{
 const {writes}=await circleFixture(page,true);await page.goto('http://127.0.0.1:5174');await openSection(page,'Vehicle',1280);
 const panel=page.getByRole('region',{name:'Captain Hop Circle',exact:true});
 await panel.getByLabel('Accept preferred Circle invitations').click();
 await expect(panel.getByRole('button',{name:'Accept Circle ride'})).toBeVisible();
 await panel.getByRole('button',{name:'Block Circle requests',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Unblock',exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Unblock',exact:true}).click();
 await expect(panel.getByText('You have not blocked any Circle requests.')).toBeVisible();
 expect(writes.some(w=>w.path.endsWith('/blocks/rider-one')&&w.body.blocked===true)).toBe(true);
 await panel.getByLabel('Accept preferred Circle invitations').click();await expect(panel.getByLabel('Accept preferred Circle invitations')).not.toBeChecked();
});
test('Circle load errors can be retried',async({page})=>{
 await circleFixture(page,false);let calls=0;
 await page.route('**/api/circle/captains',r=>{calls++;return r.fulfill(calls===1?{status:503,json:{error:'Circle temporarily unavailable'}}:{json:{captains:[]}});});
 await page.goto('http://127.0.0.1:5173');await openSection(page,'Safety & more',1280);
 const panel=page.getByRole('region',{name:'Hop Circle',exact:true});await expect(panel.getByRole('alert')).toContainText('Circle temporarily unavailable');await panel.getByRole('button',{name:'Retry Circle'}).click();await expect(panel.getByText('Your Circle starts after a completed ride.',{exact:false})).toBeVisible();
});

test('Captain can accept an invitation using the normal versioned action',async({page})=>{
 const {writes}=await circleFixture(page,true);await page.goto('http://127.0.0.1:5174');await openSection(page,'Vehicle',1280);
 const panel=page.getByRole('region',{name:'Captain Hop Circle',exact:true});
 await panel.getByLabel('Accept preferred Circle invitations').click();await panel.getByRole('button',{name:'Accept Circle ride'}).click();
 await expect(panel.getByText('No preferred invitations right now.',{exact:false})).toBeVisible();
 expect(writes.some(w=>w.path==='/api/rides/ride-circle/actions'&&w.body.action==='accept'&&w.body.version===1)).toBe(true);
});
test('Captain can decline without changing normal ride availability',async({page})=>{
 const {writes}=await circleFixture(page,true);await page.goto('http://127.0.0.1:5174');await openSection(page,'Vehicle',1280);
 const panel=page.getByRole('region',{name:'Captain Hop Circle',exact:true});
 await panel.getByLabel('Accept preferred Circle invitations').click();await panel.getByRole('button',{name:'Decline',exact:true}).click();
 await expect(panel.getByText('No preferred invitations right now.',{exact:false})).toBeVisible();
 expect(writes.some(w=>w.path==='/api/rides/ride-circle/decline')).toBe(true);
});
test('Rider Circle request preserves quote and payment contracts',async({page})=>{
 await page.context().grantPermissions(['geolocation']);await page.context().setGeolocation({latitude:13.02,longitude:80.18});
 await circleFixture(page,false);
 const vehicle={area_id:'chennai',category:'auto',name:'Auto-rickshaw',base_paise:3000,per_km_paise:1500,minimum_paise:3000,pricing_version:1,stop_fee_paise:500,hourly_paise:null,outstation_per_km_paise:null};
 await page.route('**/api/config',r=>r.fulfill({json:{areas:[{id:'chennai',name:'Chennai',min_lat:12.8,max_lat:13.2,min_lng:80,max_lng:80.4}],vehicles:[vehicle],development:true,phone_login:true,features:{hopCircle:true}}}));
 await page.route('**/api/state',r=>r.fulfill({json:{rides:[],driver:[],offers:[],incidents:[],saved_locations:[{id:'work',label:'Office',place_label:'Office entrance',kind:'work',lat:13.04,lng:80.2}]}}));
 await page.route('**/api/reverse**',r=>r.fulfill({json:{lat:13.02,lng:80.18,label:'Home entrance'}}));
 await page.route('**/api/estimates',r=>r.fulfill({json:{meters:2000,seconds:600,route:[],options:[{category:'auto',fare_paise:6000}]}}));
 await page.route('**/api/quotes',r=>r.fulfill({json:{id:'quote-circle',meters:2000,seconds:600,fare_paise:6000,vehicle_category:'auto',vehicle_name:'Auto-rickshaw',route:[],expires_at:'2099-01-01T00:00:00Z',fare_breakdown:{base_paise:3000,distance_paise:3000,platform_fee_paise:0,total_paise:6000}}}));
 let body:any;
 await page.route('**/api/rides',r=>{body=r.request().postDataJSON();return r.fulfill({json:{id:'one-circle-ride'}});});
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Office',exact:false}).first().click();await page.getByRole('button',{name:'Choose a ride',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByLabel('Offer to Hop Circle first')).toBeEnabled();await page.getByLabel('Offer to Hop Circle first').check();await page.getByLabel('Preferred Circle Captain').selectOption(captain.id);
 await page.getByRole('button',{name:'Request Auto-rickshaw',exact:true}).click();await expect.poll(()=>body?.circle).toBe(true);
 expect(body.circle_captain_id).toBe(captain.id);expect(body.quote_id).toBe('quote-circle');expect(body.payment_method).toBe('cash');expect(body.favorite_first).toBeUndefined();
});
