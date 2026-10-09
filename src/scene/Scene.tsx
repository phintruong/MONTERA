import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, ContactShadows, Edges, Html, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Quaternion, Vector3 } from 'three'
import type { Part } from '../data/schema'
import { explode, frameAt } from '../engine/pose'
import { FOV, frameStep } from '../engine/framing'
import { assembly, useStore } from '../store'
import { view } from './view'

const MM = 0.001
// IKEA tokens (DESIGN.md)
const CANVAS = '#fffefb'
const INK = '#111111'
const BLUE = '#0058a3'
const YELLOW = '#ffdb00'
const BLUE_TINT = '#d6e6f4' // blue at ~15% on canvas: marks active mesh parts without hiding their shading

// Start where step 1 looks from: CameraControls ignores a setLookAt made before it is ready.
const START_CAMERA = frameStep(assembly, 0, 1.5).position.multiplyScalar(MM).toArray()

// Contact shadow sized to the product (and its laid-out parts), not one fixed 4 m patch.
const REACH = Math.max(
  ...assembly.instances.map((i) => {
    const [x, , z] = i.initial.pos
    return Math.hypot(x, z) + Math.max(...assembly.parts[i.part].size) / 2
  }),
)
const SHADOW_SCALE = Math.min(8, Math.max(1.5, REACH * MM * 2.4))
const SHADOW_FAR = Math.min(1.2, Math.max(0.4, SHADOW_SCALE * 0.25))
const labelPos = new Vector3()

