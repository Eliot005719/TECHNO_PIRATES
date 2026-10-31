import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useCampus } from '../../context/CampusContext'
import './WifiSensingExperience.css'

const DURATION = 42
const TITLES = [
  'Wi-Fi Propagation & Coverage Modelling',
  'Human Activity Recognition Through Wi-Fi Sensing',
  'Wi-Fi-Based Spatial Environment Reconstruction'
]
const TAB_LABELS = ['1 Coverage modelling', '2 Activity recognition', '3 Spatial reconstruction']
const CAPTIONS: [number, string][][] = [
  [
    [0, 'A low-poly model of the campus: buildings, corridors and open ground.'],
    [4, 'Five virtual access points are placed across the campus.'],
    [9, 'Each access point transmits. Waves spread outward in every direction.'],
    [13, 'Signal strength falls with distance: the farther from an access point, the weaker the reading.'],
    [17, 'Now the walls matter. Roofs lift so the rooms underneath are visible.'],
    [20, 'Each wall a signal crosses removes strength: same distance, weaker reading indoors.'],
    [25, 'Where two access points both reach, coverage overlaps (purple hatching).'],
    [31, 'The result: a floor-level signal-strength heatmap of the whole campus.'],
    [37, 'Complete coverage map. Weak spots are visible at a glance.']
  ],
  [
    [0, 'A storeroom with thick walls. From outside, no camera can see in.'],
    [5, 'The walls turn translucent for us only. The person inside stays hidden from any external camera.'],
    [5.5, 'The transmitter sends Wi-Fi into the room: a direct path plus reflections off every wall.'],
    [9, 'The person walks. Their body adds a new reflected path (cyan) and blocks others (amber).'],
    [15, 'Standing still: the reflected signal settles and barely changes.'],
    [20, 'Reaching and bending toward the shelf changes the reflections in a distinct pattern.'],
    [26, 'Handling an object: smaller, steadier changes in the received signal.'],
    [31, 'Moving to a new position: the signal pattern shifts again.'],
    [37, 'Final view: a person we cannot see is identified by how they change the Wi-Fi.']
  ],
  [
    [0, 'A router inside an enclosed room. The room boundary is not yet known to the system.'],
    [5, 'The router sends signals outward in all directions.'],
    [11, 'Open space lets signals travel. Walls weaken them (grey) and bounce some back (cyan).'],
    [18, 'The returning echoes are observed. Their timing reveals how far each wall is, in every direction.'],
    [24, 'Echo by echo, the system builds an estimate of the room boundary.'],
    [34, 'Left: the physical room. Right: the shape reconstructed from wireless observations.'],
    [38, 'Overlaid, the reconstructed outline matches the physical walls.']
  ]
]

const COLORS = {
  violet: new THREE.Color(0x7a4fe0),
  lavender: new THREE.Color(0x9a7bf0),
  cyan: new THREE.Color(0x19b5d6),
  blue: new THREE.Color(0x2d6cdf),
  amber: new THREE.Color(0xf59e0b),
  grey: new THREE.Color(0x8d93a6),
  green: new THREE.Color(0x22a06b)
}

const CAMPUS_APS: [number, number, number][] = [
  [-10.5, -6, 2.2], [3, -8.5, 2.2], [-5.8, 10.3, 2.2], [0, 2, 3.5], [11, 8, 2.2]
]
const SAMPLE_POINTS: [number, number][] = [
  [-3, -6], [-16, -3], [6, -1], [14, -12], [-2, 8], [16, 3], [-15, 10], [2, 2], [-6, -6]
]
const STORAGE_WAYPOINTS: [number, number, number][] = [
  [9, 2.2, 1.5], [15, 0.2, -0.8], [31, 0.2, -0.8], [37, 2.2, 1.5]
]
const STORAGE_ACTIVITIES: [number, number, string, number, string][] = [
  [0, 9, 'Calibrating', 0, '#8d93a6'],
  [9, 15, 'Walking', 1, '#2d6cdf'],
  [15, 20, 'Stationary', 0.08, '#8d93a6'],
  [20, 26, 'Reaching / bending', 0.7, '#19b5d6'],
  [26, 31, 'Handling object', 0.5, '#7a4fe0'],
  [31, 37, 'Walking', 1, '#2d6cdf'],
  [37, 42.1, 'Stationary', 0.08, '#8d93a6']
]

type BuildingModel = {
  group: THREE.Group
  wallMaterial: THREE.MeshLambertMaterial
  roof: THREE.Mesh
  roofMaterial: THREE.MeshLambertMaterial
}
type LabelDefinition = {
  scene: number
  text: (time: number) => string
  position: (time: number) => THREE.Vector3
  visible: (time: number) => boolean
}
type DemoWorld = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  look: THREE.Vector3
  labels: LabelDefinition[]
  update: (sceneIndex: number, time: number, delta: number, activeNodes: boolean[]) => void
  drawHud: (canvas: HTMLCanvasElement, sceneIndex: number, time: number) => void
  dispose: () => void
}
type CameraKey = { t: number; p: [number, number, number]; l: [number, number, number] }
type ConnectionLink = { from: number; to: number; line: THREE.Line }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const smooth = (value: number) => {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}
const ramp = (value: number, start: number, end: number) => smooth((value - start) / (end - start))
const frac = (value: number) => value - Math.floor(value)
const makeMaterial = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color })

function polygonBuilding(
  scene: THREE.Scene,
  wallSegments: [number, number, number, number][],
  id: string,
  centerX: number,
  centerZ: number,
  footprint: [number, number][],
  thickness: number,
  height: number,
  extraWalls: [[number, number], [number, number]][] = []
): BuildingModel {
  const group = new THREE.Group()
  group.position.set(centerX, 0, centerZ)
  scene.add(group)
  const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xece3d0, transparent: true })
  const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4f5a, transparent: true })
  const addWall = (a: [number, number], b: [number, number]) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length + thickness, height, thickness), wallMaterial)
    mesh.position.set((a[0] + b[0]) / 2, height / 2, (a[1] + b[1]) / 2)
    mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0])
    group.add(mesh)
    wallSegments.push([centerX + a[0], centerZ + a[1], centerX + b[0], centerZ + b[1]])
  }
  footprint.forEach((point, index) => addWall(point, footprint[(index + 1) % footprint.length]))
  extraWalls.forEach(([a, b]) => addWall(a, b))

  const shape = new THREE.Shape(footprint.map(([x, z]) => new THREE.Vector2(x, -z)))
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }),
    roofMaterial
  )
  roof.rotation.x = -Math.PI / 2
  roof.position.y = height
  group.add(roof)
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeMaterial(0xf6f3ea))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.03
  group.add(floor)
  roof.name = `building-${id}-roof`
  return { group, wallMaterial, roof, roofMaterial }
}

function lineSegments(group: THREE.Group, points: THREE.Vector3[], color: number, opacity = 1): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }))
  group.add(line)
  return line
}

