import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import { Bone, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { explode, frameAt, handAt } from '../engine/pose'
import { assembly, useStore } from '../store'

// Rigged hand: @webxr-input-profiles/assets generic-hand (MIT), see public/models/hand/LICENSE.md.
// Joints follow the WebXR hand convention: each joint's -Z runs along the bone, +Y is the back of the hand.
const URLS = { left: '/models/hand/left.glb', right: '/models/hand/right.glb' }
const MM = 0.001
const PALM_FROM_WRIST = 0.06 // m along -Z from the wrist to the palm centre

type PoseName = 'flat' | 'grip' | 'pinch'
// Joint chains from knuckle to tip. The rig's joints are siblings (no hierarchy), so we chain them ourselves.
const CHAINS = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...['index', 'middle', 'ring', 'pinky'].map((f) => [
    `${f}-finger-phalanx-proximal`,
    `${f}-finger-phalanx-intermediate`,
    `${f}-finger-phalanx-distal`,
    `${f}-finger-tip`,
  ]),
]
// Curl per finger (thumb, index, middle, ring, pinky), 0 = straight, 1 = fist.
const POSES: Record<PoseName, number[]> = {
  flat: [0.05, 0.05, 0.05, 0.05, 0.05],
  grip: [0.45, 0.6, 0.65, 0.7, 0.75],
  pinch: [0.55, 0.45, 0.85, 0.9, 0.95],
}
const MAX_CURL = [70, 85, 60] // degrees at each bending joint of a chain
const THUMB_SCALE = 0.6

const X = new Vector3(1, 0, 0)

interface Chain {
  bones: Bone[]
  restPos: Vector3[]
  restQ: Quaternion[]
}

/** Forward kinematics: bend each joint about its own X (toward the palm) and carry the rest of the finger along. */
function bendChain(c: Chain, curl: number, scale: number) {
  const d = new Quaternion() // accumulated rotation, in the shared parent space
  const pos = c.restPos[0].clone()
  for (let k = 0; k < c.bones.length; k++) {
    if (k > 0) pos.add(c.restPos[k].clone().sub(c.restPos[k - 1]).applyQuaternion(d))
    const angle = k < MAX_CURL.length ? -curl * MAX_CURL[k] * scale * (Math.PI / 180) : 0
    const bend = c.restQ[k].clone().multiply(new Quaternion().setFromAxisAngle(X, angle)).multiply(c.restQ[k].clone().invert())
    d.multiply(bend)
    c.bones[k].position.copy(pos)
    c.bones[k].quaternion.copy(d).multiply(c.restQ[k])
  }
}

export function Hand({ side }: { side: 'left' | 'right' }) {
  const { scene } = useGLTF(URLS[side])
  const root = useRef<Group>(null)
  const curl = useRef<number[]>(POSES.grip.slice())

  // Re-centre the model so its frame is the palm: fingers -Z, palm -Y.
  const { model, chains } = useMemo(() => {
    // SkeletonUtils.clone rebinds the skinned mesh to the cloned bones (Object3D.clone does not).
    const model = cloneSkinned(scene)
    model.updateMatrixWorld(true)
    const wrist = model.getObjectByName('wrist')!
    const toPalm = new Matrix4().makeTranslation(0, 0, PALM_FROM_WRIST).multiply(wrist.matrixWorld.clone().invert())
    toPalm.decompose(model.position, model.quaternion, model.scale)

    model.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const mesh = o as Mesh
        mesh.material = new MeshStandardMaterial({ color: '#efd5bf', roughness: 0.75 })
        mesh.frustumCulled = false
      }
    })

    const chains: Chain[] = CHAINS.map((names) => {
      const bones = names.map((n) => model.getObjectByName(n) as Bone)
      return { bones, restPos: bones.map((b) => b.position.clone()), restQ: bones.map((b) => b.quaternion.clone()) }
    })
    return { model, chains }
  }, [scene])

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    const st = useStore.getState()
    const frame = explode(frameAt(assembly, st.step, st.t), assembly.steps[st.step].active, st.exploded ? 1 : 0)
    const h = handAt(assembly, st.step, st.t, frame, side)
    // Leave once the step's action is done, like the arrows.
    g.visible = !!h && !st.exploded && st.t < 0.98
    if (!h) return
    g.position.copy(h.p).multiplyScalar(MM)
    g.quaternion.copy(h.q)

    // Ease finger curl toward the target pose.
    const target = POSES[h.pose]
    const k = Math.min(1, dt * 8)
    for (let i = 0; i < 5; i++) curl.current[i] += (target[i] - curl.current[i]) * k
    chains.forEach((c, i) => bendChain(c, curl.current[i], i === 0 ? THUMB_SCALE : 1))
  })

  return (
    <group ref={root} visible={false}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(URLS.left)
useGLTF.preload(URLS.right)
