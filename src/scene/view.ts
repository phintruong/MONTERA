import type { Vector3 } from 'three'

/** Lets the DOM overlay drive the camera (the controls live inside the Canvas; CameraRig fills these in). */
export const view = {
  reset: () => {},
  focus: (_p: Vector3) => {},
}
