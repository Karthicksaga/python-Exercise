// Push delivery only. No application/API or map response caching.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let message={title:'Hop',body:'You have a new ride update',tag:'hop-rides'};
 try{const payload=event.data.json();message={title:String(payload.title||message.title),body:String(payload.body||message.body),tag:String(payload.tag||message.tag)};}catch{}
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  if(windows.some(client=>client.visibilityState==='visible'))return;
  return self.registration.showNotification(message.title,{body:message.body,tag:message.tag,data:{url:'/'}});
 }));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>windows[0]?windows[0].focus():self.clients.openWindow('/')));});
