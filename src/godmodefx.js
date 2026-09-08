import * as THREE from 'three'
import { tune } from './tune.js'
import { PALETTE } from './style.js'

// Translucent bubble-shield aura for the human while godmode is on. Follows the
// player mesh each frame; hidden when the cheat is off or the unit is gone.

const BUBBLE_N = 20
const SHIELD_R = 1.38

export function createGodmodeFx(scene) {
	const root = new THREE.Group()
	root.visible = false
	scene.add(root)

	const shell = new THREE.Mesh(
		new THREE.SphereGeometry(SHIELD_R, 28, 18),
		new THREE.MeshBasicMaterial({
			color: PALETTE.godmode,
			transparent: true,
			opacity: 0.11,
			depthWrite: false,
			side: THREE.DoubleSide,
		}),
	)
	root.add(shell)

	const lattice = new THREE.Mesh(
		new THREE.IcosahedronGeometry(SHIELD_R * 1.01, 2),
		new THREE.MeshBasicMaterial({
			color: PALETTE.godmodeGlow,
			wireframe: true,
			transparent: true,
			opacity: 0.28,
			depthWrite: false,
		}),
	)
	root.add(lattice)

	const innerGlow = new THREE.Mesh(
		new THREE.SphereGeometry(SHIELD_R * 0.72, 16, 12),
		new THREE.MeshBasicMaterial({
			color: PALETTE.teamA,
			transparent: true,
			opacity: 0.06,
			depthWrite: false,
			side: THREE.BackSide,
		}),
	)
	root.add(innerGlow)

	const bubbles = []
	for (let i = 0; i < BUBBLE_N; i++) {
		const r = 0.07 + (i % 5) * 0.015
		const mesh = new THREE.Mesh(
			new THREE.SphereGeometry(r, 10, 8),
			new THREE.MeshStandardMaterial({
				color: PALETTE.godmodeCore,
				transparent: true,
				opacity: 0.62,
				roughness: 0.15,
				metalness: 0.35,
				emissive: PALETTE.godmodeDeep,
				emissiveIntensity: 0.45,
			}),
		)
		mesh.castShadow = false
		root.add(mesh)
		const theta = (i / BUBBLE_N) * Math.PI * 2
		const phi = Math.acos(1 - (2 * (i + 0.5)) / BUBBLE_N)
		bubbles.push({
			mesh,
			orbitR: SHIELD_R * (0.82 + (i % 3) * 0.08),
			theta,
			phi,
			speed: 0.45 + (i % 7) * 0.12,
			bob: 0.12 + (i % 4) * 0.04,
			phase: i * 1.7,
		})
	}

	let time = 0
	const _center = new THREE.Vector3()

	function update(dt, unit) {
		const active = tune.cheats.godmode && unit?.alive
		root.visible = active
		if (!active) return

		time += dt
		const p = unit.mesh.position
		const { halfHeight } = tune.player
		_center.set(p.x, p.y + halfHeight * 0.15, p.z)
		root.position.copy(_center)

		const pulse = 1 + Math.sin(time * 2.8) * 0.035
		shell.scale.setScalar(pulse)
		shell.material.opacity = 0.09 + Math.sin(time * 3.5) * 0.025

		lattice.rotation.y = time * 0.55
		lattice.rotation.x = Math.sin(time * 0.35) * 0.18
		lattice.rotation.z = Math.cos(time * 0.28) * 0.12
		lattice.material.opacity = 0.22 + Math.sin(time * 4) * 0.08

		innerGlow.scale.setScalar(0.95 + Math.sin(time * 2.2) * 0.05)

		for (const b of bubbles) {
			const ang = time * b.speed + b.phase
			const orbitT = b.theta + ang * 0.7
			const orbitP = b.phi + Math.sin(time * 1.6 + b.phase) * 0.25
			const r = b.orbitR
			b.mesh.position.set(
				Math.sin(orbitP) * Math.cos(orbitT) * r,
				Math.cos(orbitP) * r * 0.85 + Math.sin(time * 3 + b.phase) * b.bob,
				Math.sin(orbitP) * Math.sin(orbitT) * r,
			)
			const s = 0.88 + Math.sin(time * 5 + b.phase) * 0.14
			b.mesh.scale.setScalar(s)
		}
	}

	function dispose() {
		scene.remove(root)
		shell.geometry.dispose()
		shell.material.dispose()
		lattice.geometry.dispose()
		lattice.material.dispose()
		innerGlow.geometry.dispose()
		innerGlow.material.dispose()
		for (const b of bubbles) {
			b.mesh.geometry.dispose()
			b.mesh.material.dispose()
		}
	}

	return { update, dispose }
}
