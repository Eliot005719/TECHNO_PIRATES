import { Canvas } from '@react-three/fiber'
import { Billboard, OrbitControls, Text } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { campusBuildings, type Building } from '../data/visual-geometry'
import type { WifiNode } from '../data/wifi-mesh'
import type { CoverageCell } from '../simulation/propagation/propagationTypes'
import type { Agent } from '../simulation/movement/movementEngine'
import { SpatialActivityLayer } from './experience/SpatialActivityLayer'

export type Mode = 'campus' | 'interior'
export type SceneViewPreset = 'campus' | 'wifi' | 'propagation' | 'movement' | 'sensing'

export type MeshOptions = {
  visible: boolean
  labels: boolean
  links: boolean
  scope: 'campus' | 'building'
  ceilings: boolean
  furniture: boolean
  coverageEffects: boolean
}

type Props = {
  mode: Mode
  selected: string
  cutaway: boolean
  options: MeshOptions
  nodes: WifiNode[]
  coverage?: CoverageCell[]
  localCoverage?: CoverageCell[]
  heatmap?: boolean
  heatmapOpacity?: number
  agents?: Agent[]
  selectedAgentId?: string
  selectedApId?: string
  viewPreset?: SceneViewPreset
  showTrails?: boolean
  onViewPresetChange?: (preset: SceneViewPreset) => void
  onSelectBuilding?: (id: string) => void
  onSelectNode?: (id: string) => void
  onSelectAgent?: (id: string) => void
  onSelectRoom?: (id: string) => void
}

const linkLineMaterial = new THREE.LineBasicMaterial({
  color: '#8d62e8',
  transparent: true,
  opacity: 0.75,
  linewidth: 2
})

function Ground() {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.2, 0]}>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#e4ebee" roughness={0.95} />
      </mesh>
      <gridHelper args={[180, 180, '#b7c3c8', '#d2dade']} position={[0, -0.18, 0]} />
    </>
  )
}

const TREE_POSITIONS: [number, number, number, number][] = [
  [-21, -13, 0.9, 0.9], [-18, 12, 0.8, 0.85], [-13, -13, 0.75, 0.8],
  [-7, 13, 0.85, 0.9], [0, -13, 0.75, 0.82], [6, 13, 0.95, 1],
  [12, -13, 0.8, 0.85], [20, 11, 0.9, 0.95], [21, -9, 0.78, 0.85],
  [-21, 3, 0.82, 0.9], [17, 3, 0.72, 0.78], [-3, 11, 0.72, 0.8]
]

function CampusTrees() {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.13, 0.18, 0.9, 7), [])
  const crownGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.9, 1), [])
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#76533d', roughness: 0.9 }), [])
  const crownMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#739d71', roughness: 0.85, flatShading: true }), [])

  useEffect(() => {
    const trunkMesh = trunks.current
    const crownMesh = crowns.current
    if (!trunkMesh || !crownMesh) return

    const transform = new THREE.Object3D()
    TREE_POSITIONS.forEach(([x, z, width, height], index) => {
      transform.position.set(x, 0.46, z)
      transform.scale.set(width, 1, width)
      transform.updateMatrix()
      trunkMesh.setMatrixAt(index, transform.matrix)

      transform.position.set(x, 1.55 * height, z)
      transform.scale.set(width, height, width)
      transform.updateMatrix()
      crownMesh.setMatrixAt(index, transform.matrix)
    })
    trunkMesh.instanceMatrix.needsUpdate = true
    crownMesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <>
      <instancedMesh ref={trunks} args={[trunkGeometry, trunkMaterial, TREE_POSITIONS.length]} castShadow />
      <instancedMesh ref={crowns} args={[crownGeometry, crownMaterial, TREE_POSITIONS.length]} castShadow />
    </>
  )
}

