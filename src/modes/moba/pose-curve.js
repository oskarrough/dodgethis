// Curves for a hero view's animate() hook (heroes/<id>/<id>-view.js), pure functions of numbers the hook is already given.
// The hooks lean linearly with `progress` today, which reads as a slow tilt; these give a cast an anticipation (a quick
// coil, held taut) and a release a snap that overshoots and settles. Amounts are 0 at rest and 1 at the full pose.
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const easeOut = (x) => 1 - (1 - x) ** 3

// The coil while a cast point runs. `progress` is animate()'s 0..1 through the cast point; the body loads over the
// first `load` of it, overshoots by about `overshoot` and then holds at 1 until release.
export function poseWindup(progress, { load = 0.4, overshoot = 0.12 } = {}) {
	const p = clamp01(progress / Math.max(1e-6, load))
	return easeOut(p) + overshoot * Math.sin(Math.PI * p)
}

// The snap after release. `fire` and `settle` are animate()'s (fire runs 0 to 1 over the ability's snap, settle runs 1 to 0
// over its recover); the pose jumps out past its full amount by about `overshoot` and eases back to rest.
export function poseStrike(fire, settle, { overshoot = 0.25 } = {}) {
	return (easeOut(clamp01(fire)) + overshoot * Math.sin(Math.PI * clamp01(fire))) * clamp01(settle)
}
