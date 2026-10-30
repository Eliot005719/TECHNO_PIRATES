import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { campusBuildings, type Building } from '../data/visual-geometry'
import type { WifiNode } from '../data/wifi-mesh'
import type { CoverageCell } from '../simulation/propagation/propagationTypes'
import type { Agent } from '../simulation/movement/movementEngine'

export type Mode = 'campus' | 'interior'

export type MeshOptions = {
  visible: boolean
  labels: boolean
  links: boolean
  scope: 'campus' | 'building'
  ceilings: boolean
  furniture: boolean
}

type Props = {
  mode: Mode
  selected: string
  cutaway: boolean
  options: MeshOptions
  nodes: WifiNode[]
  coverage?: CoverageCell[]
  heatmap?: boolean
  agents?: Agent[]
  selectedAgentId?: string
  showTrails?: boolean
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
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[56, 44]} />
        <meshStandardMaterial color="#f0eff6" roughness={0.8} />
      </mesh>
      <gridHelper args={[56, 28, '#cdc5e3', '#e8e4f3']} position={[0, 0, 0]} />
    </>
  )
}

function Tree({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <sphereGeometry args={[0.85, 10, 8]} />
        <meshStandardMaterial color="#88b588" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.8, 8]} />
        <meshStandardMaterial color="#6e5746" />
      </mesh>
    </group>
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

  return (
    <group
      position={b.position}
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
      {/* Building massing */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={b.size} />
        <meshStandardMaterial
          color={isSelected ? '#5430bb' : hovered ? '#7457cb' : b.color}
          roughness={0.4}
        />
      </mesh>

      {/* Roof trim */}
      <mesh position={[0, b.size[1] / 2 + 0.04, 0]}>
        <boxGeometry args={[b.size[0] + 0.22, 0.08, b.size[2] + 0.22]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>

      {/* Floating ID badge */}
      <Text
        position={[0, b.size[1] / 2 + 0.45, 0]}
        fontSize={0.5}
        color={isSelected ? '#4820a8' : '#231842'}
        anchorX="center"
        anchorY="middle"
      >
        {b.id}
      </Text>

      {/* Entrance door marker */}
      <mesh position={[0, 0.5, b.size[2] / 2 + 0.02]}>
        <boxGeometry args={[1.2, 1.0, 0.08]} />
        <meshStandardMaterial
          color="#f6d07c"
          emissive="#d59d30"
          emissiveIntensity={isSelected ? 0.35 : 0.15}
        />
      </mesh>

      {/* Selection outline indicator */}
      {isSelected && (
        <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[b.size[0] * 0.65, b.size[0] * 0.72, 32]} />
          <meshBasicMaterial color="#7f52e8" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  )
}

function NodeItem({
  node,
  isSelected,
  showLabel,
  onSelect
}: {
  node: WifiNode
  isSelected: boolean
  showLabel: boolean
  onSelect: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <group
      position={node.position}
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
      {/* Access Point puck cylinder */}
      <mesh>
        <cylinderGeometry args={[0.26, 0.26, 0.14, 20]} />
        <meshStandardMaterial
          color={node.active ? (isSelected ? '#e8c9ff' : '#7045cc') : '#8d8794'}
          emissive={node.active ? (isSelected ? '#a875ff' : '#6f42cc') : '#000000'}
          emissiveIntensity={node.active ? (isSelected ? 2.2 : 0.9) : 0}
        />
      </mesh>

      {/* RF radiation ring */}
      {node.active && (
        <mesh rotation-x={Math.PI / 2} position={[0, -0.02, 0]}>
          <ringGeometry args={[0.45, 0.52, 28]} />
          <meshBasicMaterial
            color={node.band === '6 GHz' ? '#8b5cf6' : '#3b82f6'}
            transparent
            opacity={isSelected ? 0.85 : 0.45}
          />
        </mesh>
      )}

      {/* Node label */}
      {showLabel && (
        <group position={[0, 0.45, 0]}>
          <Text
            fontSize={0.25}
            color={isSelected ? '#512ba5' : '#39255a'}
            anchorX="center"
            anchorY="middle"
          >
            {node.id}
          </Text>
        </group>
      )}
    </group>
  )
}

function MeshLinks({ nodes }: { nodes: WifiNode[] }) {
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
              args={[new Float32Array([...a.position, ...b.position]), 3]}
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
  onSelectNode
}: {
  nodes: WifiNode[]
  options: MeshOptions
  selected: string
  onSelectNode: (id: string) => void
}) {
  if (!options.visible) return null

  return (
    <group>
      {options.links && <MeshLinks nodes={nodes} />}
      {nodes.map(n => (
        <NodeItem
          key={n.id}
          node={n}
          isSelected={selected === n.id}
          showLabel={options.labels}
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

function HeatmapLayer({ cells }: { cells: CoverageCell[] }) {
  return (
    <group>
      {cells.map((c, i) => (
        <mesh key={i} position={[c.x, 0.12, c.z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.78, 0.78]} />
          <meshBasicMaterial
            color={heatColor(c.rssi)}
            transparent
            opacity={0.44}
            depthWrite={false}
          />
        </mesh>
      ))}
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
        position={[agent.x, 0, agent.z]}
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
  onSelectNode
}: Props) {
  const shownNodes = options.scope === 'campus' ? nodes : nodes.filter(n => n.scope === 'building')

  return (
    <group>
      <Ground />

      {/* Campus spine pedestrian plaza */}
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[46, 2.8]} />
        <meshStandardMaterial color="#dcd9e6" roughness={0.7} />
      </mesh>

      {/* Priority Buildings */}
      {campusBuildings.map(b => (
        <BuildingItem
          key={b.id}
          b={b}
          isSelected={selected === b.id}
          onSelect={id => onSelectBuilding?.(id)}
        />
      ))}

      {/* Landscape trees */}
      {[
        [-20, 0, -12],
        [-18, 0, 10],
        [-11, 0, 13],
        [7, 0, 11],
        [18, 0, 9],
        [20, 0, -11],
        [5, 0, -13],
        [-3, 0, -12],
        [8, 0, -9]
      ].map((p, i) => (
        <Tree key={i} p={p as [number, number, number]} />
      ))}

      {/* Wi-Fi Mesh */}
      <MeshLayer
        nodes={shownNodes}
        options={options}
        selected={selected}
        onSelectNode={id => onSelectNode?.(id)}
      />
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
  heatmap,
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
        onSelectNode={id => onSelectNode?.(id)}
      />

      {/* Wi-Fi Propagation Heatmap Layer */}
      {heatmap && coverage && <HeatmapLayer cells={coverage} />}

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

function SceneContent(props: Props) {
  const inside = props.mode === 'interior'

  return (
    <>
      <color attach="background" args={['#f8f7fc']} />
      <hemisphereLight intensity={1.25} groundColor="#ded9ed" />
      <directionalLight
        position={[14, 18, 12]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      {inside ? <InteriorScene {...props} /> : <CampusScene {...props} />}

      <OrbitControls
        makeDefault
        target={inside ? [1, 0.8, 0] : [0, 0, 0]}
        minDistance={2.5}
        maxDistance={65}
        enablePan
      />
    </>
  )
}

export default function Scene(props: Props) {
  return (
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      dpr={[1, 1.5]}
      camera={{
        position: props.mode === 'campus' ? [28, 25, 32] : [16, 14, 16],
        fov: 46
      }}
    >
      <SceneContent {...props} />
    </Canvas>
  )
}
