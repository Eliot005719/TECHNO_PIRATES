import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { Agent } from '../../simulation/movement/movementEngine'
import type { WifiNode } from '../../data/wifi-mesh'

export function SpatialActivityLayer({
  agent,
  ap,
  visible = true
}: {
  agent?: Agent
  ap?: WifiNode
  visible?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const signalRef = useRef<THREE.Group>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!groupRef.current || !agent) return

    const baseX = agent.x
    const baseZ = agent.z
    groupRef.current.position.set(baseX, 0.04, baseZ)

    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.6) * 0.22
    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(pulse)
      const material = pulseRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.34 + (Math.sin(state.clock.elapsedTime * 4.4) + 1) * 0.18
    }
    if (haloRef.current) {
      haloRef.current.scale.setScalar(1.15 + (Math.sin(state.clock.elapsedTime * 2.8) + 1) * 0.45)
      const material = haloRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.18 + (Math.sin(state.clock.elapsedTime * 3.2) + 1) * 0.12
    }
    if (signalRef.current && ap) {
      const apPosition = new THREE.Vector3(...ap.position)
      const agentPosition = new THREE.Vector3(baseX, 0.12, baseZ)
      const toAgent = new THREE.Vector3().subVectors(agentPosition, apPosition)
      const mid = new THREE.Vector3().lerpVectors(apPosition, agentPosition, 0.5)
      signalRef.current.position.copy(mid)
      signalRef.current.lookAt(agentPosition)
      signalRef.current.rotation.x = -Math.PI / 2
      signalRef.current.scale.set(1, 1, toAgent.length() / 2.3)
    }
  })

  if (!visible || !agent) return null

  return (
    <group ref={groupRef}>
      <group ref={signalRef}>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.04, 0.04, 1, 10]} />
          <meshBasicMaterial color="#d9b8ff" transparent opacity={0.46} depthWrite={false} />
        </mesh>
      </group>

      <mesh ref={haloRef} rotation-x={-Math.PI / 2} position={[0, 0.08, 0]}>
        <ringGeometry args={[1.2, 2.1, 48]} />
        <meshBasicMaterial color="#c084fc" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh ref={pulseRef} rotation-x={-Math.PI / 2} position={[0, 0.1, 0]}>
        <circleGeometry args={[0.95, 48]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.15, 18, 18]} />
        <meshBasicMaterial color="#f5d0fe" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  )
}
