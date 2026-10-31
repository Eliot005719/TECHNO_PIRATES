import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useCampus } from '../../context/CampusContext'
import { coverageAt } from '../../simulation/propagation/propagationEngine'
import type { HumanObstacle, Transmitter, Wall } from '../../simulation/propagation/propagationTypes'

type LayerKey = 'waves' | 'field' | 'network' | 'activity' | 'trail' | 'graph'
type WalkPoint = [number, number, number?]
type Segment = { start: number; end: number; from: WalkPoint; to: WalkPoint; distance: number; pause: boolean; yaw: number }
type Estimate = { x: number; z: number; score: number }

const ACCESS_POINTS: { id: string; x: number; z: number; y: number }[] = [
  { id: 'AP1', x: 2.5, z: 2, y: 3 },
  { id: 'AP2', x: 10.2, z: 6.8, y: 3 },
  { id: 'AP3', x: 6.6, z: 1.2, y: 3 },
  { id: 'AP4', x: 6, z: 11.5, y: 3 }
]
const SENSOR = { x: 6, z: 4.4 }
const WALL_SEGMENTS = [
  [0, 0, 12, 0, 9], [0, 0, 0, 8, 9], [12, 0, 12, 8, 9],
  [0, 8, 5, 8, 9], [7, 8, 12, 8, 9], [5, 8, 5, 14, 9],
  [7, 8, 7, 14, 9], [9, 0, 9, 3, 5]
] as const
const ROOM_WALLS: Wall[] = WALL_SEGMENTS.map(([x1, z1, x2, z2, loss], index) => ({
  id: `demo-wall-${index}`,
  a: { x: x1, z: z1 },
  b: { x: x2, z: z2 },
  material: loss > 6 ? 'exterior' : 'glass'
}))
const WALK_PATH: WalkPoint[] = [
  [6, 15.5], [6, 9], [6, 6.6], [2.9, 6.3], [2.9, 1.8, 2],
  [2.9, 6.3], [6, 6.6, 0.5], [9.7, 6.3], [9.7, 2, 2],
  [9.7, 6.3], [6, 6.6], [6, 9], [6, 15.5]
]
const CAPTIONS: [number, string][] = [
  [6, 'An empty storage room in Building 410: shelves, a doorway and a hallway.'],
  [14, 'Four virtual access points start transmitting. The coloured field is a simulated coverage map with wall loss.'],
  [30, 'A person enters and walks the aisles. The link RSSI changes as they cross the paths between APs and sensor R.'],
  [44, 'Synthetic CSI-like amplitude and phase features feed a separate grid-search estimator. Cyan shows the estimate; amber marks the scripted person. This is illustrative, not validated localization.'],
  [54, 'Top view: compare the scripted person position with the independent synthetic-feature estimate, movement trail and modelled RSSI links.'],
  [99, 'Campus overview: the same idea as a virtual wireless mesh across buildings.']
]
const CAMERA_KEYS: {
  t: number
  p: [number, number, number]
  q: [number, number, number]
  hp?: boolean
  hq?: boolean
}[] = [
  { t: 0, p: [26, 16, 26], q: [6, 1, 4] },
  { t: 6, p: [16, 8, 18], q: [6, 1, 4] },
  { t: 14, p: [15, 7, 12], q: [6, 1, 6] },
  { t: 18, p: [5, 4.5, 6], hp: true, q: [0, 1.2, 0], hq: true },
  { t: 30, p: [6, 4, 7], hp: true, q: [0, 1.2, 0], hq: true },
  { t: 38, p: [14, 9, 4], q: [6, 0.5, 4] },
  { t: 44, p: [6, 19, 6.01], q: [6, 0, 6] },
  { t: 53, p: [6, 19, 6.01], q: [6, 0, 6] },
  { t: 58, p: [40, 45, 50], q: [40, 0, 5] },
  { t: 62, p: [40, 80, 70], q: [40, 0, 0] }
]

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount
const smooth = (value: number) => {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}
const ramp = (value: number, start: number, end: number) => smooth((value - start) / (end - start))

function mappedNodes(nodes: ReturnType<typeof useCampus>['nodes']) {
  const ordered = [
    ...nodes.filter(node => node.scope === 'building' && node.id === 'ap-410-storage'),
    ...nodes.filter(node => node.scope === 'building' && node.id !== 'ap-410-storage'),
    ...nodes.filter(node => node.scope === 'campus')
  ]
  return ACCESS_POINTS.map((_, index) => ordered[index])
}

function makeSegments(): { segments: Segment[]; total: number } {
  const segments: Segment[] = []
  let time = 0
  let distance = 0
  for (let index = 0; index < WALK_PATH.length - 1; index += 1) {
    const from = WALK_PATH[index]
    const to = WALK_PATH[index + 1]
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const duration = length / 1.3
    segments.push({
      start: time,
      end: time + duration,
      from,
      to,
      distance,
      pause: false,
      yaw: Math.atan2(to[0] - from[0], to[1] - from[1])
    })
    time += duration
    distance += length
    if (to[2]) {
      segments.push({ start: time, end: time + to[2], from: to, to, distance, pause: true, yaw: 0 })
      time += to[2]
    }
  }
  segments.forEach((segment, index) => {
    if (segment.pause) segment.yaw = segments[index + 1]?.yaw ?? 0
  })
  return { segments, total: time }
}

function positionAt(time: number, segments: Segment[], total: number) {
  const wrapped = ((time % total) + total) % total
  const segment = segments.find(item => wrapped < item.end) ?? segments[segments.length - 1]
  const progress = segment.pause ? 0 : (wrapped - segment.start) / (segment.end - segment.start)
  const x = lerp(segment.from[0], segment.to[0], progress)
  const z = lerp(segment.from[1], segment.to[1], progress)
  return {
    x,
    z,
    yaw: segment.yaw,
    moving: !segment.pause,
    distance: segment.distance + (segment.pause ? 0 : progress * Math.hypot(segment.to[0] - segment.from[0], segment.to[1] - segment.from[1])),
    state: segment.pause ? 'stationary' : z > 8.2 ? (segment.distance < 30 ? 'entering' : 'leaving') : 'walking'
  }
}