function BuildingItem({
  b,
  isSelected,
  onSelect
}: {
  b: Building
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const facadeColor = b.id === '60' ? '#d9d4c8' : b.id === '720' ? '#dfd9cf' : b.id === '9B' ? '#e5dac9' : '#e8dfd0'
  const windowWidth = Math.min(0.8, b.size[0] * 0.2)
  const frontWindows = [-b.size[0] * 0.25, b.size[0] * 0.25]
  const windowRows = b.size[1] >= 4 ? [1.1, 2.8] : [1.15]
  const sideWindows = [-b.size[2] * 0.22, b.size[2] * 0.22]

  return (
    <group
      position={[b.position[0], 0, b.position[2]]}
      onClick={e => {
        e.stopPropagation()
        onSelect(b.id)
      }}
      onPointerOver={e => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <group scale={1.18}>
      <mesh position={[0, b.size[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={b.size} />
        <meshStandardMaterial
          color={hovered ? '#f0e5d5' : facadeColor}
          roughness={0.82}
        />
      </mesh>

      <mesh position={[0, b.size[1] + 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.size[0] + 0.28, 0.24, b.size[2] + 0.28]} />
        <meshStandardMaterial color="#3f444b" roughness={0.9} />
      </mesh>

      {frontWindows.flatMap(x => windowRows.map(y => (
        <mesh key={`front-${x}-${y}`} position={[x, y, b.size[2] / 2 + 0.045]}>
          <boxGeometry args={[windowWidth, 0.68, 0.08]} />
          <meshStandardMaterial color="#78909a" roughness={0.28} metalness={0.12} />
        </mesh>
      )))}
      {sideWindows.map(z => (
        <mesh key={`side-${z}`} position={[b.size[0] / 2 + 0.045, 1.35, z]} rotation-y={Math.PI / 2}>
          <boxGeometry args={[0.72, 0.82, 0.08]} />
          <meshStandardMaterial color="#78909a" roughness={0.28} metalness={0.12} />
        </mesh>
      ))}

      <mesh position={[0, 0.68, b.size[2] / 2 + 0.06]}>
        <boxGeometry args={[0.78, 1.36, 0.1]} />
        <meshStandardMaterial color="#75614e" roughness={0.8} />
      </mesh>

      <Text
        position={[0, b.size[1] + 0.42, 0]}
        fontSize={0.36}
        color={isSelected ? '#5d32a1' : '#554d47'}
        anchorX="center"
        anchorY="middle"
      >
        {b.id}
      </Text>

      {isSelected && (
        <mesh position={[0, 0.035, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[Math.max(b.size[0], b.size[2]) * 0.56, Math.max(b.size[0], b.size[2]) * 0.6, 48]} />
          <meshBasicMaterial color="#8f62d8" transparent opacity={0.75} />
        </mesh>
      )}
      </group>
    </group>
  )
}

function getNodeDisplayPosition(node: WifiNode, mode: Mode): [number, number, number] {
  if (mode === 'interior') {
    return [node.position[0], Math.max(node.position[1] + 0.8, 3.8), node.position[2]]
  }

  const campusHosts: Record<string, string> = {
    'ap-campus-west': '6',
    'ap-campus-core': '410',
    'ap-campus-east': '720'
  }
  const buildingId = node.building ?? campusHosts[node.id]
  const hostBuilding = campusBuildings.find(building => building.id === buildingId)
  const rooftopHeight = hostBuilding?.size[1] ?? 0

  return [
    node.position[0],
    Math.max(node.position[1] + 1.25, rooftopHeight + 1.6),
    node.position[2]
  ]
}

function NodeItem({
  node,
  isSelected,
  showLabel,
  showCoverage,
  mode,
  onSelect
}: {
  node: WifiNode
  isSelected: boolean
  showLabel: boolean
  showCoverage: boolean
  mode: Mode
  onSelect: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const nodePosition = getNodeDisplayPosition(node, mode)

  return (
    <group
      position={nodePosition}
      onClick={e => {
        e.stopPropagation()
        onSelect(node.id)
      }}
      onPointerOver={e => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      {showCoverage && node.active && (
        <mesh>
          <sphereGeometry args={[3.3, 18, 12]} />
          <meshBasicMaterial
            color="#a77aea"
            transparent
            opacity={0.045}
            depthWrite={false}
          />
        </mesh>
      )}

      <mesh>
        <sphereGeometry args={[isSelected ? 0.48 : 0.37, 16, 12]} />
        <meshStandardMaterial
          color={node.active ? (isSelected || hovered ? '#d9b8ff' : '#a66aff') : '#8d8794'}
          emissive={node.active ? '#8e38ec' : '#000000'}
          emissiveIntensity={node.active ? (isSelected ? 1.6 : 0.9) : 0}
          roughness={0.35}
        />
      </mesh>

      {node.active && (
        <mesh rotation-x={Math.PI / 2} position={[0, -0.48, 0]}>
          <ringGeometry args={[0.55, 0.6, 32]} />
          <meshBasicMaterial
            color="#ad83eb"
            transparent
            opacity={isSelected ? 0.8 : 0.5}
          />
        </mesh>
      )}

      {showLabel && (
        <group position={[0, 0.68, 0]}>
          <Text
            fontSize={0.24}
            color={isSelected ? '#512ba5' : '#4a3b61'}
            anchorX="center"
            anchorY="middle"
          >
            {node.id}
          </Text>
        </group>
      )}

      {isSelected && (
        <mesh>
          <sphereGeometry args={[0.58, 16, 12]} />
          <meshBasicMaterial color="#b482f1" transparent opacity={0.24} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function MeshLinks({ nodes, mode }: { nodes: WifiNode[]; mode: Mode }) {
  const map = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])
  const links = useMemo(() => {
    const res: { a: WifiNode; b: WifiNode }[] = []
    nodes.forEach(a => {
      a.connections.forEach(id => {
        const b = map.get(id)
        if (b && a.id < id && a.active && b.active) {
          res.push({ a, b })
        }
      })
    })
    return res
  }, [nodes, map])

  return (
    <>
      {links.map(({ a, b }) => (
        <line key={`${a.id}-${b.id}`}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([...getNodeDisplayPosition(a, mode), ...getNodeDisplayPosition(b, mode)]), 3]}
            />
          </bufferGeometry>
          <primitive attach="material" object={linkLineMaterial} />
        </line>
      ))}
    </>
  )
}

function MeshLayer({
  nodes,
  options,
  selected,
  mode,
  onSelectNode
}: {
  nodes: WifiNode[]
  options: MeshOptions
  selected: string
  mode: Mode
  onSelectNode: (id: string) => void
}) {
  if (!options.visible) return null

  return (
    <group>
      {options.links && <MeshLinks nodes={nodes} mode={mode} />}
      {nodes.map(n => (
        <NodeItem
          key={n.id}
          node={n}
          isSelected={selected === n.id}
          showLabel={options.labels}
          showCoverage={options.coverageEffects}
          mode={mode}
          onSelect={onSelectNode}
        />
      ))}
    </group>
  )
}

// Color map for propagation RSSI values
function heatColor(rssi: number): string {
  if (rssi > -58) return '#22c55e' // strong - green
  if (rssi > -70) return '#eab308' // moderate - yellow
  if (rssi > -82) return '#f97316' // weak - orange
  return '#ef4444' // very weak/none - red
}

function HeatmapLayer({
  cells,
  localCells = [],
  opacity = 0.44
}: {
  cells: CoverageCell[]
  localCells?: CoverageCell[]
  opacity?: number
}) {
  const renderCells = (items: CoverageCell[], y: number, alpha: number, keyPrefix: string) =>
    items.map((cell, index) => (
      <mesh
        key={`${keyPrefix}-${cell.x}-${cell.z}-${index}`}
        position={[cell.x, y, cell.z]}
        rotation-x={-Math.PI / 2}
      >
        <planeGeometry args={[cell.cellWidth ?? 0.78, cell.cellDepth ?? 0.78]} />
        <meshBasicMaterial
          color={heatColor(cell.rssi)}
          transparent
          opacity={alpha}
          depthWrite={false}
        />
      </mesh>
    ))

  return (
    <group>
      {renderCells(cells, 0.12, opacity, 'coverage')}
      {renderCells(localCells, 0.14, Math.min(0.8, opacity + 0.18), 'local')}
    </group>
  )
}

/**
 * Reusable Low-Poly Humanoid Agent Component
 * Distinguishable low-poly anatomy: Torso with individual agent color, head with hair/cap,
 * limbs, floating ID badge, and floor selection indicator.
 */
function LowPolyAgent({
  agent,
  isSelected,
  showTrail,
  onSelect
}: {
  agent: Agent
  isSelected: boolean
  showTrail: boolean
  onSelect: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <group>
      {/* Movement trail line */}
      {showTrail && agent.trail.length > 1 && (
        <line>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(agent.trail.flatMap(p => [p[0], 0.15, p[1]])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={agent.color}
            transparent
            opacity={isSelected ? 0.9 : 0.6}
            linewidth={2}
          />
        </line>
      )}

      {/* Low-poly Human Agent mesh */}
      <group
        position={[agent.x, agent.y, agent.z]}
        onClick={e => {
          e.stopPropagation()
          onSelect(agent.id)
        }}
        onPointerOver={e => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        {/* Selection / active floor ring */}
        <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.34, isSelected ? 0.48 : 0.4, 24]} />
          <meshBasicMaterial
            color={isSelected ? '#6938dc' : agent.color}
            transparent
            opacity={isSelected ? 0.95 : hovered ? 0.6 : 0.3}
          />
        </mesh>

        {/* Legs / Trousers */}
        <mesh position={[-0.09, 0.32, 0]} castShadow>
          <boxGeometry args={[0.11, 0.56, 0.12]} />
          <meshStandardMaterial color="#373145" roughness={0.7} />
        </mesh>
        <mesh position={[0.09, 0.32, 0]} castShadow>
          <boxGeometry args={[0.11, 0.56, 0.12]} />
          <meshStandardMaterial color="#373145" roughness={0.7} />
        </mesh>

        {/* Torso / Jacket in distinct Agent color */}
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[0.34, 0.54, 0.22]} />
          <meshStandardMaterial
            color={agent.color}
            roughness={0.4}
            emissive={isSelected ? agent.color : '#000000'}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
        </mesh>

        {/* Arms */}
        <mesh position={[-0.22, 0.82, 0]}>
          <boxGeometry args={[0.08, 0.44, 0.11]} />
          <meshStandardMaterial color={agent.color} roughness={0.5} />
        </mesh>
        <mesh position={[0.22, 0.82, 0]}>
          <boxGeometry args={[0.08, 0.44, 0.11]} />
          <meshStandardMaterial color={agent.color} roughness={0.5} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.25, 0]} castShadow>
          <boxGeometry args={[0.22, 0.24, 0.22]} />
          <meshStandardMaterial color="#f6d3b3" roughness={0.5} />
        </mesh>

        {/* Hair / Cap */}
        <mesh position={[0, 1.38, 0]}>
          <boxGeometry args={[0.24, 0.08, 0.24]} />
          <meshStandardMaterial color="#2d2836" />
        </mesh>

        {/* Floating ID badge */}
        <group position={[0, 1.62, 0]}>
          <Text
            fontSize={0.22}
            color={isSelected ? '#4819ad' : '#2d1b54'}
            anchorX="center"
            anchorY="middle"
          >
            {agent.id}
          </Text>
        </group>
      </group>
    </group>
  )
}

function AgentsLayer({
  agents = [],
  selectedAgentId,
  showTrails = true,
  onSelectAgent
}: {
  agents?: Agent[]
  selectedAgentId?: string
  showTrails?: boolean
  onSelectAgent?: (id: string) => void
}) {
  return (
    <group>
      {agents
        .filter(a => a.active)
        .map(a => (
          <LowPolyAgent
            key={a.id}
            agent={a}
            isSelected={selectedAgentId === a.id}
            showTrail={showTrails}
            onSelect={id => onSelectAgent?.(id)}
          />
        ))}
    </group>
  )
}

function CampusScene({
  selected,
  onSelectBuilding,
  nodes,
  options,
  onSelectNode,
  coverage,
  localCoverage,
  heatmap,
  heatmapOpacity,
  agents,
  selectedAgentId,
  showTrails,
  onSelectAgent
}: Props) {
  const shownNodes = options.scope === 'campus' ? nodes : nodes.filter(n => n.scope === 'building')
  return (
    <group>
      <Ground />

      <mesh position={[-1, -0.78, 0]} receiveShadow castShadow>
        <boxGeometry args={[50.5, 0.18, 34.5]} />
        <meshStandardMaterial color="#657264" roughness={0.95} />
      </mesh>
      <mesh position={[-1, -0.62, 0]} receiveShadow>
        <boxGeometry args={[50.3, 0.14, 34.3]} />
        <meshStandardMaterial color="#c7d0bc" roughness={0.95} />
      </mesh>
      <mesh position={[-1, -0.275, 0]} receiveShadow>
        <boxGeometry args={[50, 0.55, 34]} />
        <meshStandardMaterial color="#c6d4bb" roughness={0.95} />
      </mesh>

      <mesh position={[-1, 0.008, 11]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[43, 1.15]} />
        <meshStandardMaterial color="#c5c6bd" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.1, 26]} />
        <meshStandardMaterial color="#d2cec3" roughness={0.92} />
      </mesh>

      {heatmap && coverage && (
        <HeatmapLayer
          cells={coverage}
          localCells={localCoverage}
          opacity={heatmapOpacity}
        />
      )}

      {campusBuildings.map(b => (
        <BuildingItem
          key={b.id}
          b={b}
          isSelected={selected === b.id}
          onSelect={id => onSelectBuilding?.(id)}
        />
      ))}

      <CampusTrees />

      <MeshLayer
        nodes={shownNodes}
        options={options}
        selected={selected}
        mode="campus"
        onSelectNode={id => onSelectNode?.(id)}
      />

      <AgentsLayer
        agents={agents}
        selectedAgentId={selectedAgentId}
        showTrails={showTrails}
        onSelectAgent={id => onSelectAgent?.(id)}
      />

      <Billboard position={[-30, 10, 10]}>
        <Text
          fontSize={1}
          maxWidth={22}
          anchorX="left"
          anchorY="middle"
          color="#382451"
          outlineWidth={0.015}
          outlineColor="#e9e9ee"
        >
          CAMPUS SENTINEL / LIVE WI-FI SIMULATION
        </Text>
      </Billboard>
    </group>
  )
}

function ArchitecturalWall({
  p,
  a,
  hide = false,
  color = '#ebe7f5'
}: {
  p: [number, number, number]
  a: [number, number, number]
  hide?: boolean
  color?: string
}) {
  if (hide) return null
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={a} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  )
}

function ArchitecturalDoor({ p, label }: { p: [number, number, number]; label?: string }) {
  return (
    <group position={p}>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[1.25, 2.0, 0.08]} />
        <meshStandardMaterial color="#6a47be" roughness={0.5} />
      </mesh>
      <mesh position={[0.42, 1.0, 0.06]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#f0cb67" roughness={0.3} />
      </mesh>
      {label && (
        <Text position={[0, 2.2, 0]} fontSize={0.2} color="#452778">
          {label}
        </Text>
      )}
    </group>
  )
}

function ShelfUnit({ p }: { p: [number, number, number] }) {
  const boxes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => [
        (i % 3) * 1.05 - 0.9,
        0.55 + Math.floor(i / 3) * 0.65,
        (i % 2) * 0.25
      ] as [number, number, number]),
    []
  )

  return (
    <group position={p}>
      {[0, 0.7, 1.4, 2.1].map(y => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[3.2, 0.1, 0.7]} />
          <meshStandardMaterial color="#705e56" roughness={0.7} />
        </mesh>
      ))}
      {[-1.45, 1.45].map(x => (
        <mesh key={x} position={[x, 1.1, 0]}>
          <boxGeometry args={[0.1, 2.3, 0.7]} />
          <meshStandardMaterial color="#584c47" />
        </mesh>
      ))}
      {boxes.map((b, i) => (
        <mesh key={i} position={b}>
          <boxGeometry args={[0.65, 0.45, 0.55]} />
          <meshStandardMaterial color={i % 3 ? '#a87850' : '#b8945d'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function SeminarDesk({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[2.4, 0.08, 0.9]} />
        <meshStandardMaterial color="#e5dfef" roughness={0.4} />
      </mesh>
      {[-1.0, 1.0].map(x => (
        <mesh key={x} position={[x, 0.36, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.72, 8]} />
          <meshStandardMaterial color="#685c7c" />
        </mesh>
      ))}
    </group>
  )
}

function InteriorScene({
  selected,
  onSelectNode,
  nodes,
  options,
  cutaway,
  coverage,
  localCoverage,
  heatmap,
  heatmapOpacity,
  agents,
  selectedAgentId,
  showTrails,
  onSelectAgent,
  onSelectRoom
}: Props) {
  const shownNodes = options.scope === 'campus' ? nodes : nodes.filter(n => n.scope === 'building')

  return (
    <group>
      <Ground />

      {/* Building 410 Floor slab */}
      <mesh position={[1, 0.01, 0]} receiveShadow>
        <boxGeometry args={[22.5, 0.18, 16.5]} />
        <meshStandardMaterial color="#e4dfea" roughness={0.7} />
      </mesh>

      {/* Room boundary labels on floor */}
      <Text position={[-5, 0.12, 0]} rotation-x={-Math.PI / 2} fontSize={0.45} color="#968ca8">
        Welcome Lobby / Hallway
      </Text>
      <Text position={[6, 0.12, 1.5]} rotation-x={-Math.PI / 2} fontSize={0.45} color="#968ca8">
        Storage Room
      </Text>
      <Text position={[6, 0.12, -6]} rotation-x={-Math.PI / 2} fontSize={0.45} color="#968ca8">
        Seminar Room
      </Text>

      {/* Exterior walls */}
      <ArchitecturalWall p={[-10, 1.75, 0]} a={[0.25, 3.5, 16]} color="#dad5e8" />
      <ArchitecturalWall p={[12, 1.75, 0]} a={[0.25, 3.5, 16]} color="#dad5e8" />
      <ArchitecturalWall p={[1, 1.75, -8]} a={[22, 3.5, 0.25]} color="#dad5e8" />
      <ArchitecturalWall p={[1, 1.75, 8]} a={[22, 3.5, 0.25]} hide={cutaway} color="#dad5e8" />

      {/* Interior Partition walls */}
      {/* Corridor dividing wall North */}
      <ArchitecturalWall p={[0, 1.75, 4]} a={[0.2, 3.5, 8]} color="#ece8f6" />
      {/* Corridor dividing wall South */}
      <ArchitecturalWall p={[0, 1.75, -5.5]} a={[0.2, 3.5, 5]} color="#ece8f6" />
      {/* Storage south partition */}
      <ArchitecturalWall p={[6.5, 1.75, 4]} a={[11, 3.5, 0.18]} hide={cutaway} color="#ece8f6" />
      {/* Partition between Storage and Seminar */}
      <ArchitecturalWall p={[6.5, 1.75, -4]} a={[11, 3.5, 0.18]} color="#ece8f6" />

      {/* Doors providing realistic architectural circulation */}
      <ArchitecturalDoor p={[0, 0, 0]} label="Storage Door" />
      <ArchitecturalDoor p={[0, 0, -6]} label="Seminar Door" />
      <ArchitecturalDoor p={[-10, 0, 0]} label="Main Entry" />

      {/* Interior Furniture */}
      {options.furniture && (
        <>
          {/* Storage Room Shelving Racks */}
          <ShelfUnit p={[4.2, 0, 1.8]} />
          <ShelfUnit p={[8.5, 0, 1.8]} />
          {/* Seminar Room Desks & Podium */}
          <SeminarDesk p={[4.5, 0, -6.5]} />
          <SeminarDesk p={[7.5, 0, -6.5]} />
        </>
      )}

      {/* Wi-Fi Mesh Layer */}
      <MeshLayer
        nodes={shownNodes}
        options={options}
        selected={selected}
        mode="interior"
        onSelectNode={id => onSelectNode?.(id)}
      />

      {/* Wi-Fi Propagation Heatmap Layer */}
      {heatmap && coverage && (
        <HeatmapLayer
          cells={coverage}
          localCells={localCoverage}
          opacity={heatmapOpacity}
        />
      )}

      {/* Human Agents */}
      <AgentsLayer
        agents={agents}
        selectedAgentId={selectedAgentId}
        showTrails={showTrails}
        onSelectAgent={onSelectAgent}
      />
    </group>
  )
}

function SensingExperienceScene({
  agents,
  coverage,
  localCoverage,
  heatmap,
  heatmapOpacity,
  nodes,
  selectedAgentId,
  selectedApId,
  showTrails,
  onSelectAgent,
  onSelectNode,
  options,
  selected,
  mode,
  onSelectBuilding,
  onSelectRoom
}: Props) {
  const shownNodes = nodes.filter(node => node.scope === 'building' || node.scope === 'campus')
  const trackedAgent = agents?.find(agent => agent.id === selectedAgentId) ?? agents?.[0]

  return (
    <group>
      <Ground />
      <mesh position={[1, 0.01, 0]} receiveShadow>
        <boxGeometry args={[22.5, 0.18, 16.5]} />
        <meshStandardMaterial color="#e4dfea" roughness={0.7} />
      </mesh>

      <ArchitecturalWall p={[-10, 1.75, 0]} a={[0.25, 3.5, 16]} color="#dad5e8" />
      <ArchitecturalWall p={[12, 1.75, 0]} a={[0.25, 3.5, 16]} color="#dad5e8" />
      <ArchitecturalWall p={[1, 1.75, -8]} a={[22, 3.5, 0.25]} color="#dad5e8" />
      <ArchitecturalWall p={[1, 1.75, 8]} a={[22, 3.5, 0.25]} color="#dad5e8" />
      <ArchitecturalWall p={[0, 1.75, 4]} a={[0.2, 3.5, 8]} color="#ece8f6" />
      <ArchitecturalWall p={[0, 1.75, -5.5]} a={[0.2, 3.5, 5]} color="#ece8f6" />
      <ArchitecturalWall p={[6.5, 1.75, 4]} a={[11, 3.5, 0.18]} color="#ece8f6" />
      <ArchitecturalWall p={[6.5, 1.75, -4]} a={[11, 3.5, 0.18]} color="#ece8f6" />

      <ArchitecturalDoor p={[0, 0, 0]} label="Storage Door" />
      <ArchitecturalDoor p={[0, 0, -6]} label="Seminar Door" />
      <ArchitecturalDoor p={[-10, 0, 0]} label="Main Entry" />

      {options.furniture && (
        <>
          <ShelfUnit p={[4.2, 0, 1.8]} />
          <ShelfUnit p={[8.5, 0, 1.8]} />
          <SeminarDesk p={[4.5, 0, -6.5]} />
          <SeminarDesk p={[7.5, 0, -6.5]} />
        </>
      )}

      <MeshLayer
        nodes={shownNodes}
        options={{ ...options, visible: true, links: true, labels: true, coverageEffects: true }}
        selected={selectedApId ?? selected}
        mode={mode}
        onSelectNode={id => onSelectNode?.(id)}
      />

      {heatmap && coverage && (
        <HeatmapLayer
          cells={coverage}
          localCells={localCoverage}
          opacity={heatmapOpacity}
        />
      )}

      {trackedAgent && (
        <group>
          <mesh position={[trackedAgent.x, 0.02, trackedAgent.z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[1.3, 1.9, 32]} />
            <meshBasicMaterial color="#d6b4ff" transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <SpatialActivityLayer
            agent={trackedAgent}
            ap={nodes.find(node => node.id === selectedApId) ?? nodes.find(node => node.scope === 'building')}
            visible={Boolean(heatmap)}
          />
          <AgentsLayer
            agents={[trackedAgent]}
            selectedAgentId={selectedAgentId}
            showTrails={showTrails}
            onSelectAgent={id => onSelectAgent?.(id)}
          />
        </group>
      )}

      <Billboard position={[0, 3.8, 0]}>
        <Text fontSize={0.42} color="#4d2d8f" anchorX="center" anchorY="middle">
          SPATIAL ACTIVITY
        </Text>
      </Billboard>
    </group>
  )
}

function SceneContent(props: Props) {
  const inside = props.mode === 'interior' || props.viewPreset === 'sensing'
  const isSensing = props.viewPreset === 'sensing'

  return (
    <>
      <color attach="background" args={['#dfe8ef']} />
      <hemisphereLight intensity={1.55} groundColor="#aebaa7" />
      <directionalLight
        position={[-18, 32, 24]}
        intensity={2.25}
        castShadow
        shadow-mapSize={[1536, 1536]}
      />
      <ambientLight intensity={0.25} />

      {isSensing ? <SensingExperienceScene {...props} /> : inside ? <InteriorScene {...props} /> : <CampusScene {...props} />}

      <OrbitControls
        makeDefault
        target={inside ? [1, 0.8, 0] : [-1, 2, 0]}
        minDistance={inside ? 2.5 : 28}
        maxDistance={inside ? 65 : 115}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.05}
        enablePan
      />
    </>
  )
}

export default function Scene(props: Props) {
  const [cameraKey, setCameraKey] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))
  const containerRef = useRef<HTMLDivElement>(null)
  const presets: { id: SceneViewPreset; label: string }[] = [
    { id: 'campus', label: 'Campus' },
    { id: 'wifi', label: 'Wi-Fi Mesh' },
    { id: 'propagation', label: 'Propagation' },
    { id: 'movement', label: 'Human Movement' },
    { id: 'sensing', label: 'Sensing' }
  ]

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void (containerRef.current?.parentElement ?? document.documentElement).requestFullscreen()
    }
  }

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  return (
    <div className="scene-canvas-shell" ref={containerRef}>
      <Canvas
        key={cameraKey}
        shadows
        gl={{ antialias: true }}
        dpr={[1, 1.5]}
        camera={{
          position: props.mode === 'campus' ? [54, 33, 49] : [16, 14, 16],
          fov: props.mode === 'campus' ? 42 : 46
        }}
      >
        <SceneContent {...props} />
      </Canvas>

      <div className="scene-overlay-toolbar">
        <div className="scene-view-presets" aria-label="3D scene view">
          {presets.map(preset => (
            <button
              key={preset.id}
              className={props.viewPreset === preset.id ? 'active' : ''}
              onClick={() => props.onViewPresetChange?.(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="scene-camera-actions">
          <button onClick={() => setCameraKey(key => key + 1)} title="Reset orbit camera">
            Reset Camera
          </button>
          <button onClick={toggleFullscreen}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {props.viewPreset === 'wifi' && props.selectedApId && (() => {
        const selectedNode = props.nodes.find(node => node.id === props.selectedApId)
        if (!selectedNode) return null
        return (
          <div className="scene-ap-readout">
            <span className="scene-ap-readout-dot" />
            <div>
              <strong>{selectedNode.id}</strong>
              <span>{selectedNode.name} · {selectedNode.band} · {selectedNode.active ? 'Active' : 'Offline'}</span>
              <small>Location [{selectedNode.position.join(', ')}]</small>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
