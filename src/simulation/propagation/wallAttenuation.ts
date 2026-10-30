import type { Point2, Wall } from './propagationTypes'
export const attenuation={partition:3,glass:2,exterior:10} as const
const cross=(a:Point2,b:Point2,c:Point2)=> (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)
const intersects=(a:Point2,b:Point2,c:Point2,d:Point2)=>{const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);return ((ab1>0&&ab2<0)||(ab1<0&&ab2>0))&&((cd1>0&&cd2<0)||(cd1<0&&cd2>0))}
export function wallLoss(from:Point2,to:Point2,walls:Wall[]){const hit=new Set<string>();walls.forEach(w=>{if(intersects(from,to,w.a,w.b))hit.add(w.id)});return [...hit].reduce((sum,id)=>sum+attenuation[walls.find(w=>w.id===id)!.material],0)}