function syntheticFeatures(x: number, z: number, time: number) {
  return ACCESS_POINTS.map((ap, index) => {
    const distance = Math.hypot(x - ap.x, z - ap.z)
    return {
      amplitude: 0.18 + 0.82 * Math.exp(-distance / 5.2) + 0.025 * Math.sin(time * 2.3 + index * 1.7),
      phase: Math.sin(distance * 1.37 + index * 1.41 + time * 0.17)
    }
  })
}

function estimatePosition(observed: ReturnType<typeof syntheticFeatures>, time: number): Estimate {
  let best: Estimate = { x: SENSOR.x, z: SENSOR.z, score: Infinity }
  for (const step of [0.5, 0.2]) {
    const minX = step === 0.5 ? 0.5 : Math.max(0.2, best.x - 1)
    const maxX = step === 0.5 ? 11.5 : Math.min(11.8, best.x + 1)
    const minZ = step === 0.5 ? 0.5 : Math.max(0.2, best.z - 1)
    const maxZ = step === 0.5 ? 13.5 : Math.min(13.8, best.z + 1)
    for (let x = minX; x <= maxX + 1e-6; x += step) {
      for (let z = minZ; z <= maxZ + 1e-6; z += step) {
        const predicted = syntheticFeatures(x, z, time)
        const score = predicted.reduce((sum, feature, index) =>
          sum + (feature.amplitude - observed[index].amplitude) ** 2 * 1.8 +
          (feature.phase - observed[index].phase) ** 2 * 0.32, 0)
        if (score < best.score) best = { x, z, score }
      }
    }
  }
  return best
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 40
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(20,14,40,.85)'
    context.fillRect(0, 0, 128, 40)
    context.strokeStyle = '#8b5cf6'
    context.strokeRect(1, 1, 126, 38)
    context.fillStyle = '#fff'
    context.font = 'bold 22px system-ui'
    context.textAlign = 'center'
    context.fillText(text, 64, 28)
  }
  const texture = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }))
  sprite.scale.set(1.1, 0.34, 1)
  return sprite
}

function makeHumanoid() {
  const human = new THREE.Group()
  const body = new THREE.Group()
  human.add(body)
  const shirt = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x2a1670 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8c6a8 })
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f55 })
  const shoe = new THREE.MeshStandardMaterial({ color: 0x15122a })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.58, 0.22), shirt)
  torso.position.y = 1.25
  body.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), skin)
  head.position.y = 1.72
  body.add(head)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), skin)
  neck.position.y = 1.58
  body.add(neck)
  const limb = (length: number, width: number, material: THREE.Material) => {
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, width), material)
    mesh.position.y = -length / 2
    group.add(mesh)
    return group
  }
  const arms = ([-1, 1] as const).map(side => {
    const upper = limb(0.3, 0.09, shirt)
    upper.position.set(side * 0.26, 1.5, 0)
    const forearm = limb(0.28, 0.07, skin)
    forearm.position.y = -0.3
    upper.add(forearm)
    body.add(upper)
    return { upper, forearm }
  })
  const legs = ([-1, 1] as const).map(side => {
    const upper = limb(0.46, 0.12, pants)
    upper.position.set(side * 0.1, 0.95, 0)
    const lower = limb(0.46, 0.1, pants)
    lower.position.y = -0.46
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.24), shoe)
    foot.position.set(0, -0.46, 0.06)
    lower.add(foot)
    upper.add(lower)
    body.add(upper)
    return { upper, lower }
  })
  human.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = true
  })
  return { human, body, arms, legs }
}

