import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';

function Diamond() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += 0.003;
    meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
  });

  // Build a brilliant-cut diamond geometry
  const geometry = new THREE.BufferGeometry();

  // Simplified brilliant cut: crown (top) + pavilion (bottom)
  const vertices: number[] = [];
  const crownHeight = 0.35;
  const pavilionDepth = 0.7;
  const girdleRadius = 1;
  const tableRadius = 0.55;
  const n = 16; // facets around

  // Build faces
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;

    const gx1 = Math.cos(a1) * girdleRadius;
    const gz1 = Math.sin(a1) * girdleRadius;
    const gx2 = Math.cos(a2) * girdleRadius;
    const gz2 = Math.sin(a2) * girdleRadius;

    const tx1 = Math.cos(a1) * tableRadius;
    const tz1 = Math.sin(a1) * tableRadius;
    const tx2 = Math.cos(a2) * tableRadius;
    const tz2 = Math.sin(a2) * tableRadius;

    // Crown star facets (table to girdle)
    vertices.push(tx1, crownHeight, tz1, tx2, crownHeight, tz2, gx1, 0, gz1);
    vertices.push(tx2, crownHeight, tz2, gx2, 0, gz2, gx1, 0, gz1);

    // Pavilion facets (girdle to culet)
    vertices.push(gx1, 0, gz1, gx2, 0, gz2, 0, -pavilionDepth, 0);

    // Table face (top)
    vertices.push(0, crownHeight, 0, tx2, crownHeight, tz2, tx1, crownHeight, tz1);
  }

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();

  return (
    <mesh ref={meshRef} geometry={geometry} scale={1.2}>
      <MeshTransmissionMaterial
        backside
        samples={8}
        thickness={0.5}
        chromaticAberration={0.3}
        anisotropy={0.3}
        distortion={0.2}
        distortionScale={0.3}
        temporalDistortion={0.1}
        ior={2.42}
        color="#ffffff"
        roughness={0}
      />
    </mesh>
  );
}

export default function DiamondScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.5, 3.5], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.4} />
      <spotLight position={[5, 5, 5]} intensity={1.5} angle={0.3} penumbra={1} />
      <pointLight position={[-3, -1, 2]} intensity={0.5} color="#D4A94C" />
      <Diamond />
      <Environment preset="sunset" />
    </Canvas>
  );
}