function createWorld(connectionIndexes: [number, number][]): DemoWorld {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xdfe8f0)
  scene.fog = new THREE.Fog(0xdfe8f0, 70, 170)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300)
  const look = new THREE.Vector3()
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd0b8, 0.95))
  const daylight = new THREE.DirectionalLight(0xffffff, 0.65)
  daylight.position.set(20, 35, 15)
  scene.add(daylight)

  const platform = new THREE.Mesh(new THREE.BoxGeometry(50, 0.6, 50), makeMaterial(0xcfe6c4))
  platform.position.y = -0.3
  scene.add(platform)
  const grid = new THREE.GridHelper(50, 50, 0xb2c8ae, 0xc2d6bf)
  grid.position.y = 0.01
  scene.add(grid)
  ;[[0, 0.5, 50, 2.4], [-1, 0, 2.4, 50]].forEach(([x, z, width, depth]) => {
    const path = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), makeMaterial(0xe9e4d2))
    path.position.set(x, 0.02, z)
    scene.add(path)
  })

  const wallSegments: [number, number, number, number][] = []
  const footprint = (width: number, depth: number): [number, number][] =>
    [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
  const buildings: Record<string, BuildingModel> = {
    A: polygonBuilding(scene, wallSegments, 'A', -8, -6, footprint(9, 7), 0.35, 2.6, [[ [0, -3.5], [0, 1] ]]),
    R: polygonBuilding(scene, wallSegments, 'R', 4, -8, [[-5, -4], [5, -4], [5, 1], [1, 1], [1, 4], [-5, 4]], 0.5, 2.6),
    S: polygonBuilding(scene, wallSegments, 'S', -9, 8, footprint(8, 6), 0.8, 3.2),
    C: polygonBuilding(scene, wallSegments, 'C', 11, 8, footprint(6, 5), 0.35, 2.6)
  }

  const trees = new THREE.Group()
  scene.add(trees)
  const treePositions: [number, number][] = [
    [-20, -12], [-20, -2], [-17, 3], [-1, 5], [5, -1], [18, -12], [18, -3], [17, 13],
    [2, 14], [-3, 16], [-20, 18], [21, 6], [-1, -17], [14, -17], [-16, -19], [-18, 12]
  ]
  treePositions.forEach(([x, z]) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1, 6), makeMaterial(0x8b6b4a))
    trunk.position.set(x, 0.5, z)
    trees.add(trunk)
    ;[0, 1].forEach(tier => {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(1.4 - tier * 0.4, 1.8, 7),
        makeMaterial(tier ? 0x6fa86a : 0x86b97a)
      )
      crown.position.set(x, 1.8 + tier * 1.1, z)
      trees.add(crown)
    })
  })

  const accessPoints = new THREE.Group()
  scene.add(accessPoints)
  const apMarkers: THREE.Group[] = []
  const rings: THREE.Mesh[][] = []
  CAMPUS_APS.forEach(([x, z, height]) => {
    const marker = new THREE.Group()
    marker.position.set(x, 0, z)
    if (height > 3) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, height, 8), makeMaterial(0x6b7080))
      mast.position.y = height / 2
      marker.add(mast)
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.22, 16), makeMaterial(0x6d3fc0))
    base.position.y = height
    marker.add(base)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), makeMaterial(0xa78bfa))
    dome.position.y = height + 0.15
    marker.add(dome)
    ;[-0.25, 0.25].forEach(offset => {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), makeMaterial(0x6d3fc0))
      antenna.position.set(offset, height + 0.45, 0)
      marker.add(antenna)
    })
    accessPoints.add(marker)
    apMarkers.push(marker)
    rings.push(Array.from({ length: 4 }, () => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 72),
        new THREE.MeshBasicMaterial({ color: 0x9a7bf0, transparent: true, side: THREE.DoubleSide, depthWrite: false })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(x, 0.12, z)
      ring.visible = false
      scene.add(ring)
      return ring
    }))
  })

  const heatUniforms = {
    uAP: { value: CAMPUS_APS.map(([x, z]) => new THREE.Vector2(x, z)) },
    uActive: { value: CAMPUS_APS.map(() => 1) },
    uW: { value: Array.from({ length: 20 }, (_, index) => {
      const wall = wallSegments[index]
      return wall ? new THREE.Vector4(...wall) : new THREE.Vector4()
    }) },
    uR: { value: 0 },
    uAtt: { value: 0 },
    uAmt: { value: 0 },
    uOvl: { value: 0 }
  }
  const heat = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.ShaderMaterial({
      uniforms: heatUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec2 vP;void main(){vec4 w=modelMatrix*vec4(position,1.);vP=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: `precision highp float;uniform vec2 uAP[5];uniform float uActive[5];uniform vec4 uW[20];uniform float uR,uAtt,uAmt,uOvl;varying vec2 vP;
float cr(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
float hit(vec2 p,vec2 q,vec4 w){vec2 r=q-p,s=w.zw-w.xy;float d=cr(r,s);if(abs(d)<1e-5)return 0.;vec2 a=w.xy-p;float t=cr(a,s)/d,u=cr(a,r)/d;return(t>0.&&t<1.&&u>0.&&u<1.)?1.:0.;}
void main(){float b1=-300.,b2=-300.;for(int i=0;i<5;i++){if(uActive[i]<.5)continue;vec2 a=uAP[i];float d=max(distance(vP,a),.8);float n=0.;for(int j=0;j<20;j++)n+=hit(a,vP,uW[j]);float r=-30.-22.*log(d)/2.302585-uAtt*7.*n;if(d>uR)r=-300.;if(r>b1){b2=b1;b1=r;}else if(r>b2)b2=r;}if(b1<-200.)discard;float v=clamp((b1+95.)/50.,0.,1.);vec3 lo=vec3(.80,.72,.96),mi=vec3(.18,.42,.87),hi=vec3(.10,.88,.85);vec3 col=v<.5?mix(lo,mi,v*2.):mix(mi,hi,(v-.5)*2.);float f=abs(fract(v*6.)-.5);col*=1.-.22*smoothstep(.45,.5,f);if(b2>-200.&&b1-b2<6.)col=mix(col,vec3(.43,.25,.75),uOvl*(.35+.35*sin((vP.x+vP.y)*4.)));gl_FragColor=vec4(col,uAmt*(.35+.55*v));}`
    })
  )
  heat.rotation.x = -Math.PI / 2
  heat.position.y = 0.05
  scene.add(heat)

  const pulsePositions = new Float32Array(700 * 3)
  const pulseColors = new Float32Array(700 * 3)
  const pulseGeometry = new THREE.BufferGeometry()
  pulseGeometry.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3))
  pulseGeometry.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3))
  const pulsePoints = new THREE.Points(
    pulseGeometry,
    new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, depthWrite: false })
  )
  pulsePoints.frustumCulled = false
  scene.add(pulsePoints)

  const sampleTags = SAMPLE_POINTS.map(([x, z]) => new THREE.Vector3(x, 0.3, z))
  let activeApState = CAMPUS_APS.map(() => true)
  const campusLabels: LabelDefinition[] = [
    ...CAMPUS_APS.map(([x, z, y], index) => ({
      scene: 0, text: () => `AP ${index + 1}`, position: () => new THREE.Vector3(x, y + 1, z), visible: (time: number) => activeApState[index] && time >= 4 + index * 0.6
    })),
    ...sampleTags.map((point, index) => ({
      scene: 0,
      text: (time: number) => `${Math.round(calculateCampusRssi(point.x, point.z, ramp(time, 17, 23), CAMPUS_APS, wallSegments, activeApState).value)} dBm`,
      position: () => point,
      visible: (time: number) => time >= 13 && index < SAMPLE_POINTS.length
    }))
  ]
  const storageGroup = new THREE.Group()
  storageGroup.position.set(-9, 0, 8)
  scene.add(storageGroup)
  const reconstructionPhysical = new THREE.Group()
  reconstructionPhysical.position.set(4, 0, -8)
  scene.add(reconstructionPhysical)
  const reconstructionEstimate = new THREE.Group()
  reconstructionEstimate.position.set(19, 0, -8)
  scene.add(reconstructionEstimate)

  const storageWalls = [
    [-2.4, -2.3, 2, 2.2, 0.6], [0, -2.3, 2, 2.2, 0.6], [2.4, -2.3, 2, 2.2, 0.6], [-3.3, 0.5, 0.6, 2.2, 2.2]
  ]
  storageWalls.forEach(([x, z, width, height, depth], index) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), makeMaterial(0x9aa3b5))
    shelf.position.set(x, height / 2, z)
    storageGroup.add(shelf)
    ;[0.5, 1.3, 2].forEach((y, itemIndex) => {
      const goods = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.35, 0.28, depth * 0.8),
        makeMaterial([0xc9a46a, 0xe0c9a0, 0x8fb3c9][(index + itemIndex) % 3])
      )
      goods.position.set(x + (itemIndex - 1) * width * 0.3, y, z)
      storageGroup.add(goods)
    })
  })
  ;[[2.6, -2, 0.6], [-2.6, 2, 0.5], [-1, 2.1, 0.7]].forEach(([x, z, size]) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), makeMaterial(0xc9a46a))
    crate.position.set(x, size / 2, z)
    storageGroup.add(crate)
  })
  const transmitter = new THREE.Vector3(3.2, 2.2, 2.3)
  const receiver = new THREE.Vector3(-3.2, 1.3, -0.9)
  const receiverMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), makeMaterial(0x19b5d6))
  receiverMesh.position.copy(receiver)
  storageGroup.add(receiverMesh)
  const receiverAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), makeMaterial(0x19b5d6))
  receiverAntenna.position.set(receiver.x, receiver.y + 0.4, receiver.z)
  storageGroup.add(receiverAntenna)
  const human = new THREE.Group()
  storageGroup.add(human)
  const humanSkin = makeMaterial(0xf1c9a5)
  const humanShirt = makeMaterial(0xf08a4b)
  const humanPants = makeMaterial(0x2f3b52)
  const humanLegs = [-0.12, 0.12].map(x => {
    const leg = new THREE.Group()
    leg.position.set(x, 0.9, 0)
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.2), humanPants)
    lower.position.y = -0.45
    leg.add(lower)
    human.add(leg)
    return leg
  })
  const torso = new THREE.Group()
  torso.position.y = 0.9
  human.add(torso)
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), humanShirt)
  chest.position.y = 0.35
  torso.add(chest)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), humanSkin)
  head.position.y = 0.88
  torso.add(head)
  const humanArms = [-0.33, 0.33].map(x => {
    const arm = new THREE.Group()
    arm.position.set(x, 0.65, 0)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.65, 0.13), humanShirt)
    upperArm.position.y = -0.3
    arm.add(upperArm)
    torso.add(arm)
    return arm
  })
  const objectCrate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.45), makeMaterial(0xd9a441))
  storageGroup.add(objectCrate)

  const pathLine = (group: THREE.Group, color: number) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true }))
    line.frustumCulled = false
    group.add(line)
    return line
  }
  const reflectedImages = [[0, 3.6], [0, -3.6], [2, 2.6], [2, -2.6]].map(([axis, wall]) => {
    const image = receiver.clone()
    image.setComponent(axis, 2 * wall - receiver.getComponent(axis))
    return transmitter.clone().lerp(image, (wall - transmitter.getComponent(axis)) / (image.getComponent(axis) - transmitter.getComponent(axis)))
  })
  const pathDefinitions: { point: THREE.Vector3; start: number; body?: boolean }[] = [
    { point: transmitter.clone().lerp(receiver, 0.5), start: 5.5 },
    ...reflectedImages.map((point, index) => ({ point, start: 6.5 + index * 0.5 })),
    { point: new THREE.Vector3(), start: 9.5, body: true }
  ]
  const paths = pathDefinitions.map(path => ({
    ...path,
    points: [transmitter, path.point, receiver],
    line: pathLine(storageGroup, 0x7a4fe0)
  }))
  const activityRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0x19b5d6, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  )
  activityRing.rotation.x = -Math.PI / 2
  storageGroup.add(activityRing)

  const reconstructionOutline = [[-5, -4], [5, -4], [5, 1], [1, 1], [1, 4], [-5, 4]] as [number, number][]
  const routerOrigin: [number, number] = [-1, -0.5]
  const echoRays = Array.from({ length: 60 }, (_, index) => {
    const angle = index / 60 * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    let distance = 1e9
    reconstructionOutline.forEach((a, wallIndex) => {
      const b = reconstructionOutline[(wallIndex + 1) % reconstructionOutline.length]
      const sx = b[0] - a[0]
      const sz = b[1] - a[1]
      const divisor = dx * sz - dz * sx
      if (Math.abs(divisor) < 1e-9) return
      const ax = a[0] - routerOrigin[0]
      const az = a[1] - routerOrigin[1]
      const rayDistance = (ax * sz - az * sx) / divisor
      const alongWall = (ax * dz - az * dx) / divisor
      if (rayDistance > 0 && alongWall >= 0 && alongWall <= 1 && rayDistance < distance) distance = rayDistance
    })
    return {
      angle, dx, dz, distance,
      estimate: distance + (frac(Math.sin(index * 12.9898) * 43758.5453) - 0.5) * 0.3
    }
  })
  const meanBoundaryError = echoRays.reduce((sum, ray) => sum + Math.abs(ray.estimate - ray.distance), 0) / echoRays.length
  const rayHeight = 1.2
  const raySegments = (group: THREE.Group, color: number, select: (ray: typeof echoRays[number]) => [number, number, number, number, number, number]) => {
    const array = new Float32Array(echoRays.length * 6)
    echoRays.forEach((ray, index) => array.set(select(ray), index * 6))
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3))
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true }))
    group.add(line)
    return line
  }
  const rayPoint = (ray: typeof echoRays[number]) =>
    new THREE.Vector3(routerOrigin[0] + ray.dx * ray.distance, rayHeight, routerOrigin[1] + ray.dz * ray.distance)
  const outgoing = raySegments(reconstructionPhysical, 0x9a7bf0, ray => {
    const hit = rayPoint(ray)
    return [routerOrigin[0], rayHeight, routerOrigin[1], hit.x, hit.y, hit.z]
  })
  const throughWall = raySegments(reconstructionPhysical, 0x8d93a6, ray => {
    const hit = rayPoint(ray)
    return [hit.x, hit.y, hit.z, routerOrigin[0] + ray.dx * (ray.distance + 1.6), rayHeight, routerOrigin[1] + ray.dz * (ray.distance + 1.6)]
  })
  const returning = raySegments(reconstructionPhysical, 0x19b5d6, ray => {
    const hit = rayPoint(ray)
    return [hit.x, 0.8, hit.z, routerOrigin[0], 0.8, routerOrigin[1]]
  })
  const createEchoPoints = (group: THREE.Group, color: number) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(echoRays.length * 3), 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.4 }))
    points.frustumCulled = false
    group.add(points)
    return points
  }
  const echoPoints = createEchoPoints(reconstructionPhysical, 0x19b5d6)
  const estimatePoints = createEchoPoints(reconstructionEstimate, 0x2d6cdf)
  echoRays.forEach((ray, index) => {
    echoPoints.geometry.attributes.position.setXYZ(index, routerOrigin[0] + ray.dx * ray.estimate, rayHeight, routerOrigin[1] + ray.dz * ray.estimate)
    estimatePoints.geometry.attributes.position.setXYZ(index, routerOrigin[0] + ray.dx * ray.estimate, 0.25, routerOrigin[1] + ray.dz * ray.estimate)
  })
  const estimatedOutlinePositions = new Float32Array((echoRays.length + 1) * 3)
  echoRays.concat(echoRays[0]).forEach((ray, index) => {
    estimatedOutlinePositions[index * 3] = routerOrigin[0] + ray.dx * ray.estimate
    estimatedOutlinePositions[index * 3 + 1] = 0.25
    estimatedOutlinePositions[index * 3 + 2] = routerOrigin[1] + ray.dz * ray.estimate
  })
  const estimatedOutlineGeometry = new THREE.BufferGeometry()
  estimatedOutlineGeometry.setAttribute('position', new THREE.BufferAttribute(estimatedOutlinePositions, 3))
  const estimatedOutline = new THREE.Line(estimatedOutlineGeometry, new THREE.LineBasicMaterial({ color: 0x2d6cdf }))
  estimatedOutline.frustumCulled = false
  reconstructionEstimate.add(estimatedOutline)
  const reconstructionFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 10),
    new THREE.MeshBasicMaterial({ color: 0xf6f9fd, transparent: true, side: THREE.DoubleSide })
  )
  reconstructionFloor.rotation.x = -Math.PI / 2
  reconstructionFloor.position.set(0, 0.12, 0)
  reconstructionEstimate.add(reconstructionFloor)
  const reconstructionGrid = new THREE.GridHelper(12, 12, 0xb5c3da, 0xd0daea)
  reconstructionGrid.position.set(0, 0.13, 0)
  reconstructionEstimate.add(reconstructionGrid)
  const routerMarker = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 12), makeMaterial(0x6d3fc0))
  routerMarker.position.set(routerOrigin[0], 0.3, routerOrigin[1])
  reconstructionEstimate.add(routerMarker)

  const campusLinkGroup = new THREE.Group()
  scene.add(campusLinkGroup)
  const connectionLines: ConnectionLink[] = connectionIndexes.map(([from, to]) => {
    const fromAp = CAMPUS_APS[from]
    const toAp = CAMPUS_APS[to]
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(fromAp[0], fromAp[2], fromAp[1]),
        new THREE.Vector3(toAp[0], toAp[2], toAp[1])
      ]),
      new THREE.LineBasicMaterial({ color: 0x5b3fd0 })
    )
    campusLinkGroup.add(line)
    return { from, to, line }
  })

  const labels: LabelDefinition[] = [
    ...campusLabels,
    { scene: 1, text: () => 'Transmitter', position: () => new THREE.Vector3(-5.8, 3.2, 10.3), visible: time => time >= 1 },
    { scene: 1, text: () => 'Receiver', position: () => new THREE.Vector3(-12.2, 2.2, 7.1), visible: time => time >= 1 },
    { scene: 1, text: () => 'Person (hidden from cameras)', position: () => new THREE.Vector3(human.position.x - 9, 2.2, human.position.z + 8), visible: time => time >= 6 },
    { scene: 2, text: () => 'Router', position: () => new THREE.Vector3(3, 2.2, -8.5), visible: () => true },
    { scene: 2, text: () => 'Physical room', position: () => new THREE.Vector3(4, 3.2, -12.5), visible: time => time >= 33 },
    {
      scene: 2,
      text: () => 'Reconstructed from Wi-Fi',
      position: time => new THREE.Vector3(19 * (1 - smooth(ramp(time, 36, 40))) + 4 * smooth(ramp(time, 36, 40)), 2.4, -13),
      visible: time => time >= 24 && time < 36
    }
  ]

  let personYaw = -2.28
  let movementStrength = 0
  let pulseCount = 0
  const tmp = new THREE.Vector3()
  const world = {
    scene, camera, look, labels,
    update(sceneIndex: number, time: number, delta: number, activeNodes: boolean[]) {
      pulseCount = 0
      activeApState = CAMPUS_APS.map((_, index) => activeNodes[index] ?? true)
      activeApState.forEach((active, index) => { heatUniforms.uActive.value[index] = active ? 1 : 0 })
      heat.visible = trees.visible = sceneIndex === 0
      campusLinkGroup.visible = sceneIndex === 0
      connectionLines.forEach(({ from, to, line }) => {
        line.visible = sceneIndex === 0 && activeApState[from] && activeApState[to]
      })
      buildings.A.group.visible = buildings.C.group.visible = sceneIndex === 0
      buildings.S.group.visible = sceneIndex < 2
      buildings.R.group.visible = sceneIndex !== 1
      storageGroup.visible = sceneIndex === 1
      reconstructionPhysical.visible = reconstructionEstimate.visible = sceneIndex === 2
      apMarkers.forEach((marker, index) => {
        marker.visible = activeApState[index] &&
          (sceneIndex === 0 || sceneIndex === 1 && index === 2 || sceneIndex === 2 && index === 1)
      })
      rings.forEach((list, index) => list.forEach(ring => { ring.visible = false }))

      if (sceneIndex === 0) {
        Object.values(buildings).forEach(building => {
          building.roof.visible = true
          building.wallMaterial.opacity = 1
          building.roofMaterial.opacity = 1 - 0.88 * smooth(ramp(time, 16, 19))
        })
        apMarkers.forEach((marker, index) => {
          marker.scale.setScalar(0.01 + smooth(ramp(time, 4 + index * 0.6, 5 + index * 0.6)))
        })
        heatUniforms.uAmt.value = smooth(ramp(time, 9, 12)) * (0.55 + 0.4 * smooth(ramp(time, 30, 34)))
        heatUniforms.uR.value = Math.max(0, (time - 9) * 4.5)
        heatUniforms.uAtt.value = smooth(ramp(time, 17, 23))
        heatUniforms.uOvl.value = smooth(ramp(time, 25, 29))
        const roofOpacity = time < 17 ? 0.75 : time < 31 ? 0.3 : 0.3 * (1 - ramp(time, 31, 35))
        CAMPUS_APS.forEach((_, index) => updateRings(rings[index], time, activeApState[index] && time >= 9 && time < 36, 24, 3.2, 0.14, roofOpacity * smooth(ramp(time, 9, 10))))
        updateCoverageRays(time)
      }

      if (sceneIndex === 1) {
        buildings.S.roof.visible = false
        buildings.S.wallMaterial.opacity = 1 - 0.8 * smooth(ramp(time, 5, 7.5))
        updateRings(rings[2], time, activeApState[2] && time >= 5.5 && time < 9, 6, 1.4, 2.2, 0.7 * smooth(ramp(time, 5.5, 6.5)))
        const activity = activityAt(time)
        const walking = activity[2] === 'Walking'
        const [px, pz] = storagePosition(time)
        human.position.set(px, walking ? Math.abs(Math.sin(time * 7)) * 0.03 : 0, pz)
        const desiredYaw = time < 15 ? -2.28 : time < 31 ? Math.PI : 0.86
        let yawDelta = ((desiredYaw - personYaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
        personYaw += yawDelta * Math.min(1, delta * 6)
        human.rotation.y = personYaw
        const reach = smooth(ramp(time, 20, 21.5)) * (1 - smooth(ramp(time, 24.5, 26)))
        const handle = smooth(ramp(time, 26, 27))
        const swing = walking ? Math.sin(time * 7) : 0
        humanLegs[0].rotation.x = swing * 0.6
        humanLegs[1].rotation.x = -swing * 0.6
        torso.rotation.x = 0.5 * reach + 0.12 * handle + Math.sin(time * 2) * 0.015
        humanArms[0].rotation.x = -swing * 0.5 * (1 - reach) * (1 - handle) - 1.15 * handle
        humanArms[1].rotation.x = swing * 0.5 * (1 - reach) * (1 - handle) - 2.5 * reach - 1.15 * handle * (1 - reach)
        const hand = new THREE.Vector3(px + Math.sin(personYaw) * 0.55, 1.05, pz + Math.cos(personYaw) * 0.55)
        objectCrate.position.set(0.2, 1.4, -2.3).lerp(hand, handle)
        const desiredMotion = time < 9 ? 0 : activity[3]
        movementStrength += (desiredMotion - movementStrength) * Math.min(1, delta * 3)
        paths[5].point.set(px, 1.1, pz)
        paths.forEach((path, index) => {
          const opacity = smooth(ramp(time, path.start, path.start + 1.2))
          const blocked = !path.body && (distanceToSegment(px, pz, path.points[0], path.points[1]) < 0.5 ||
            distanceToSegment(px, pz, path.points[1], path.points[2]) < 0.5)
          const positions = path.line.geometry.attributes.position as THREE.BufferAttribute
          path.points.forEach((point, pointIndex) => positions.setXYZ(pointIndex, point.x, point.y, point.z))
          positions.needsUpdate = true
          const color = path.body ? COLORS.cyan : blocked ? COLORS.amber : index ? COLORS.lavender : COLORS.violet
          const material = path.line.material as THREE.LineBasicMaterial
          material.color.copy(color)
          material.opacity = opacity * (path.body ? 0.3 + 0.7 * movementStrength : blocked ? 0.55 : 0.55)
          path.line.visible = opacity > 0.01
          if (opacity > 0.05) {
            const pulseCount = path.body ? 1 + Math.round(2 * movementStrength) : 2
            for (let pulse = 0; pulse < pulseCount; pulse += 1) {
              const phase = (time * 0.5 + index * 0.17 + pulse / pulseCount) % 1
              addPulse(path.points, phase, color, blocked ? 0.5 : 1)
            }
          }
        })
        const activityRadius = (time * (1 + 2 * movementStrength) % 1) * 1.8
        activityRing.position.set(px, 0.08, pz)
        activityRing.scale.set(activityRadius, activityRadius, 1)
        const ringMaterial = activityRing.material as THREE.MeshBasicMaterial
        ringMaterial.opacity = time < 9.5 ? 0 : (1 - activityRadius / 1.8) * (0.15 + 0.7 * movementStrength)
        activityRing.visible = ringMaterial.opacity > 0.01
      }

      if (sceneIndex === 2) {
        buildings.R.roof.visible = false
        buildings.R.wallMaterial.opacity = 0.15 + 0.5 * smooth(ramp(time, 5, 9))
        updateRings(rings[1], time, activeApState[1] && time >= 5 && time < 20, 6, 1.8, rayHeight, 0.7 * smooth(ramp(time, 5, 6.5)) * (1 - ramp(time, 16, 20)))
        const outgoingOpacity = 0.35 * smooth(ramp(time, 5.5, 8))
        ;(outgoing.material as THREE.LineBasicMaterial).opacity = outgoingOpacity
        outgoing.visible = outgoingOpacity > 0.01
        throughWall.visible = returning.visible = time >= 11
        ;(throughWall.material as THREE.LineBasicMaterial).opacity = 0.4 * smooth(ramp(time, 11, 13))
        ;(returning.material as THREE.LineBasicMaterial).opacity = 0.45 * smooth(ramp(time, 11, 13))
        const echoPositions = echoPoints.geometry.attributes.position as THREE.BufferAttribute
        const estimatePositions = estimatePoints.geometry.attributes.position as THREE.BufferAttribute
        echoRays.forEach((ray, index) => {
          const phase = (time - 6) * 0.3 + index * 0.013
          if (time < 6) return
          const hit = rayPoint(ray)
          if (time < 11) addPulse([new THREE.Vector3(routerOrigin[0], rayHeight, routerOrigin[1]), hit], phase % 1, COLORS.lavender)
          else if (phase % 1 < 0.5) addPulse([new THREE.Vector3(routerOrigin[0], rayHeight, routerOrigin[1]), hit], (phase % 1) * 2, COLORS.lavender)
          else {
            addPulse([hit, new THREE.Vector3(routerOrigin[0], rayHeight, routerOrigin[1])], (phase % 1 - 0.5) * 2, COLORS.cyan)
            addPulse([hit, new THREE.Vector3(routerOrigin[0] + ray.dx * (ray.distance + 1.6), rayHeight, routerOrigin[1] + ray.dz * (ray.distance + 1.6))], (phase % 1 - 0.5) * 2, COLORS.grey, 0.6)
          }
          if (time >= 18 && index < Math.floor(ramp(time, 18, 26) * echoRays.length)) {
            echoPositions.setXYZ(index, routerOrigin[0] + ray.dx * ray.estimate, rayHeight, routerOrigin[1] + ray.dz * ray.estimate)
          }
          if (time >= 24 && index < Math.floor(ramp(time, 24, 34) * echoRays.length)) {
            estimatePositions.setXYZ(index, routerOrigin[0] + ray.dx * ray.estimate, 0.25, routerOrigin[1] + ray.dz * ray.estimate)
          }
        })
        echoPositions.needsUpdate = estimatePositions.needsUpdate = true
        const measuredCount = Math.floor(ramp(time, 18, 26) * echoRays.length)
        echoPoints.geometry.setDrawRange(0, measuredCount)
        echoPoints.visible = time >= 18
        const estimateCount = Math.floor(ramp(time, 24, 34) * echoRays.length)
        estimatePoints.geometry.setDrawRange(0, estimateCount)
        estimatedOutline.geometry.setDrawRange(0, estimateCount >= echoRays.length ? echoRays.length + 1 : estimateCount)
        const visible = smooth(ramp(time, 22, 24))
        ;(reconstructionFloor.material as THREE.MeshBasicMaterial).opacity = visible * 0.9
        reconstructionGrid.visible = reconstructionFloor.visible = estimatePoints.visible =
          estimatedOutline.visible = routerMarker.visible = time >= 22
        const transition = smooth(ramp(time, 36, 40))
        reconstructionEstimate.position.set(19 - 15 * transition, 0.15 * transition, -8)
        ;(reconstructionFloor.material as THREE.MeshBasicMaterial).opacity = visible * 0.9 * (1 - transition)
        reconstructionGrid.visible = transition < 0.01
        routerMarker.visible = transition < 0.01
        ;(estimatedOutline.material as THREE.LineBasicMaterial).color.copy(transition > 0.95 ? COLORS.green : COLORS.blue)
        ;(estimatePoints.material as THREE.PointsMaterial).color.copy(transition > 0.95 ? COLORS.green : COLORS.blue)
      }
      pulseGeometry.setDrawRange(0, pulseCount)
      ;(pulseGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(pulseGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
      pulsePoints.visible = pulseCount > 0
    },
    drawHud(canvas: HTMLCanvasElement, sceneIndex: number, time: number) {
      drawHudCanvas(canvas, sceneIndex, time, echoRays, meanBoundaryError)
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
          geometries.add(object.geometry)
          ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material))
        }
      })
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => {
        Object.values(material).forEach(value => {
          if (value instanceof THREE.Texture) value.dispose()
        })
        material.dispose()
      })
    }
  }

  function addPulse(points: THREE.Vector3[], progress: number, color: THREE.Color, intensity = 1) {
    if (pulseCount >= 700) return
    const lengths: number[] = []
    let totalLength = 0
    for (let index = 0; index < points.length - 1; index += 1) {
      const length = points[index].distanceTo(points[index + 1])
      lengths.push(length)
      totalLength += length
    }
    let remaining = clamp(progress, 0, 1) * totalLength
    let segment = 0
    while (segment < lengths.length - 1 && remaining > lengths[segment]) {
      remaining -= lengths[segment]
      segment += 1
    }
    tmp.copy(points[segment]).lerp(points[segment + 1], lengths[segment] ? remaining / lengths[segment] : 0)
    const offset = pulseCount * 3
    pulsePositions.set([tmp.x, tmp.y, tmp.z], offset)
    pulseColors.set([color.r * intensity, color.g * intensity, color.b * intensity], offset)
    pulseCount += 1
  }

  function updateCoverageRays(time: number) {
    const visible = smooth(ramp(time, 17.5, 19.5)) * (1 - smooth(ramp(time, 30, 33)))
    rayLines.material.opacity = visible * 0.8
    rayLines.visible = visible > 0.01
    if (visible > 0.02) {
      coverageRays.forEach((points, index) => addPulse(points, (time * 0.3 + index * 0.11) % 1, COLORS.violet, 0.8))
    }
  }

  const coverageRays = SAMPLE_POINTS.map(([x, z]) => {
    const apIndex = calculateCampusRssi(x, z, 0, CAMPUS_APS, wallSegments, activeApState).apIndex
    const ap = CAMPUS_APS[apIndex]
    const path: THREE.Vector3[] = [new THREE.Vector3(ap[0], ap[2], ap[1])]
    wallFractions([ap[0], ap[1]], [x, z], wallSegments).forEach(fraction => {
      path.push(new THREE.Vector3(ap[0] + (x - ap[0]) * fraction, 1.2, ap[1] + (z - ap[1]) * fraction))
    })
    path.push(new THREE.Vector3(x, 0.4, z))
    return path
  })
  const rayGeometry = new THREE.BufferGeometry()
  const rayPositions: number[] = []
  const rayColors: number[] = []
  coverageRays.forEach(points => {
    for (let index = 0; index < points.length - 1; index += 1) {
      rayPositions.push(...points[index].toArray(), ...points[index + 1].toArray())
      const shade = Math.max(0.25, 1 - 0.28 * index)
      for (let vertex = 0; vertex < 2; vertex += 1) {
        rayColors.push(0.48 * shade + 0.5 * (1 - shade), 0.31 * shade + 0.5 * (1 - shade), 0.88 * shade + 0.5 * (1 - shade))
      }
    }
  })
  rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rayPositions, 3))
  rayGeometry.setAttribute('color', new THREE.Float32BufferAttribute(rayColors, 3))
  const rayLines = new THREE.LineSegments(rayGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }))
  scene.add(rayLines)
  function updateRings(group: THREE.Mesh[], time: number, on: boolean, maximum: number, speed: number, y: number, opacity: number) {
    group.forEach((ring, index) => {
      if (!on) {
        ring.visible = false
        return
      }
      const radius = (time * speed + index * maximum / 4) % maximum
      ring.scale.set(radius, radius, 1)
      ring.position.y = y
      ;(ring.material as THREE.MeshBasicMaterial).opacity = (1 - radius / maximum) * opacity
      ring.visible = radius > 0.3 && opacity > 0.01
    })
  }

  return world
}

