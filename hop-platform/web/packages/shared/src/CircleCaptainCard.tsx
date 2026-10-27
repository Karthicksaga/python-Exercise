import type {ReactNode} from 'react';
import type {CircleCaptain} from './circle';
import {IconSteeringWheel} from '@tabler/icons-react';
import './circle.css';
export default function CircleCaptainCard({captain,action}:{captain:CircleCaptain;action?:ReactNode}){
 return <article className="circle-captain"><span className="circle-captain-icon" aria-hidden="true"><IconSteeringWheel size={24}/></span><div><strong>{captain.name}</strong><p>{captain.vehicle_category} · {captain.vehicle_number}</p><small>{captain.rides_together} completed {captain.rides_together===1?'ride':'rides'} together · {captain.accepts_circle?'Participating in Circle':'Preferred invitations unavailable'}</small></div>{action}</article>;
}