function addRoom(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const material = (color: number, options: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...options })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 16), material(0x201a38, { roughness: 0.35, metalness: 0.25 }))
  floor.position.set(6, -0.1, 7)
  floor.receiveShadow = true
  scene.add(floor)

  WALL_SEGMENTS.forEach(([x1, z1, x2, z2, loss]) => {
    const horizontal = z1 === z2
    const length = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1)
    const thickness = loss > 6 ? 0.25 : 0.15
    const geometry = new THREE.BoxGeometry(horizontal ? length : thickness, 3.2, horizontal ? thickness : length)
    const wall = new THREE.Mesh(geometry, material(0x4a4470, { transparent: true, opacity: 0.42, depthWrite: false }))
    wall.position.set((x1 + x2) / 2, 1.6, (z1 + z2) / 2)
    scene.add(wall)
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.55 })
    )
    outline.position.copy(wall.position)
    scene.add(outline)
  })

  let randomSeed = 7
  const random = () => {
    randomSeed = (randomSeed * 16807) % 2147483647
    return randomSeed / 2147483647
  }
  const shelf = (centerX: number, startZ: number, endZ: number) => {
    const length = endZ - startZ
    const centerZ = (startZ + endZ) / 2
    const shelfMaterial = material(0x5b5478)
    ;[0.25, 0.85, 1.45, 2.05].forEach(y => {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, length), shelfMaterial)
      plank.position.set(centerX, y, centerZ)
      plank.castShadow = plank.receiveShadow = true
      scene.add(plank)
      let z = startZ + 0.15
      while (z < endZ - 0.5) {
        const width = 0.35 + random() * 0.3
        const height = 0.25 + random() * 0.3
        const item = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, height, width),
          material(0x8c7350 + Math.floor(random() * 0x101010))
        )
        item.position.set(centerX, y + 0.02 + height / 2, z + width / 2)
        item.castShadow = true
        scene.add(item)
        z += width + 0.08 + random() * 0.2
      }
    })
    for (let index = 0; index <= 3; index += 1) {
      for (const side of [-1, 1]) {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.05), material(0x3a3558))
        upright.position.set(centerX + side * 0.27, 1.1, startZ + index * length / 3)
        upright.castShadow = true
        scene.add(upright)
      }
    }
  }
  shelf(0.9, 1, 7)
  shelf(4.8, 0.6, 5)
  shelf(8.2, 0.6, 5)
  shelf(11.2, 1, 7)

  const heatCanvas = document.createElement('canvas')
  heatCanvas.width = 70
  heatCanvas.height = 80
  const heatContext = heatCanvas.getContext('2d')
  const heatTexture = new THREE.CanvasTexture(heatCanvas)
  heatTexture.magFilter = THREE.LinearFilter
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 16),
    new THREE.MeshBasicMaterial({ map: heatTexture, transparent: true, depthWrite: false })
  )
  field.rotation.x = -Math.PI / 2
  field.position.set(6, 0.03, 7)
  scene.add(field)

  const activityCanvas = document.createElement('canvas')
  activityCanvas.width = activityCanvas.height = 128
  const activityContext = activityCanvas.getContext('2d')
  if (activityContext) {
    const gradient = activityContext.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(34,211,238,.95)')
    gradient.addColorStop(0.35, 'rgba(120,120,245,.55)')
    gradient.addColorStop(0.7, 'rgba(139,92,246,.18)')
    gradient.addColorStop(1, 'rgba(139,92,246,0)')
    activityContext.fillStyle = gradient
    activityContext.fillRect(0, 0, 128, 128)
  }
  const activity = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(activityCanvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  activity.rotation.x = -Math.PI / 2
  scene.add(activity)
  const activityColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1.9, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide })
  )
  scene.add(activityColumn)
  const estimateRing = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.3, 40),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  )
  estimateRing.rotation.x = -Math.PI / 2
  scene.add(estimateRing)
  const truthRing = new THREE.Mesh(
    new THREE.RingGeometry(0.13, 0.19, 32),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  )
  truthRing.rotation.x = -Math.PI / 2
  scene.add(truthRing)
  const trailPositions = new Float32Array(90 * 3)
  const trailColors = new Float32Array(90 * 3)
  const trailGeometry = new THREE.BufferGeometry()
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3))
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  trail.frustumCulled = false
  scene.add(trail)

  renderer.shadowMap.enabled = true
  return { field, heatCanvas, heatContext, heatTexture, activity, activityColumn, estimateRing, truthRing, trail, trailPositions, trailColors }
}