function calculateCampusRssi(
  x: number,
  z: number,
  attenuation: number,
  accessPoints: [number, number, number][],
  wallSegments: [number, number, number, number][],
  activeAps: boolean[] = accessPoints.map(() => true)
): { value: number; apIndex: number } {
  let best = -300
  let apIndex = -1
  accessPoints.forEach(([apX, apZ], index) => {
    if (!activeAps[index]) return
    const distance = Math.max(Math.hypot(x - apX, z - apZ), 0.8)
    const signal = -30 - 22 * Math.log10(distance) - attenuation * 7 * wallFractions([apX, apZ], [x, z], wallSegments).length
    if (signal > best) {
      best = signal
      apIndex = index
    }
  })
  return apIndex < 0 ? { value: -100, apIndex } : { value: best, apIndex }
}

function wallFractions(from: [number, number], to: [number, number], walls: [number, number, number, number][]) {
  const values: number[] = []
  walls.forEach(([x1, z1, x2, z2]) => {
    const rx = to[0] - from[0]
    const rz = to[1] - from[1]
    const sx = x2 - x1
    const sz = z2 - z1
    const denominator = rx * sz - rz * sx
    if (Math.abs(denominator) < 1e-6) return
    const ax = x1 - from[0]
    const az = z1 - from[1]
    const t = (ax * sz - az * sx) / denominator
    const u = (ax * rz - az * rx) / denominator
    if (t > 0 && t < 1 && u > 0 && u < 1) values.push(t)
  })
  return values.sort((a, b) => a - b)
}

