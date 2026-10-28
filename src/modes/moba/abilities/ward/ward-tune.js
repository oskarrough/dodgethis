export default {
	castPoint: 0,
	cooldown: 12,
	range: 10,
	radius: 0.8,
	shield: 500,
	duration: 8,
	bot: { saveHp: 0.35, dangerRange: 5 },
	sound: {
		cast: { freq: 220, slideTo: 440, type: 'triangle', dur: 0.12, gain: 0.1 },
		impact: { freq: 880, slideTo: 660, type: 'triangle', dur: 0.3, gain: 0.12 },
	},
	juice: {
		cast: { count: 3, speed: 1.5, life: 0.2, size: 0.07 },
		impact: { count: 8, speed: 1.6, life: 0.35, size: 0.1 },
	},
	// The bubble on a warded ally (heroes/salvia/salvia-view.js).
	view: {
		color: '#3fa9ff',
		radius: 0.95,
		height: 0.95,
		opacity: 0.8,
		grow: 0.25,
		flash: 0.18,
		// The bubble shrinks to this share of its size as the shield is spent, and flickers over its last seconds.
		wane: 0.14,
		warn: { last: 1.5, rate: 0.5, depth: 0.5 },
		// It forms with a ground sigil and a stroke from her hand to the ally.
		form: {
			spokes: { count: 8, from: 0.8, to: 2.2, inner: 0.5, width: 0.2, life: 0.3 },
			ring: { from: 0.6, to: 1.7, life: 0.35, width: 0.08, opacity: 0.8 },
			streak: { width: 0.4, life: 0.18 },
		},
		// A hit it soaks: a short burst at the feet, scaled by the share of the shield it took, at most once per gap.
		soak: { count: 6, to: 1.5, life: 0.2, gap: 0.12 },
		// The thin ring at the feet runs down with the time left.
		timer: { pad: 0.38, width: 0.06, opacity: 0.55 },
		// Broken by damage: the shell bursts and strokes fly. Run out on time: it folds quietly in.
		pop: {
			life: 0.35,
			to: 1.9,
			spokes: { count: 10, from: 0.8, to: 2.5, inner: 0.5, width: 0.22, life: 0.3 },
		},
		fade: { to: 0.7, life: 0.25, opacity: 0.6 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'ward.view.grow': 's',
	'ward.view.flash': 's',
	'ward.view.pop.to': 'multiplier',
	'ward.view.wane': 'fraction',
	'ward.view.warn.last': 's',
	'ward.view.warn.rate': 's',
	'ward.view.warn.depth': 'fraction',
	'ward.view.form.spokes.inner': 'fraction',
	'ward.view.form.spokes.count': 'count',
	'ward.view.soak.count': 'count',
	'ward.view.soak.gap': 's',
	'ward.view.pop.spokes.inner': 'fraction',
	'ward.view.fade.to': 'multiplier',
}
