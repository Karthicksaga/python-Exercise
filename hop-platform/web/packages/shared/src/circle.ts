import { api } from './api';
export const defaultFeatures = {hopCircle:false,transparentFareBreakdown:false,smartFareAgreement:false,hopCommute:false,smartRouteMatching:false,tamilVoiceBooking:false,hopAssist:false,hopTrust:false,hopFareLock:false,hopFamily:false};
export type FeatureFlags = typeof defaultFeatures;
export function parseFeatures(value?: Partial<FeatureFlags>): FeatureFlags {
 return Object.fromEntries(Object.keys(defaultFeatures).map(key=>[key,value?.[key as keyof FeatureFlags]===true])) as FeatureFlags;
}
export type CircleCaptain = {id:string;name:string;vehicle_category:string;vehicle_number:string;accepts_circle:boolean;rides_together:number};
export type CirclePreferences = {opted_in:boolean;blocked_riders:{id:string;name:string}[]};
export type CircleInvitation = {id:string;version:number;rider_id:string;rider_name:string;pickup_label:string;dropoff_label:string;fare_paise:number;expires_at:string;vehicle_category:string};
export const circleCaptains = () => api<{captains:CircleCaptain[]}>('/api/circle/captains');
export const circleChanged = () => window.dispatchEvent(new Event('hop-circle-changed'));
