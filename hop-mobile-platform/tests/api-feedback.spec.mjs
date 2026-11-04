import { test,expect } from '@playwright/test';
import { setupMockBackend } from './support/mockBackend.mjs';
import { fileURLToPath } from 'node:url';
const modulePath=`/@fs${fileURLToPath(new URL('../shared/services/client.ts',import.meta.url))}`;
test('network and timeout failures show actionable messages without inventing success',async({page})=>{
 await setupMockBackend(page);await page.goto('http://127.0.0.1:5183');
 const results=await page.evaluate(async(path)=>{
  const {HopAPI}=await import(path);const results=[];
  for(const name of ['TypeError','TimeoutError']) {
   const api=new HopAPI(async()=>{const error=new Error('Internal transport details');error.name=name;throw error;});
   try {await api.request('/api/example');results.push('unexpected success');}catch(error){results.push({message:error.message,status:error.status});}
  }return results;
 },modulePath);
 expect(results).toEqual([{message:'We couldn’t connect. Check your internet connection and try again.',status:0},{message:'The request took too long. Please try again.',status:0}]);
});
test('HTTP feedback preserves validation messages and avoids raw status-code fallbacks',async({page})=>{
 await setupMockBackend(page);await page.goto('http://127.0.0.1:5183');
 const results=await page.evaluate(async(path)=>{
  const {HopAPI}=await import(path);const messages=[];
  for(const [status,body] of [[503,{}],[429,{}],[400,{error:'Enter a valid mobile number'}]]) {
   const api=new HopAPI(async()=>new Response(JSON.stringify(body),{status}));
   try {await api.request('/api/example');}catch(error){messages.push(error.message);}
  }return messages;
 },modulePath);
 expect(results).toEqual(['Something went wrong. Please try again.','Too many attempts. Please wait a moment and try again.','Enter a valid mobile number']);
});
