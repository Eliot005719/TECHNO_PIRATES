export type WifiNode = { id: string; name: string; position: [number, number, number]; band: '5 GHz' | '6 GHz'; active: boolean; scope: 'campus' | 'building'; building?: string; room?: string; connections: string[]; accuracy_status: 'simulated_illustrative' }
export const wifiNodes: WifiNode[] = [
  { id:'ap-campus-west', name:'Campus West', position:[-14,4,4], band:'6 GHz', active:true, scope:'campus', connections:['ap-campus-core','ap-410-hall'], accuracy_status:'simulated_illustrative' },
  { id:'ap-campus-core', name:'Campus Core', position:[0,5,1], band:'6 GHz', active:true, scope:'campus', connections:['ap-campus-west','ap-campus-east','ap-410-hall'], accuracy_status:'simulated_illustrative' },
  { id:'ap-campus-east', name:'Campus East', position:[13,4,1], band:'5 GHz', active:true, scope:'campus', connections:['ap-campus-core'], accuracy_status:'simulated_illustrative' },
  { id:'ap-410-hall', name:'410 Hallway', position:[-5,2.8,0], band:'5 GHz', active:true, scope:'building', building:'410', room:'hallway', connections:['ap-campus-core','ap-410-storage'], accuracy_status:'simulated_illustrative' },
  { id:'ap-410-storage', name:'410 Storage', position:[5,2.8,0], band:'6 GHz', active:true, scope:'building', building:'410', room:'storage_room_01', connections:['ap-410-hall'], accuracy_status:'simulated_illustrative' }
]
export const wifiMeshMeta = { source:'virtual Wi-Fi mesh configuration', accuracy_status:'simulated_illustrative', note:'No signal measurements, RF calculation, or live network integration.' } as const