function distanceToSegment(x: number, z: number, a: THREE.Vector3, b: THREE.Vector3) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = dx * dx + dz * dz
  const projection = clamp(((x - a.x) * dx + (z - a.z) * dz) / length, 0, 1)
  return Math.hypot(x - a.x - projection * dx, z - a.z - projection * dz)
}

function activityAt(time: number): [number, number, string, number, string] {
  return STORAGE_ACTIVITIES.find(activity => time >= activity[0] && time < activity[1]) ?? STORAGE_ACTIVITIES[STORAGE_ACTIVITIES.length - 1]
}

function storagePosition(time: number): [number, number] {
  if (time <= 9) return [2.2, 1.5]
  for (let index = 0; index < 3; index += 1) {
    if (time <= STORAGE_WAYPOINTS[index + 1][0]) {
      const from = STORAGE_WAYPOINTS[index]
      const to = STORAGE_WAYPOINTS[index + 1]
      const progress = smooth(ramp(time, from[0], to[0]))
      return [from[1] + (to[1] - from[1]) * progress, from[2] + (to[2] - from[2]) * progress]
    }
  }
  return [2.2, 1.5]
}

function drawHudCanvas(canvas: HTMLCanvasElement, sceneIndex: number, time: number, echoes: { angle: number; dx: number; dz: number; estimate: number }[], error: number) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(2, 0, 0, 2, 0, 0)
  context.clearRect(0, 0, 300, 220)
  const text = (value: string, x: number, y: number, size = 13, color = '#1f2a44', weight = 400, align: CanvasTextAlign = 'left') => {
    context.font = `${weight} ${size}px system-ui,sans-serif`
    context.fillStyle = color
    context.textAlign = align
    context.fillText(value, x, y)
  }
  if (sceneIndex === 0) {
    text('Signal strength (illustrative model)', 8, 18, 14, '#1f2a44', 600)
    for (let x = 0; x < 284; x += 1) {
      const fraction = x / 283
      const low = [204, 184, 245]
      const middle = [46, 107, 222]
      const high = [26, 224, 217]
      const start = fraction < 0.5 ? low : middle
      const end = fraction < 0.5 ? middle : high
      const progress = fraction < 0.5 ? fraction * 2 : (fraction - 0.5) * 2
      context.fillStyle = `rgb(${start.map((channel, index) => Math.round(channel + (end[index] - channel) * progress)).join(',')})`
      context.fillRect(8 + x, 28, 1, 16)
    }
    text('-95 dBm weak', 8, 60, 12, '#5a6785')
    text('-45 dBm strong', 292, 60, 12, '#5a6785', 400, 'right')
    const message = time < 9 ? 'Waiting for transmitters' : time < 17
      ? 'Free-space spreading: strength falls with distance' : time < 25
        ? 'Walls attenuate: about 7 dB lost per wall' : time < 31
          ? 'Overlap: two access points reach here' : 'Final campus coverage map'
    text(message, 8, 90, 13, '#1f2a44', 600)
    text('Purple hatching marks overlapping coverage.', 8, 110, 12, '#5a6785')
    text('Tags on the map show the modelled reading at that spot.', 8, 128, 12, '#5a6785')
    text(time >= 17 ? 'Every wall crossed lowers the tag value.' : '', 8, 146, 12, '#5a6785')
    return
  }
  if (sceneIndex === 1) {
    text('Received Wi-Fi signal (illustrative)', 8, 16, 14, '#1f2a44', 600)
    context.strokeStyle = '#c3cbdc'
    context.strokeRect(8, 24, 284, 70)
    context.beginPath()
    context.strokeStyle = '#2d6cdf'
    context.lineWidth = 1.6
    for (let x = 0; x <= 284; x += 2) {
      const sampleTime = time - 6 + x / 284 * 6
      const movement = sampleTime < 9 ? 0 : activityAt(sampleTime)[3]
      const amplitude = 0.5 + (sampleTime < 5.5 ? 0 : movement * (0.32 * Math.sin(sampleTime * 13) + 0.18 * Math.sin(sampleTime * 29 + 1)) + 0.03 * Math.sin(sampleTime * 5))
      const y = 24 + 70 * (1 - clamp(amplitude, 0.05, 0.95))
      if (x) context.lineTo(8 + x, y)
      else context.moveTo(8 + x, y)
    }
    context.stroke()
    context.lineWidth = 1
    const activity = time < 9.8 ? STORAGE_ACTIVITIES[0] : activityAt(time - 0.6)
    text('External camera: no line of sight', 8, 114, 12, '#5a6785')
    text(time < 9.8 ? 'Learning baseline of the empty room' : 'Presence detected', 8, 134, 13, '#1f2a44', 600)
    text(activity[2], 8, 162, 22, activity[4], 800)
    let left = 8
    STORAGE_ACTIVITIES.forEach(segment => {
      const width = (segment[1] - segment[0]) / DURATION * 284
      const progress = clamp((time - segment[0]) / (segment[1] - segment[0]), 0, 1)
      context.fillStyle = '#e2e8f2'
      context.fillRect(left, 180, width - 1.5, 12)
      context.fillStyle = segment[4]
      context.fillRect(left, 180, (width - 1.5) * progress, 12)
      left += width
    })
    context.fillStyle = '#1f2a44'
    context.fillRect(8 + time / DURATION * 284 - 1, 176, 2, 20)
    text('Activity timeline', 8, 210, 12, '#5a6785')
    return
  }
  text('Echo delay by direction (illustrative)', 8, 16, 14, '#1f2a44', 600)
  const centerX = 150
  const centerY = 108
  const scale = 11
  context.strokeStyle = '#c3cbdc'
  ;[2, 4, 6].forEach(radius => {
    context.beginPath()
    context.arc(centerX, centerY, radius * scale, 0, Math.PI * 2)
    context.stroke()
  })
  const sweep = ramp(time, 18, 26) * Math.PI * 2
  echoes.forEach(ray => {
    if (time < 18 || ray.angle > sweep) return
    context.beginPath()
    context.moveTo(centerX, centerY)
    context.lineTo(centerX + Math.cos(ray.angle) * ray.estimate * scale, centerY + Math.sin(ray.angle) * ray.estimate * scale)
    context.strokeStyle = 'rgba(25,181,214,.35)'
    context.stroke()
    context.beginPath()
    context.arc(centerX + Math.cos(ray.angle) * ray.estimate * scale, centerY + Math.sin(ray.angle) * ray.estimate * scale, 2.2, 0, Math.PI * 2)
    context.fillStyle = '#19b5d6'
    context.fill()
  })
  if (time < 18) text('Waiting for echoes', centerX, centerY, 12, '#5a6785', 400, 'center')
  ;[['#9a7bf0', 'Open space'], ['#8d93a6', 'Through wall, weakened'], ['#19b5d6', 'Reflection returns']].forEach(([color, label], index) => {
    context.fillStyle = color
    context.fillRect(8, 176 + index * 14, 12, 6)
    text(label, 26, 183 + index * 14, 12, '#5a6785')
  })
  if (time >= 38) text(`Mean boundary gap ${error.toFixed(2)} m`, 292, 200, 13, '#22a06b', 600, 'right')
}

