export const referencePathLoss = (frequencyGHz:number) => 20 * Math.log10(frequencyGHz * 1000) - 27.55
export function rssiAt(distanceUnits:number, frequencyGHz:number, powerDbm:number, exponent:number, scale:number, wallLoss:number, receiverGain=0){
 const d=Math.max(.2,distanceUnits*scale); const pl=referencePathLoss(frequencyGHz)+10*exponent*Math.log10(d); return Math.max(-100,Math.min(-20,powerDbm+receiverGain-pl-wallLoss))
}
