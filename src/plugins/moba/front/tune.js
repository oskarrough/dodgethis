// Timing, motion and synth are live; authored world geometry stays in backdrop.js.
export const tune = {
	skyFade: 0.8,
	loading: {
		uiFadeEnd: 0.28,
		arcHeight: 50,
		riseEnd: 0.35,
		pitchEnd: 0.75,
		fitMargin: 1.18,
		minAspect: 0.1,
		farMargin: 100,
		duration: 2.4,
		// After shader readiness and the reveal you look at the lane for `preview` s while the
		// camera creeps `creep` of the way into the descent, then dives for `duration` s.
		preview: 3,
		creep: 0.06,
		reveal: 0.7,
		height: 22,
		back: 110,
		fov: 55,
		targetX: 0,
		targetY: 8,
		line: 0.65,
		pastel: 0.65,
		skip: { freq: 520, slideTo: 740, dur: 0.12, gain: 0.035, type: 'sine' },
		arrival: { freq: 110, slideTo: 55, dur: 0.4, gain: 0.06, type: 'sine' },
		// The crane takes shot.apex.time: the lobby camera rises `rise` m and tilts to `pitch`°
		// (negative looks up). The map name letters in from `nameAt` of the way, `letter` s apart.
		// The canvas fades no lower than `floor`.
		crane: { rise: 14, pitch: -12, nameAt: 0.3, letter: 0.03, letterTime: 0.35, floor: 0.02 },
		drop: { freq: 660, slideTo: 330, dur: 0.5, gain: 0.03, type: 'triangle' },
		// The cloud reveal. Cloud rolls in from the rim
		// from `from` of the crane, holds while the lane builds, and from the start of the
		// reveal parts around your hero over `part` s, out-eased by the power `ease` (it may run into the preview; the timing
		// is unchanged). Drawn at `resolution` (0–1) of device pixels and upscaled, on purpose:
		// soft and cheap. `scale` is puffs per screen height, `warp` the swirl; `rough` and
		// `soft` (screen heights) how ragged and how feathered the edge runs. As it parts the
		// field swells by `zoom`; it slides `lift` as the crane rises and drifts `drift` per s.
		// `bloom` lights the soft edge. `color` is light and shade per map.
		clouds: {
			from: 0.1,
			part: 2.2,
			ease: 2,
			resolution: 0.25,
			scale: 2.2,
			warp: 0.7,
			rough: 0.35,
			soft: 0.1,
			zoom: 0.9,
			lift: 1.2,
			drift: [0.04, 0.015],
			bloom: 0.15,
			color: { overthrow: ['#fffcf7', '#f6dcd3'], flagfall: ['#f5f1ff', '#b9a8e2'] },
		},
	},
	level: { growth: 0.04, cap: 10 },
	volley: {
		damage: 320,
		range: 30,
		speed: 30,
		radius: 0.8,
		castPoint: 0.5,
		cooldown: 60,
		unlock: 10,
	},
	// The Numbers sheet's reference distance, not an animated portrait.
	preview: { distance: 8 },
	parallax: { depth: 0.009, response: 0.18, settle: 0.05 },
	// The splash plate (`public/splash/plate-<width>.webp`): `focus` is the point, in % of the
	// plate, that stays put when the screen's aspect crops it.
	plate: { src: '/splash/plate', widths: [960, 1672], focus: [50, 62] },
	// Two mist bands drift across the cloud sea, far then near, one loop every `period` s.
	mist: { period: [190, 110], opacity: 0.55 },
	// Backdrop shots in the 1440 × 900 frame: `lift` raises it (negative tilts up to the sky),
	// `zoom` scales on the focus point and `time` is the move into the shot. `depth`
	// multiplies both for the plate; `ease` is the in-out power every front move shares.
	shot: {
		ease: 3,
		depth: [1],
		splash: { lift: 0, zoom: 1, time: 0.7 },
		lobby: { lift: 0, zoom: 1.15, time: 0.7 }, // no lift: the plate keeps covering the frame
		apex: { lift: -480, zoom: 1, time: 0.6 },
	},
	// Dusk behind the lobby floor so the pale floor and its drop read: a violet wash over the
	// plate at `amount` opacity, blended in as the lobby flies in, and back.
	dusk: { color: '#29285a', amount: 0.5 },
	// The lobby's chrome slides `shift` px between its place and its own edge over `land` s:
	// in one piece `stagger` s after another, out together as the lane fades; the top-right
	// mute and fullscreen chips come `corner` s ahead of their turn.
	chrome: { shift: 72, stagger: 0.06, land: 0.3, corner: 0.2 },
	back: { freq: 174.61, slideTo: 130.81, dur: 0.25, gain: 0.055 },
	// Menu tiles: the response is a spring, not a fade. `drop` is the flight out under the lobby
	// shot, title first and each tile `stagger` s after the last (the picked one leaves last);
	// `leave` the flight in screen widths and heights per element, the cards shrinking to `cardScale`;
	// `pop` the spring back in as the splash shot lands. A card lifts on hover in `hover` s and
	// settles back in the slower `snap` s.
	// The title sits still for `calm` ms (min, max), then one letter dodges or the Ball glints.
	title: { calm: [3500, 9000] },
	// Each map's illustration, `public/splash/<map>-<width>.webp`; `wash` is the cream veil on
	// the art of a tile you're not on.
	tile: {
		art: { overthrow: '/splash/overthrow', flagfall: '/splash/flagfall' },
		artWidths: [480, 960],
		wash: 0.22,
		outlinePadding: 5,
		outlineWidth: 1.5,
		snap: 0.12,
		hover: 0.05,
		press: 0.06,
		scale: 1.05,
		lift: 8,
		tilt: 1,
		drop: 0.2,
		stagger: 0.05,
		leave: { title: [-0.7, -0.7], card: [0, 1], bonus: [0, 1], cardScale: 0.4 },
		pop: 0.35,
	},
	// The card skin every front screen shares. `style` picks one ('?skin=' overrides it):
	// 'painted' the art thread's paper, ink frame and title wash (`public/splash/`), wash bleed;
	// 'wash' deckled paper, a watercolour wash behind the title, focus bleeds the wash out;
	// 'ink' deckled paper and a wobbling pen line, focus is a thick painted ring;
	// 'stone' chamfered cream card, ink band, cream ring (the first pass).
	// Stone numbers (px): ink `line`, hard `shadow` offset, `ring`, corner `cut`s (tl, tr, br, bl).
	// `paint`: noise `frequency` (per px) and displacement `scale` (px) for the paper's edge,
	// the pen line and the washes; a wash also softens, pools pigment and darkens a `rim`.
	// Applied when the splash is built.
	skin: {
		style: 'painted',
		line: 3,
		shadow: 6,
		ring: 5,
		cut: [18, 7, 15, 5],
		paint: {
			deckle: { frequency: 0.05, scale: 9 },
			pen: { frequency: 0.009, scale: 9 },
			// The focus ring's dry brush: bristle `grain` (per px) and how `dry` (0–1) it runs.
			brush: { grain: 0.12, dry: 0.35 },
			wash: { frequency: 0.02, scale: 20, soften: 1.4, pooling: 2, rim: 3 },
			// The wash that bleeds out behind the card you're on.
			bloom: { frequency: 0.008, scale: 60, soften: 4, pooling: 2.2, rim: 5 },
		},
		// Each map's wash: apricot by day, orchid by night, never a team hue.
		wash: { overthrow: '#f0b48a', flagfall: '#b99ad8', bonus: '#e9c9b0', hero: '#f0b48a' },
		// Painted materials per map light: frame and title wash, by day or night.
		light: { overthrow: 'day', flagfall: 'night', bonus: 'day' },
	},
	move: { freq: 880, slideTo: 1175, dur: 0.045, gain: 0.03, type: 'square' },
	enter: { frequencies: [392, 587.33], gap: 0.06, dur: 0.3, gain: 0.05, type: 'triangle' },
	deny: { freq: 116.54, slideTo: 98, dur: 0.16, gain: 0.06, type: 'square', shake: 0.24 },
}