export function SensingExperience() {
  const {
    nodes,
    agents,
    selectedApId,
    selectedAgentId,
    setSelectedApId,
    startMovement,
    pauseMovement,
    resetMovement,
    propSettings
  } = useCampus()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const graphRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef(nodes)
  const settingsRef = useRef(propSettings)
  const selectedApRef = useRef(selectedApId)
  const setSelectedApIdRef = useRef(setSelectedApId)
  const movementOwnedRef = useRef(false)
  const movementActionsRef = useRef({ startMovement, pauseMovement, resetMovement })
  const mapped = useMemo(() => mappedNodes(nodes), [nodes])
  const activeAgent = agents.find(agent => agent.id === selectedAgentId) ?? agents[0]
  const [guided, setGuided] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [walkSpeed, setWalkSpeed] = useState(1)
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    waves: true, field: true, network: true, activity: true, trail: true, graph: true
  })
  const [caption, setCaption] = useState(CAPTIONS[0][1])
  const [positionReadout, setPositionReadout] = useState('Actual: — · Estimated: —')
  const [featureReadout, setFeatureReadout] = useState('–')
  const [classifierReadout, setClassifierReadout] = useState('–')
  const [selectedReadout, setSelectedReadout] = useState('Select an AP in interactive mode to inspect its modelled link.')

  nodesRef.current = nodes
  settingsRef.current = propSettings
  selectedApRef.current = selectedApId
  setSelectedApIdRef.current = setSelectedApId
  movementActionsRef.current = { startMovement, pauseMovement, resetMovement }

  useEffect(() => {
    return () => {
      if (movementOwnedRef.current) {
        movementActionsRef.current.pauseMovement()
        movementOwnedRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const graph = graphRef.current
    const graphContext = graph?.getContext('2d')
    if (!canvas || !graph || !graphContext) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0a1a)
    scene.fog = new THREE.Fog(0x0d0a1a, 70, 220)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400)
    scene.add(new THREE.HemisphereLight(0xb9a8ff, 0x1a1230, 0.75))
    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(12, 20, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -12, right: 14, top: 14, bottom: -12, near: 1, far: 50 })
    sun.target.position.set(6, 0, 6)
    scene.add(sun, sun.target)

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      renderer.setSize(bounds.width, bounds.height, false)
      camera.aspect = bounds.width / bounds.height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    const roomLayers = addRoom(scene, renderer)
    const { human, body, arms, legs } = makeHumanoid()
    scene.add(human)
    const apGroup = new THREE.Group()
    scene.add(apGroup)
    const apMeshes: THREE.Mesh[] = []
    const waveRings: THREE.Mesh[] = []
    const nodeForSlot = mappedNodes(nodesRef.current)
    const apMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4f0ff,
      emissive: 0x8b5cf6,
      emissiveIntensity: 0.9
    })
    ACCESS_POINTS.forEach((ap, index) => {
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 24), apMaterial.clone())
      marker.position.set(ap.x, ap.y, ap.z)
      marker.userData.slot = index
      apGroup.add(marker)
      apMeshes.push(marker)
      const label = makeLabel(ap.id)
      label.position.set(ap.x, ap.y + 0.5, ap.z)
      apGroup.add(label)
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x8b5cf6 })
      )
      stem.position.set(ap.x, ap.y + 0.13, ap.z)
      apGroup.add(stem)
      for (let ringIndex = 0; ringIndex < 4; ringIndex += 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.97, 1, 64),
          new THREE.MeshBasicMaterial({
            color: index % 2 ? 0xa78bfa : 0x8b5cf6,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
          })
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(ap.x, 0.06 + ringIndex * 0.004, ap.z)
        ring.userData.offset = ringIndex / 4 + index * 0.13
        ring.userData.slot = index
        scene.add(ring)
        waveRings.push(ring)
      }
    })

    const sensor = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    )
    sensor.position.set(SENSOR.x, 0.5, SENSOR.z)
    scene.add(sensor)
    const sensorLabel = makeLabel('R')
    sensorLabel.position.set(SENSOR.x, 1, SENSOR.z)
    scene.add(sensorLabel)

    const network = new THREE.Group()
    scene.add(network)
    const networkPulses: { from: THREE.Vector3; to: THREE.Vector3; dot: THREE.Mesh; offset: number }[] = []
    const connect = (a: number, b: number) => {
      const from = new THREE.Vector3(ACCESS_POINTS[a].x, ACCESS_POINTS[a].y, ACCESS_POINTS[a].z)
      const to = new THREE.Vector3(ACCESS_POINTS[b].x, ACCESS_POINTS[b].y, ACCESS_POINTS[b].z)
      network.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.45 })
      ))
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee })
      )
      network.add(dot)
      networkPulses.push({ from, to, dot, offset: Math.random() })
    }
    ;[[0, 2], [2, 1], [1, 3], [0, 3], [0, 1]].forEach(([a, b]) => connect(a, b))

    const campusNetwork = new THREE.Group()
    const grid = new THREE.GridHelper(220, 44, 0x3b2a7a, 0x241a4a)
    grid.position.set(50, -0.2, 10)
    campusNetwork.add(grid)
    const campusNodes: THREE.Vector3[] = [new THREE.Vector3(12, 3, 4)]
    const campusCoordinates = [
      [30, -8, 10, 6, 9], [44, 14, 14, 8, 6], [58, -14, 12, 10, 12],
      [72, 10, 16, 7, 7], [50, 34, 10, 9, 5], [84, -6, 12, 8, 10],
      [66, 30, 12, 6, 8], [30, 24, 9, 7, 6]
    ]
    campusCoordinates.forEach(([x, z, width, depth, height]) => {
      const geometry = new THREE.BoxGeometry(width, height, depth)
      const building = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x2a2350, transparent: true, opacity: 0.7 })
      )
      building.position.set(x, height / 2, z)
      campusNetwork.add(building)
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x8b5cf6 })
      )
      edges.position.copy(building.position)
      campusNetwork.add(edges)
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xa78bfa })
      )
      node.position.set(x, height + 1, z)
      campusNetwork.add(node)
      campusNodes.push(node.position)
    })
    scene.add(campusNetwork)

    const campusLink = (a: THREE.Vector3, b: THREE.Vector3) => {
      network.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineBasicMaterial({ color: 0x5b3fd0, transparent: true, opacity: 0.45 })
      ))
    }
    for (let index = 0; index < campusNodes.length - 1; index += 1) campusLink(campusNodes[index], campusNodes[index + 1])
    campusLink(campusNodes[2], campusNodes[5])
    campusLink(campusNodes[1], campusNodes[8])

    const graphHistory = ACCESS_POINTS.map(() => Array(80).fill(-65) as number[])
    const graphColors = ['#a78bfa', '#22d3ee', '#f0abfc', '#7dd3fc']
    const drawGraph = () => {
      const width = 320
      const height = 130
      graphContext.clearRect(0, 0, width, height)
      graphContext.strokeStyle = 'rgba(139,92,246,.25)'
      graphContext.fillStyle = '#b2aadb'
      graphContext.font = '10px system-ui'
      for (let value = -80; value <= -50; value += 10) {
        const y = height - 10 - (value + 90) / 45 * (height - 20)
        graphContext.beginPath()
        graphContext.moveTo(24, y)
        graphContext.lineTo(width, y)
        graphContext.stroke()
        graphContext.fillText(String(value), 2, y + 3)
      }
      graphHistory.forEach((series, index) => {
        graphContext.strokeStyle = graphColors[index]
        graphContext.lineWidth = 1.6
        graphContext.beginPath()
        series.forEach((value, sample) => {
          const x = 24 + sample / 79 * (width - 26)
          const y = height - 10 - (clamp(value, -90, -45) + 90) / 45 * (height - 20)
          if (sample) graphContext.lineTo(x, y)
          else graphContext.moveTo(x, y)
        })
        graphContext.stroke()
      })
      graphContext.fillStyle = '#b2aadb'
      graphContext.fillText('−20 s', 24, height - 1)
      graphContext.fillText('now', width - 24, height - 1)
    }

    const appTransmitter = (slot: number): Transmitter => {
      const ap = ACCESS_POINTS[slot]
      const node = nodeForSlot[slot]
      return {
        id: node?.id ?? ap.id,
        x: ap.x,
        z: ap.z,
        y: ap.y,
        frequencyGHz: node?.band === '6 GHz' ? 6 : 5,
        powerDbm: node?.powerDbm ?? 18,
        gainDbi: node?.gainDbi ?? 0,
        active: node?.active ?? true
      }
    }
    const calculateStage4Rssi = (slot: number, human: ReturnType<typeof positionAt> | null) => {
      const transmitter = appTransmitter(slot)
      const currentNode = nodesRef.current.find(node => node.id === transmitter.id)
      transmitter.active = currentNode?.active ?? transmitter.active
      const obstacle: HumanObstacle[] = human ? [{ id: 'demo-person', x: human.x, z: human.z, radius: 0.35 }] : []
      return coverageAt(
        { x: SENSOR.x, z: SENSOR.z, y: 0.8 },
        [transmitter],
        ROOM_WALLS,
        {
          ...settingsRef.current,
          mode: 'individual',
          selectedApId: transmitter.id
        },
        obstacle
      ).rssi
    }

    const state = {
      time: 0,
      interactiveTime: 0,
      playing: true,
      guided: true,
      speed: 1,
      lastFrame: performance.now(),
      updateFieldIn: 0,
      updateEstimateIn: 0,
      yaw: 0,
      walkAmplitude: 0,
      estimate: { x: SENSOR.x, z: SENSOR.z, score: 0 } as Estimate,
      observations: syntheticFeatures(SENSOR.x, SENSOR.z, 0),
      estimatedTrail: [] as { x: number; z: number }[],
      orbit: { azimuth: 0.8, elevation: 0.62, radius: 24, target: new THREE.Vector3(6, 1, 5) },
      desiredOrbit: { azimuth: 0.8, elevation: 0.62, radius: 24, target: new THREE.Vector3(6, 1, 5) },
      dragging: null as { x: number; y: number; movement: number } | null,
      layers: { waves: true, field: true, network: true, activity: true, trail: true, graph: true } as Record<LayerKey, boolean>,
      lastUiUpdate: 0,
      lastGraphUpdate: 0
    }
    const cameraTarget = new THREE.Vector3(6, 1, 4)
    const cameraPosition = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const segments = makeSegments()
    const onWindowResize = () => resize()
    window.addEventListener('resize', onWindowResize)

    const setInteractiveMode = () => {
      if (!state.guided) return
      state.guided = false
      const offset = camera.position.clone().sub(cameraTarget)
      const radius = offset.length()
      state.orbit.azimuth = Math.atan2(offset.x, offset.z)
      state.orbit.elevation = Math.asin(offset.y / radius)
      state.orbit.radius = radius
      state.orbit.target.copy(cameraTarget)
      state.desiredOrbit.azimuth = state.orbit.azimuth
      state.desiredOrbit.elevation = state.orbit.elevation
      state.desiredOrbit.radius = radius
      state.desiredOrbit.target.copy(cameraTarget)
      setGuided(false)
    }

    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return
      setInteractiveMode()
      state.dragging = { x: event.clientX, y: event.clientY, movement: 0 }
      canvas.setPointerCapture(event.pointerId)
    }
    const pointerMove = (event: PointerEvent) => {
      if (!state.dragging) return
      const dx = event.clientX - state.dragging.x
      const dy = event.clientY - state.dragging.y
      state.dragging.movement += Math.abs(dx) + Math.abs(dy)
      state.dragging.x = event.clientX
      state.dragging.y = event.clientY
      state.desiredOrbit.azimuth -= dx * 0.006
      state.desiredOrbit.elevation = clamp(state.desiredOrbit.elevation + dy * 0.006, 0.12, 1.5)
    }
    const pointerUp = (event: PointerEvent) => {
      if (state.dragging && state.dragging.movement < 5) {
        const bounds = canvas.getBoundingClientRect()
        pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(apMeshes)[0]
        if (hit) {
          const slot = Number(hit.object.userData.slot)
          const ap = ACCESS_POINTS[slot]
          const node = nodeForSlot[slot]
          const currentNode = nodesRef.current.find(item => item.id === node?.id)
          if (node) setSelectedApIdRef.current(node.id)
          const rssi = calculateStage4Rssi(slot, null)
          setSelectedReadout(`${ap.id}${currentNode ? ` · ${currentNode.name} · ${currentNode.band} · ${currentNode.active ? 'Active' : 'Offline'}` : ''} at (${ap.x}, ${ap.y}, ${ap.z}) m · modelled RSSI at R: ${rssi.toFixed(1)} dBm`)
        }
      }
      state.dragging = null
    }
    const wheel = (event: WheelEvent) => {
      setInteractiveMode()
      state.desiredOrbit.radius = clamp(state.desiredOrbit.radius * (1 + event.deltaY * 0.001), 4, 140)
      event.preventDefault()
    }
    const contextMenu = (event: MouseEvent) => event.preventDefault()
    const control = (event: Event) => {
      const { type, detail } = event as CustomEvent<Record<string, unknown>>
      if (type === 'sensing-playback') state.playing = Boolean(detail.playing)
      if (type === 'sensing-mode') state.guided = Boolean(detail.guided)
      if (type === 'sensing-speed') state.speed = Number(detail.speed)
      if (type === 'sensing-layer') state.layers[detail.layer as LayerKey] = Boolean(detail.visible)
      if (type === 'sensing-reset-walk') {
        state.interactiveTime = 0
        state.estimatedTrail.length = 0
      }
      if (type === 'sensing-seek') {
        state.time = clamp(Number(detail.time), 0, 62)
        state.interactiveTime = Math.max(0, state.time - 14)
        state.estimatedTrail.length = 0
      }
      if (type === 'sensing-replay') {
        state.time = 0
        state.interactiveTime = 0
        state.estimatedTrail.length = 0
        state.estimate = { x: SENSOR.x, z: SENSOR.z, score: 0 }
        state.guided = true
        state.playing = true
      }
      if (type === 'sensing-camera') {
        state.guided = false
        if (detail.topView) {
          state.desiredOrbit.elevation = 1.5
          state.desiredOrbit.radius = 24
          state.desiredOrbit.target.set(6, 0, 6)
        } else {
          state.desiredOrbit.elevation = 0.62
          state.desiredOrbit.azimuth = 0.8
          state.desiredOrbit.radius = 24
          state.desiredOrbit.target.set(6, 1, 5)
        }
      }
    }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerUp)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('contextmenu', contextMenu)
    ;['sensing-playback', 'sensing-mode', 'sensing-speed', 'sensing-layer', 'sensing-seek', 'sensing-replay', 'sensing-camera', 'sensing-reset-walk']
      .forEach(type => canvas.addEventListener(type, control))

    const updateField = (humanPosition: ReturnType<typeof positionAt> | null) => {
      const { heatCanvas, heatContext, heatTexture } = roomLayers
      if (!heatContext) return
      const image = heatContext.createImageData(heatCanvas.width, heatCanvas.height)
      const pixels = image.data
      for (let row = 0; row < heatCanvas.height; row += 1) {
        const z = -1 + (row + 0.5) * 0.2
        for (let column = 0; column < heatCanvas.width; column += 1) {
          const x = -1 + (column + 0.5) * 0.2
          if (!((x > 0 && x < 12 && z > 0 && z < 8) || (x > 5 && x < 7 && z >= 8 && z < 14))) continue
          let strongest = -200
          for (let slot = 0; slot < ACCESS_POINTS.length; slot += 1) {
            const ap = ACCESS_POINTS[slot]
            const node = nodeForSlot[slot]
            const active = nodesRef.current.find(item => item.id === node?.id)?.active ?? true
            if (!active) continue
            const distance = Math.hypot(x - ap.x, z - ap.z, ap.y - 1)
            let rssi = -40 - 26 * Math.log10(Math.max(distance, 1))
            for (const wall of WALL_SEGMENTS) {
              const [x1, z1, x2, z2, loss] = wall
              if (loss && intersects(ap.x, ap.z, x, z, x1, z1, x2, z2)) rssi -= loss
            }
            if (humanPosition && pointToSegmentDistance(humanPosition.x, humanPosition.z, ap.x, ap.z, x, z) < 0.4) rssi -= 6
            strongest = Math.max(strongest, rssi)
          }
          const strength = clamp((strongest + 88) / 46, 0, 1)
          const offset = (row * heatCanvas.width + column) * 4
          pixels[offset] = 60 + strength * 100
          pixels[offset + 1] = 30 + strength * strength * 190
          pixels[offset + 2] = 170 + strength * 70
          pixels[offset + 3] = Math.pow(strength, 0.9) * 150
        }
      }
      heatContext.putImageData(image, 0, 0)
      heatTexture.needsUpdate = true
    }

    let frameId = 0
    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate)
      const delta = Math.min(0.05, (now - state.lastFrame) / 1000)
      state.lastFrame = now
      if (state.playing) {
        if (state.guided) {
          state.time = Math.min(62, state.time + delta)
          if (state.time >= 62) {
            state.playing = false
            setPlaying(false)
          }
        } else {
          state.interactiveTime += delta * state.speed
        }
      }
      const personTime = state.guided ? Math.max(0, state.time - 14) : state.interactiveTime
      const guidedVisibility = {
        waves: state.guided ? ramp(state.time, 6, 8) : 1,
        field: state.guided ? ramp(state.time, 8, 11) : 1,
        human: state.guided ? (state.time >= 14 ? 1 : 0) : 1,
        activity: state.guided ? ramp(state.time, 30, 32) : 1,
        graph: state.guided ? ramp(state.time, 30, 33) : 1
      }
      const person = positionAt(personTime, segments.segments, segments.total)
      const personVisible = guidedVisibility.human > 0
      const seconds = now / 1000

      human.visible = personVisible
      human.position.set(person.x, 0, person.z)
      let yawDelta = person.yaw - state.yaw
      yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta))
      state.yaw += yawDelta * (1 - Math.exp(-10 * delta))
      human.rotation.y = state.yaw
      state.walkAmplitude += ((person.moving ? 1 : 0) - state.walkAmplitude) * (1 - Math.exp(-8 * delta))
      const phase = person.distance * 4.5
      const amplitude = state.walkAmplitude
      legs[0].upper.rotation.x = Math.sin(phase) * 0.6 * amplitude
      legs[1].upper.rotation.x = -Math.sin(phase) * 0.6 * amplitude
      legs[0].lower.rotation.x = Math.max(0, -Math.sin(phase + 0.6)) * 0.8 * amplitude
      legs[1].lower.rotation.x = Math.max(0, Math.sin(phase - 0.6)) * 0.8 * amplitude
      arms[0].upper.rotation.x = -Math.sin(phase) * 0.5 * amplitude
      arms[1].upper.rotation.x = Math.sin(phase) * 0.5 * amplitude
      arms.forEach(arm => { arm.forearm.rotation.x = -0.3 * amplitude })
      body.position.y = Math.abs(Math.sin(phase)) * 0.03 * amplitude
      body.rotation.z = Math.sin(phase) * 0.03 * amplitude

      apGroup.visible = !state.guided || state.time >= 5
      apMeshes.forEach((marker, slot) => {
        const node = nodeForSlot[slot]
        const active = nodesRef.current.find(item => item.id === node?.id)?.active ?? true
        const material = marker.material as THREE.MeshStandardMaterial
        const selected = node?.id === selectedApRef.current
        material.color.setHex(active ? (selected ? 0xd9b8ff : 0xf4f0ff) : 0x77717f)
        material.emissiveIntensity = active ? (selected ? 1.35 : 0.9) : 0
        marker.scale.setScalar(selected ? 1.15 : 1)
      })
      waveRings.forEach(ring => {
        const progress = (seconds * 0.35 + Number(ring.userData.offset)) % 1
        const size = 0.2 + progress * 9
        ring.scale.set(size, size, 1)
        const active = nodesRef.current.find(node => node.id === nodeForSlot[Number(ring.userData.slot)]?.id)?.active ?? true
        const material = ring.material as THREE.MeshBasicMaterial
        material.opacity = Math.pow(1 - progress, 1.6) * 0.7 * guidedVisibility.waves *
          (state.layers.waves && active ? 1 : 0)
        ring.visible = material.opacity > 0.01
      })
      network.visible = state.layers.network && guidedVisibility.waves > 0
      networkPulses.forEach(pulse => pulse.dot.position.lerpVectors(pulse.from, pulse.to, (seconds * 0.25 + pulse.offset) % 1))
      campusNetwork.visible = state.layers.network && (!state.guided || state.time >= 57)
      roomLayers.field.visible = state.layers.field && guidedVisibility.field > 0
      roomLayers.field.material.opacity = guidedVisibility.field
      state.updateFieldIn -= delta
      if (roomLayers.field.visible && state.updateFieldIn <= 0) {
        updateField(personVisible ? person : null)
        state.updateFieldIn = 0.12
      }

      state.updateEstimateIn -= delta
      if (personVisible && state.updateEstimateIn <= 0) {
        state.observations = syntheticFeatures(person.x, person.z, personTime)
        state.estimate = estimatePosition(state.observations, personTime)
        state.updateEstimateIn = 0.12
      }
      const estimatedX = state.estimate.x
      const estimatedZ = state.estimate.z
      const activityAlpha = guidedVisibility.activity * (state.layers.activity && personVisible ? 1 : 0)
      const activityScale = (person.moving ? 2.2 : 1.8) * (1 + 0.06 * Math.sin(seconds * 4))
      roomLayers.activity.visible = roomLayers.activityColumn.visible = roomLayers.estimateRing.visible =
        roomLayers.truthRing.visible = activityAlpha > 0
      roomLayers.activity.position.set(estimatedX, 0.05, estimatedZ)
      roomLayers.activity.scale.set(activityScale * 1.2, activityScale, 1)
      roomLayers.activity.material.opacity = activityAlpha
      roomLayers.activityColumn.position.set(estimatedX, 0.95, estimatedZ)
      roomLayers.activityColumn.material.opacity = 0.09 * activityAlpha
      roomLayers.estimateRing.position.set(estimatedX, 0.07, estimatedZ)
      roomLayers.truthRing.position.set(person.x, 0.075, person.z)
      if (personVisible && activityAlpha > 0) {
        state.estimatedTrail.push({ x: estimatedX, z: estimatedZ })
        if (state.estimatedTrail.length > 90) state.estimatedTrail.shift()
      }
      let trailCount = 0
      if (state.layers.trail && guidedVisibility.activity > 0 && personVisible) {
        for (let index = 0; index < state.estimatedTrail.length; index += 1) {
          const point = state.estimatedTrail[state.estimatedTrail.length - 1 - index]
          const offset = index * 3
          const fade = Math.pow(1 - index / 90, 1.5) * guidedVisibility.activity
          roomLayers.trailPositions.set([point.x, 0.08, point.z], offset)
          roomLayers.trailColors.set([0.25 * fade, 0.85 * fade, 0.95 * fade], offset)
          trailCount += 1
        }
      }
      roomLayers.trail.geometry.setDrawRange(0, trailCount)
      roomLayers.trail.geometry.attributes.position.needsUpdate = true
      roomLayers.trail.geometry.attributes.color.needsUpdate = true
      roomLayers.trail.visible = trailCount > 1

      if (now - state.lastGraphUpdate > 250) {
        state.lastGraphUpdate = now
        for (let slot = 0; slot < ACCESS_POINTS.length; slot += 1) {
          const value = calculateStage4Rssi(slot, personVisible ? person : null)
          graphHistory[slot].push(value)
          graphHistory[slot].shift()
        }
        if (state.layers.graph && guidedVisibility.graph > 0) drawGraph()
        const amplitudeMean = state.observations.reduce((sum, feature) => sum + feature.amplitude, 0) / state.observations.length
        const phaseRms = Math.sqrt(state.observations.reduce((sum, feature) => sum + feature.phase ** 2, 0) / state.observations.length)
        setFeatureReadout(`A ${amplitudeMean.toFixed(2)} · φ ${phaseRms.toFixed(2)}`)
        setClassifierReadout(personVisible ? (person.moving ? 'movement' : 'stationary') : 'no person')
        setPositionReadout(personVisible
          ? `Actual: (${person.x.toFixed(1)}, ${person.z.toFixed(1)}) · Estimated: (${estimatedX.toFixed(1)}, ${estimatedZ.toFixed(1)})`
          : 'Actual: not present · Estimated: —')
        setCaption(state.guided
          ? (CAPTIONS.find(([at]) => state.time < at)?.[1] ?? CAPTIONS[CAPTIONS.length - 1][1])
          : `Interactive: drag to rotate, scroll to zoom, click an AP to inspect its model. Person state: ${person.state}. Synthetic feature-based estimate is cyan; scripted position is amber.`)
        if (state.guided) setElapsed(state.time)
      }

      if (state.guided) {
        let index = 0
        while (index < CAMERA_KEYS.length - 2 && state.time > CAMERA_KEYS[index + 1].t) index += 1
        const start = CAMERA_KEYS[index]
        const end = CAMERA_KEYS[index + 1]
        const blend = smooth((state.time - start.t) / (end.t - start.t))
        const cameraPoint = (key: typeof start, vector: 'p' | 'q', attach: 'hp' | 'hq') => {
          const result = new THREE.Vector3(...key[vector])
          if (key[attach]) result.add(new THREE.Vector3(person.x, 0, person.z))
          return result
        }
        camera.position.lerpVectors(cameraPoint(start, 'p', 'hp'), cameraPoint(end, 'p', 'hp'), blend)
        cameraTarget.lerpVectors(cameraPoint(start, 'q', 'hq'), cameraPoint(end, 'q', 'hq'), blend)
        camera.lookAt(cameraTarget)
      } else {
        const blend = 1 - Math.exp(-8 * delta)
        state.orbit.azimuth = lerp(state.orbit.azimuth, state.desiredOrbit.azimuth, blend)
        state.orbit.elevation = lerp(state.orbit.elevation, state.desiredOrbit.elevation, blend)
        state.orbit.radius = lerp(state.orbit.radius, state.desiredOrbit.radius, blend)
        state.orbit.target.lerp(state.desiredOrbit.target, blend)
        cameraPosition.set(
          state.orbit.target.x + state.orbit.radius * Math.cos(state.orbit.elevation) * Math.sin(state.orbit.azimuth),
          state.orbit.target.y + state.orbit.radius * Math.sin(state.orbit.elevation),
          state.orbit.target.z + state.orbit.radius * Math.cos(state.orbit.elevation) * Math.cos(state.orbit.azimuth)
        )
        camera.position.copy(cameraPosition)
        camera.lookAt(state.orbit.target)
      }

      if (now - state.lastUiUpdate > 200) state.lastUiUpdate = now
      renderer.render(scene, camera)
    }
    frameId = requestAnimationFrame(animate)
    drawGraph()

    const cleanup = () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', onWindowResize)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerUp)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', contextMenu)
      ;['sensing-playback', 'sensing-mode', 'sensing-speed', 'sensing-layer', 'sensing-seek', 'sensing-replay', 'sensing-camera', 'sensing-reset-walk']
        .forEach(type => canvas.removeEventListener(type, control))
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => {
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) value.dispose()
            }
            material.dispose()
          })
        }
      })
      renderer.dispose()
    }
    canvas.dataset.cleanup = 'ready'
    return cleanup
  }, [])

  const togglePlayback = () => {
    const next = !playing
    setPlaying(next)
    if (next) {
      movementOwnedRef.current = true
      movementActionsRef.current.startMovement()
    } else {
      movementOwnedRef.current = false
      movementActionsRef.current.pauseMovement()
    }
    canvasRef.current?.dispatchEvent(new CustomEvent('sensing-playback', { detail: { playing: next } }))
  }
  const replay = () => {
    setElapsed(0)
    setPlaying(true)
    setGuided(true)
    canvasRef.current?.dispatchEvent(new CustomEvent('sensing-replay'))
    movementActionsRef.current.resetMovement()
    movementOwnedRef.current = true
    movementActionsRef.current.startMovement()
  }
  const toggleMode = () => {
    const next = !guided
    setGuided(next)
    canvasRef.current?.dispatchEvent(new CustomEvent('sensing-mode', { detail: { guided: next } }))
  }
  const toggleLayer = (key: LayerKey) => {
    const visible = !layers[key]
    setLayers(current => ({ ...current, [key]: visible }))
    canvasRef.current?.dispatchEvent(new CustomEvent('sensing-layer', { detail: { layer: key, visible } }))
  }
  const selectCamera = (topView: boolean) => {
    setGuided(false)
    canvasRef.current?.dispatchEvent(new CustomEvent('sensing-camera', { detail: { topView } }))
  }

  return (
    <div className="sensing-experience">
      <canvas ref={canvasRef} className="sensing-canvas" aria-label="Animated 3D Wi-Fi sensing demonstration" />
      <div className="sensing-float sensing-title">
        <b>CAMPUS SENTINEL <span>/</span> Building 410</b>
        <span>Storage-room digital twin · illustrative wireless sensing</span>
      </div>
      <aside className={`sensing-float sensing-telemetry ${layers.graph ? '' : 'is-hidden'}`}>
        <canvas ref={graphRef} width={320} height={130} aria-label="Modelled RSSI history graph" />
        <small><i>MODELLED</i> RSSI · four virtual AP-to-receiver links</small>
        <small><i>SYNTHETIC</i> CSI-like features: <b>{featureReadout}</b></small>
        <small>Classifier output: <b>{classifierReadout}</b></small>
        <small>Data source: <select aria-label="Data source" defaultValue="synthetic"><option value="synthetic">Synthetic demonstration</option><option disabled>Recorded CSI (not loaded)</option><option disabled>Live CSI (not connected)</option></select></small>
        <small>{positionReadout}</small>
        <small>{selectedReadout}</small>
        <div className="sensing-data-status">SIMULATION ONLY · No live router, CSI capture or validated localization is connected.</div>
      </aside>
      <div className="sensing-legend">
        <span><i className="ap-dot" />Access point</span>
        <span><i className="person-dot" />Simulated person</span>
        <span><i className="activity-dot" />Estimated activity</span>
      </div>
      <div className="sensing-caption">{caption}</div>
      <div className="sensing-controls">
        <button onClick={togglePlayback}>{playing ? (guided ? 'Pause' : 'Stop walk') : (guided ? 'Play' : 'Start walk')}</button>
        <button onClick={replay}>Replay</button>
        <button onClick={toggleMode}>Mode: {guided ? 'Guided' : 'Interactive'}</button>
        {guided
          ? <input aria-label="Guided demonstration timeline" type="range" min="0" max="62" step="0.1" value={Math.min(elapsed, 62)} onChange={event => {
            const value = Number(event.target.value)
            setElapsed(value)
            if (canvasRef.current) canvasRef.current.dispatchEvent(new CustomEvent('sensing-seek', { detail: { time: value } }))
          }} />
          : <label>Speed <input aria-label="Walking speed" type="range" min="0.4" max="2.5" step="0.1" value={walkSpeed} onChange={event => {
            const speed = Number(event.target.value)
            setWalkSpeed(speed)
            canvasRef.current?.dispatchEvent(new CustomEvent('sensing-speed', { detail: { speed } }))
          }} /></label>}
        {!guided && <button onClick={() => {
          canvasRef.current?.dispatchEvent(new CustomEvent('sensing-reset-walk'))
          movementActionsRef.current.resetMovement()
        }}>Reset walk</button>}
        <button onClick={() => selectCamera(true)}>Top view</button>
        <button onClick={() => selectCamera(false)}>Room view</button>
        {(['waves', 'field', 'network', 'activity', 'trail', 'graph'] as LayerKey[]).map(key => (
          <label key={key}><input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} /> {key[0].toUpperCase() + key.slice(1)}</label>
        ))}
      </div>
      <span className="sensing-live-ap" aria-hidden="true">{mapped.filter(Boolean).length} shared AP configurations · {activeAgent?.name ?? 'No active agent'} · selected {nodes.find(node => node.id === selectedApId)?.name ?? selectedApId}</span>
    </div>
  )
}

export { SensingExperience as SensingExperiencePanel }

function intersects(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const denominator = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx)
  if (Math.abs(denominator) < 1e-9) return false
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / denominator
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / denominator
  return t > 0 && t < 1 && u > 0 && u < 1
}

function pointToSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const lengthSquared = dx * dx + dz * dz || 1
  const projection = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSquared, 0, 1)
  return Math.hypot(px - (ax + projection * dx), pz - (az + projection * dz))
}