export function WifiSensingExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hudRef = useRef<HTMLCanvasElement>(null)
  const { nodes } = useCampus()
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const [sceneIndex, setSceneIndex] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [caption, setCaption] = useState(CAPTIONS[0][0][1])
  const [labels, setLabels] = useState<{ key: number; text: string; left: number; top: number }[]>([])
  const controlsRef = useRef<{
    switchScene: (index: number) => void
    togglePlayback: () => void
    replay: () => void
    seek: (time: number) => void
  } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const hud = hudRef.current
    if (!canvas || !hud) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const meshNodes = nodesRef.current
    const indexById = new Map(meshNodes.map((node, index) => [node.id, index]))
    const connectionIndexes = meshNodes.flatMap((node, index) => node.connections.flatMap(id => {
      const target = indexById.get(id)
      return target !== undefined && target > index ? [[index, target] as [number, number]] : []
    }))
    const world = createWorld(connectionIndexes)
    const state = {
      sceneIndex: 0,
      time: 0,
      playing: true,
      lastFrame: performance.now(),
      transition: 1,
      from: null as { position: THREE.Vector3; look: THREE.Vector3 } | null,
      manual: null as { radius: number; theta: number; phi: number; look: THREE.Vector3 } | null,
      drag: null as { x: number; y: number } | null,
      lastUiUpdate: 0,
      lastLabelUpdate: 0,
      lastHudUpdate: 0
    }
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      renderer.setSize(bounds.width, bounds.height, false)
      world.camera.aspect = bounds.width / bounds.height
      world.camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const sceneKeys = [
      [
        { t: 0, p: [40, 36, 44], l: [0, 0, 0] }, { t: 9, p: [28, 30, 32], l: [0, 0, 0] },
        { t: 17, p: [10, 40, 26], l: [-2, 0, 0] }, { t: 25, p: [0, 46, 12], l: [0, 0, 0] },
        { t: 34, p: [0, 54, 4], l: [0, 0, 0] }, { t: 42, p: [24, 38, 36], l: [0, 0, 0] }
      ],
      [
        { t: 0, p: [-24, 9, 27], l: [-9, 1.5, 8] }, { t: 5, p: [-21, 8, 24], l: [-9, 1.5, 8] },
        { t: 14, p: [-14, 10, 19], l: [-9, 1, 8] }, { t: 30, p: [-6, 12, 20], l: [-9, 1, 8] },
        { t: 42, p: [-9, 14, 20], l: [-9, 1, 8] }
      ],
      [
        { t: 0, p: [14, 11, 5], l: [4, 1, -8] }, { t: 12, p: [10, 15, 4], l: [4, 0, -8] },
        { t: 24, p: [14, 22, 4], l: [10, 0, -8] }, { t: 34, p: [11.5, 28, 8], l: [11.5, 0, -8] },
        { t: 42, p: [7, 26, 2], l: [4, 0, -8] }
      ]
    ] as CameraKey[][]

    const evaluateCamera = () => {
      const keys = sceneKeys[state.sceneIndex]
      let index = 0
      while (index < keys.length - 2 && state.time > keys[index + 1].t) index += 1
      const start = keys[index]
      const end = keys[index + 1]
      const amount = smooth((state.time - start.t) / (end.t - start.t))
      const position = new THREE.Vector3(...start.p).lerp(new THREE.Vector3(...end.p), amount)
      const target = new THREE.Vector3(...start.l).lerp(new THREE.Vector3(...end.l), amount)
      if (state.from && state.transition < 1) {
        const blend = smooth(state.transition)
        position.lerpVectors(state.from.position, position, blend)
        target.lerpVectors(state.from.look, target, blend)
      }
      const viewportScale = Math.max(1, 1.3 / world.camera.aspect)
      position.sub(target).multiplyScalar(viewportScale).add(target)
      world.camera.position.copy(position)
      world.look.copy(target)
      world.camera.lookAt(world.look)
    }
    const updateUi = (now: number) => {
      if (now - state.lastUiUpdate > 100) {
        const selectedCaption = CAPTIONS[state.sceneIndex].filter(([at]) => at <= state.time).pop() ?? CAPTIONS[state.sceneIndex][0]
        setCaption(selectedCaption[1])
        setTime(state.time)
        state.lastUiUpdate = now
      }
      if (now - state.lastHudUpdate > 125 && hudRef.current) {
        world.drawHud(hudRef.current, state.sceneIndex, state.time)
        state.lastHudUpdate = now
      }
      if (now - state.lastLabelUpdate > 50) {
        const bounds = canvas.getBoundingClientRect()
        const projected = world.labels.flatMap((label, key) => {
          if (label.scene !== state.sceneIndex || !label.visible(state.time)) return []
          const point = label.position(state.time).clone().project(world.camera)
          if (point.z > 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1) return []
          return [{
            key,
            text: label.text(state.time),
            left: (point.x * 0.5 + 0.5) * bounds.width,
            top: (-point.y * 0.5 + 0.5) * bounds.height
          }]
        })
        setLabels(projected)
        state.lastLabelUpdate = now
      }
    }
    const renderFrame = (now: number) => {
      const delta = Math.min((now - state.lastFrame) / 1000, 0.1)
      state.lastFrame = now
      if (state.playing) {
        state.time = Math.min(DURATION, state.time + delta)
        if (state.time >= DURATION) {
          state.time = DURATION
          state.playing = false
          setPlaying(false)
        }
      }
      state.transition = Math.min(1, state.transition + delta / 1.6)
      if (state.manual) {
        const orbit = state.manual
        world.camera.position.set(
          orbit.look.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
          orbit.look.y + orbit.radius * Math.cos(orbit.phi),
          orbit.look.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
        )
        world.look.copy(orbit.look)
      } else {
        evaluateCamera()
      }
      world.camera.lookAt(world.look)
      world.update(state.sceneIndex, state.time, delta, nodesRef.current.map(node => node.active))
      updateUi(now)
      renderer.render(world.scene, world.camera)
      frameId = requestAnimationFrame(renderFrame)
    }
    let frameId = requestAnimationFrame(renderFrame)

    const switchScene = (nextScene: number) => {
      if (nextScene < 0 || nextScene >= TITLES.length) return
      state.from = { position: world.camera.position.clone(), look: world.look.clone() }
      state.sceneIndex = nextScene
      state.time = 0
      state.playing = true
      state.transition = 0
      state.manual = null
      setSceneIndex(nextScene)
      setTime(0)
      setPlaying(true)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const interactive = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName)
      if (event.code === 'Space' && !interactive) {
        event.preventDefault()
        togglePlayback()
      }
      if (!interactive && event.key === 'ArrowRight') switchScene(state.sceneIndex + 1)
      if (!interactive && event.key === 'ArrowLeft') switchScene(state.sceneIndex - 1)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (state.playing) {
        state.playing = false
        setPlaying(false)
      }
      if (!state.manual) {
        const offset = world.camera.position.clone().sub(world.look)
        const radius = offset.length()
        state.manual = {
          radius,
          theta: Math.atan2(offset.x, offset.z),
          phi: Math.acos(offset.y / radius),
          look: world.look.clone()
        }
      }
      state.drag = { x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
      canvas.style.cursor = 'grabbing'
    }
    const onPointerMove = (event: PointerEvent) => {
      const manual = state.manual
      if (!state.drag || !manual) return
      manual.theta -= (event.clientX - state.drag.x) * 0.006
      manual.phi = clamp(manual.phi - (event.clientY - state.drag.y) * 0.006, 0.12, 1.5)
      state.drag = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = () => {
      state.drag = null
      canvas.style.cursor = 'grab'
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (state.playing) {
        state.playing = false
        setPlaying(false)
      }
      if (!state.manual) {
        const offset = world.camera.position.clone().sub(world.look)
        const radius = offset.length()
        state.manual = {
          radius,
          theta: Math.atan2(offset.x, offset.z),
          phi: Math.acos(offset.y / radius),
          look: world.look.clone()
        }
      }
      state.manual.radius = clamp(state.manual.radius * (1 + event.deltaY * 0.001), 8, 110)
    }
    const onResize = () => resize()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    const cleanup = () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      world.dispose()
      renderer.dispose()
    }

    function togglePlayback() {
      if (state.time >= DURATION) state.time = 0
      state.manual = null
      state.playing = !state.playing
      setPlaying(state.playing)
    }
    controlsRef.current = {
      switchScene,
      togglePlayback,
      replay: () => {
        state.time = 0
        state.playing = true
        state.manual = null
        setTime(0)
        setPlaying(true)
      },
      seek: (value: number) => {
        state.manual = null
        state.time = clamp(value, 0, DURATION)
        state.playing = false
        setTime(state.time)
        setPlaying(false)
      }
    }
    return cleanup
  }, [])

  const changeScene = (next: number) => controlsRef.current?.switchScene(next)
  const playPause = () => controlsRef.current?.togglePlayback()
  const replay = () => controlsRef.current?.replay()
  const seek = (value: number) => controlsRef.current?.seek(value)

  return (
    <div className="wifi-demo">
      <canvas ref={canvasRef} className="wifi-demo-canvas" aria-label="Three animated Wi-Fi sensing demonstrations" />
      {labels.map(label => (
        <div className="wifi-demo-tag" key={`${label.key}-${label.text}`} style={{ left: label.left, top: label.top }}>{label.text}</div>
      ))}
      <header className="wifi-demo-topbar">
        <div className="wifi-demo-brand">Campus <i>Sentinel</i></div>
        <nav className="wifi-demo-tabs" aria-label="Wi-Fi sensing demonstrations">
          {TAB_LABELS.map((label, index) => (
            <button key={label} className={index === sceneIndex ? 'on' : ''} onClick={() => changeScene(index)}>{label}</button>
          ))}
        </nav>
        <div className="wifi-demo-pill">Illustrative simulation, not measured data. Drag to explore while paused.</div>
      </header>
      <aside className="wifi-demo-hud">
        <canvas ref={hudRef} width={600} height={440} aria-label={`${TITLES[sceneIndex]} model HUD`} />
      </aside>
      <div className="wifi-demo-dock">
        <div className="wifi-demo-title">{TITLES[sceneIndex]}</div>
        <div className="wifi-demo-caption" aria-live="polite">{caption}</div>
        <div className="wifi-demo-controls">
          <button disabled={sceneIndex === 0} onClick={() => changeScene(sceneIndex - 1)}>Previous</button>
          <button onClick={playPause}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={replay}>Replay</button>
          <button disabled={sceneIndex === 2} onClick={() => changeScene(sceneIndex + 1)}>Next</button>
          <input
            aria-label="Timeline"
            type="range"
            min="0"
            max={DURATION}
            step="0.05"
            value={time}
            onChange={event => seek(Number(event.target.value))}
          />
          <span className="wifi-demo-time">{time.toFixed(1)} / {DURATION} s</span>
        </div>
      </div>
    </div>
  )
}

export default WifiSensingExperience
