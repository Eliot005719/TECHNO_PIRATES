export type Building = { id: string; name: string; position: [number, number, number]; size: [number, number, number]; color: string; status: 'visual_approximation' }
export const visualGeometryMeta = { source: 'illustrative visual geometry', accuracy_status: 'not_geographic_or_metric', coordinate_system: 'scene units' } as const
export const campusBuildings: Building[] = [
  { id: '6', name: 'Library / Learning Technology Center', position: [-13, 1.8, 4], size: [5, 3.6, 4], color: '#8771d7', status: 'visual_approximation' },
  { id: '9B', name: 'Student Services Center', position: [-7, 1.5, 8], size: [4.5, 3, 3], color: '#b8a8f1', status: 'visual_approximation' },
  { id: '60', name: 'Science Laboratories', position: [-8, 2, -7], size: [6, 4, 3], color: '#7158c8', status: 'visual_approximation' },
  { id: '410', name: 'Student Center', position: [0, 2.4, 1], size: [7, 4.8, 5], color: '#5e43b7', status: 'visual_approximation' },
  { id: '720', name: 'Gymnasium / Wellness Center', position: [13, 2, 1], size: [8, 4, 4], color: '#947ee0', status: 'visual_approximation' },
  { id: 'arts', name: 'Performing Arts', position: [-17, 1.4, -2], size: [4, 2.8, 3], color: '#d5cef5', status: 'visual_approximation' },
  { id: 'athletics', name: 'Athletics', position: [15, 1.2, -8], size: [7, 2.4, 4], color: '#c3b8ec', status: 'visual_approximation' }
]

export const rooms = [
  { id: 'lobby', name: 'Welcome Lobby', type: 'lobby', position: [-6, 0, 0], size: [5, 3.5, 5], accuracy_status: 'illustrative' },
  { id: 'storage_room_01', name: 'Storage Room', type: 'storage', position: [5, 0, 0], size: [12, 3.5, 9], accuracy_status: 'illustrative' },
  { id: 'classroom_a', name: 'Seminar Room', type: 'classroom', position: [5, 0, -7], size: [8, 3.5, 5], accuracy_status: 'illustrative' }
] as const