export function Scene() {
  // Building big meshes and the first shader compile take a moment: cover the blank canvas until then.
  const [ready, setReady] = useState(false)
  return (
    <>
      <Canvas camera={{ fov: FOV, near: 0.01, far: 50, position: START_CAMERA }} dpr={[1, 2]}>
        <color attach="background" args={[CANVAS]} />
        <hemisphereLight args={['#ffffff', '#e8e4da', 1.5]} />
        <directionalLight position={[1.5, 3, 2]} intensity={1.4} />
        <directionalLight position={[-2, 1, -1]} intensity={0.4} />
        <ContactShadows
          position={[0, -0.004, 0]}
          opacity={0.16}
          scale={SHADOW_SCALE}
          blur={2.6}
          far={SHADOW_FAR}
          resolution={1024}
          color={INK}
        />
        <Parts onReady={() => setReady(true)} />
        <Arrows />
        <CameraRig />
      </Canvas>
      <PartLabels />
      <div
        className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-canvas text-lg font-bold transition-opacity duration-200 ${
          ready ? 'opacity-0' : 'opacity-100'
        }`}
        role="status"
        aria-hidden={ready}
      >
        <span className="h-1.5 w-12 animate-pulse rounded-full bg-yellow" />
        Preparing the 3D view…
      </div>
    </>
  )
}

function CameraRig() {
  const ref = useRef<CameraControls>(null)
  const step = useStore((s) => s.step)
  const replayNonce = useStore((s) => s.replayNonce)
  const record = useStore((s) => s.record)
  const userMoved = useRef(false)
  // Each step is framed for the canvas it's shown on (phone portrait, landscape, desktop), so
  // everything the step is about stays in view. Read the aspect at apply time, not as a
  // dependency: resizing (e.g. the phone sheet opening) mustn't reset the view.
  const size = useThree((s) => s.size)
  const aspect = useRef(1)
  useEffect(() => {
    aspect.current = size.width / Math.max(1, size.height)
  }, [size])

  useEffect(() => {
    const apply = () => {
      const { position: p, target: g } = frameStep(assembly, step, aspect.current)
      ref.current?.setLookAt(p.x * MM, p.y * MM, p.z * MM, g.x * MM, g.y * MM, g.z * MM, true)
    }
    apply()
    // On first mount the controls are not attached yet and drop the call; repeat next frame.
    const id = requestAnimationFrame(apply)
    view.reset = () => {
      apply()
      record('view_reset')
    }
    view.focus = (pt) => {
      ref.current?.setOrbitPoint(pt.x, pt.y, pt.z)
      record('view_focus')
    }
    return () => cancelAnimationFrame(id)
  }, [step, replayNonce, record])

  return (
    <CameraControls
      ref={ref}
      // Zoom towards the pointer, close enough to read a small part, far enough for big layouts.
      dollyToCursor
      minDistance={0.08}
      maxDistance={15}
      maxPolarAngle={Math.PI * 0.5}
      smoothTime={0.25}
      draggingSmoothTime={0.06}
      onStart={() => (userMoved.current = true)}
      onEnd={() => {
        if (userMoved.current) record('orbit')
        userMoved.current = false
      }}
    />
  )
}

function Parts({ onReady }: { onReady: () => void }) {
  const step = useStore((s) => s.step)
  const active = useMemo(() => new Set(assembly.steps[step].active), [step])
  const showFinished = assembly.steps[step].showFinishedFace
  const refs = useRef(new Map<string, Group>())
  const explodeAmt = useRef(0)
  const frames = useRef(0)

  useFrame(({ camera, size }, dt) => {
    const st = useStore.getState()
    // Hold step 1's animation until the view has actually drawn, so nobody misses its start.
    if (frames.current < 3) {
      if (++frames.current === 3) onReady()
    } else st.tick(Math.min(dt, 0.1))
    const target = st.exploded ? 1 : 0
    explodeAmt.current += (target - explodeAmt.current) * Math.min(1, dt * 6)
    const frame = explode(frameAt(assembly, st.step, st.t), assembly.steps[st.step].active, explodeAmt.current)
    for (const inst of assembly.instances) {
      const g = refs.current.get(inst.id)
      if (!g) continue
      const pl = frame.get(inst.id)
      g.visible = !!pl
      if (pl) {
        g.position.copy(pl.p).multiplyScalar(MM)
        g.quaternion.copy(pl.q)
      }
    }
    // Letter tags follow their parts' centres on screen while the part is active.
    const now = assembly.steps[st.step].active
    for (const inst of LABELLED) {
      const el = labelEls.get(inst.id)
      const pl = frame.get(inst.id)
      if (!el) continue
      const v = pl && now.includes(inst.id) ? labelPos.copy(pl.p).multiplyScalar(MM).project(camera) : null
      if (!v || v.z > 1) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'flex'
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })

  return (
    // Double-click a part to turn the view around it.
    <group
      onDoubleClick={(e) => {
        e.stopPropagation()
        view.focus(e.point)
      }}
    >
      {assembly.instances.map((inst) => (
        <group
          key={inst.id}
          ref={(g) => {
            if (g) refs.current.set(inst.id, g)
            else refs.current.delete(inst.id)
          }}
          visible={false}
        >
          <PartMesh part={assembly.parts[inst.part]} active={active.has(inst.id)} showFinished={showFinished} />
        </group>
      ))}
    </group>
  )
}

/**
 * Part letters from the instructions ("Join A and B"), as blue tags over the canvas. Plain DOM
 * positioned by Parts' frame loop: drei <Html> dropped the first of many labels under React 19.
 */
const labelEls = new Map<string, HTMLDivElement>()
const LABELLED = assembly.instances.filter((i) => i.label)

function PartLabels() {
  if (LABELLED.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {LABELLED.map((inst) => (
        <div
          key={inst.id}
          ref={(el) => {
            if (el) labelEls.set(inst.id, el)
            else labelEls.delete(inst.id)
          }}
          className="absolute top-0 left-0 hidden h-9 min-w-9 items-center justify-center rounded-full bg-blue px-2 text-lg font-bold text-white"
        >
          {inst.label}
        </div>
      ))}
    </div>
  )
}

/** A part with real geometry (imported products). Same line-drawing look as the boxes. */
function MeshPart({ part, active, edgeColor, edgeWidth }: { part: Part; active: boolean; edgeColor: string; edgeWidth: number }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute(
      'position',
      new Float32BufferAttribute(
        part.mesh!.positions.map((v) => v * MM),
        3,
      ),
    )
    g.setIndex(part.mesh!.indices)
    g.computeVertexNormals()
    return g
  }, [part])
  useEffect(() => () => geometry.dispose(), [geometry])
  // Precomputed outline (winding-independent); three's EdgesGeometry would draw face diagonals.
  const outline = useMemo(() => {
    const { positions: p, edges } = part.mesh!
    return edges.map((i) => [p[3 * i] * MM, p[3 * i + 1] * MM, p[3 * i + 2] * MM] as [number, number, number])
  }, [part])
  return (
    <group>
      <mesh geometry={geometry}>
        {/* Thin rails barely show a blue outline, so active mesh parts also get a pale blue body. */}
        <meshStandardMaterial
          color={active ? BLUE_TINT : part.color}
          roughness={1}
          side={DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {outline.length > 1 && <Line points={outline} segments color={edgeColor} lineWidth={edgeWidth} />}
    </group>
  )
}

/** Manual-style line drawing: flat white body, ink edges; active parts drawn in blue. */
function PartMesh({ part, active, showFinished }: { part: Part; active: boolean; showFinished: boolean }) {
  const [w, h, d] = part.size.map((v) => v * MM)
  const edgeColor = active ? BLUE : INK
  const edgeWidth = active ? 2.6 : 1.3

  if (part.shape === 'mesh') return <MeshPart part={part} active={active} edgeColor={edgeColor} edgeWidth={edgeWidth} />

  if (part.shape === 'screw' || part.shape === 'cylinder') {
    const screw = part.shape === 'screw'
    return (
      <group>
        <mesh>
          <cylinderGeometry args={[w / 2, w / 2, h, screw ? 12 : 24]} />
          <meshStandardMaterial color={part.color} metalness={screw ? 0.6 : 0} roughness={0.45} />
          <Edges color={edgeColor} lineWidth={edgeWidth} threshold={30} />
        </mesh>
        {screw &&
          Array.from({ length: 10 }, (_, i) => {
            // thread rings on both ends, plain shoulder in the middle
            const y = -h / 2 + (i < 5 ? i : i + 1) * (h / 11) + h / 22
            return (
              <mesh key={i} position-y={y} rotation-x={Math.PI / 2}>
                <torusGeometry args={[w / 2, w * 0.1, 6, 12]} />
                <meshBasicMaterial color={active ? BLUE : INK} />
              </mesh>
            )
          })}
      </group>
    )
  }

  return (
    <group>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={part.color} roughness={1} />
        <Edges color={edgeColor} lineWidth={edgeWidth} />
      </mesh>
      {part.finishedFace && <FinishedFace part={part} visible={showFinished} />}
    </group>
  )
}

const FACE_ROT: Record<string, [number, number, number]> = {
  '+y': [-Math.PI / 2, 0, 0],
  '-y': [Math.PI / 2, 0, 0],
  '+x': [0, Math.PI / 2, 0],
  '-x': [0, -Math.PI / 2, 0],
  '+z': [0, 0, 0],
  '-z': [0, Math.PI, 0],
}

// Kept mounted and toggled with `visible`: unmounting drei <Html> mid-render throws in React 19.
function FinishedFace({ part, visible }: { part: Part; visible: boolean }) {
  const face = part.finishedFace!
  const axis = 'xyz'.indexOf(face[1])
  const sign = face[0] === '+' ? 1 : -1
  const half = part.size.map((v) => (v * MM) / 2)
  const pos = new Vector3()
  pos.setComponent(axis, sign * (half[axis] + 0.0008))
  const [pw, ph] = axis === 0 ? [part.size[2], part.size[1]] : axis === 1 ? [part.size[0], part.size[2]] : [part.size[0], part.size[1]]
  const labelPos = pos.clone()
  labelPos.setComponent(axis, sign * (half[axis] + 0.02))
  return (
    <group visible={visible}>
      <mesh position={pos} rotation={FACE_ROT[face]}>
        <planeGeometry args={[pw * MM * 0.96, ph * MM * 0.96]} />
        <meshBasicMaterial color={YELLOW} transparent opacity={0.6} />
      </mesh>
      <Html position={labelPos} center zIndexRange={[10, 0]} style={{ display: visible ? 'block' : 'none' }}>
        <div className="pointer-events-none rounded-full bg-yellow px-3 py-1 text-sm font-bold whitespace-nowrap text-ink">
          {part.finishedLabel ?? 'Finished side'}
        </div>
      </Html>
    </group>
  )
}

function Arrows() {
  const step = useStore((s) => s.step)
  const group = useRef<Group>(null)
  const arrows = assembly.steps[step].arrows

  useFrame(({ clock }) => {
    if (!group.current) return
    const { t, exploded } = useStore.getState()
    group.current.position.y = Math.sin(clock.elapsedTime * 4) * 0.012
    group.current.visible = !exploded && t >= assembly.steps[step].arrowsAt && t < 0.98
  })

  return (
    <group ref={group}>
      {arrows.map((a, i) => (
        <Arrow key={`${step}-${i}`} from={new Vector3(...a.from).multiplyScalar(MM)} to={new Vector3(...a.to).multiplyScalar(MM)} />
      ))}
    </group>
  )
}

function Arrow({ from, to }: { from: Vector3; to: Vector3 }) {
  const dir = to.clone().sub(from)
  const len = dir.length()
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize())
  const head = Math.min(0.045, len * 0.5)
  return (
    <group position={from} quaternion={q}>
      <mesh position-y={(len - head) / 2}>
        <cylinderGeometry args={[0.007, 0.007, len - head, 12]} />
        <meshBasicMaterial color={BLUE} />
      </mesh>
      <mesh position-y={len - head / 2}>
        <coneGeometry args={[0.022, head, 20]} />
        <meshBasicMaterial color={BLUE} />
      </mesh>
    </group>
  )
}
