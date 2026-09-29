import { hex } from '../../../core/style.js'
import { tune } from './tune.js'
import { easePointer, projectFrame } from './geometry.js'

// Authored in one undistorted world; the phone crops the shot, never the figure.
const planes = [
	`<g fill="var(--front-cloud)" stroke="var(--front-ink)">
		<path d="M55 354 Q185 347 355 353 L453 358 Q240 363 94 360Z"/>
		<path d="M925 397 Q1088 389 1342 397 L1412 405 Q1153 405 960 402Z"/>
		<path d="M12 458 Q143 454 278 462 L341 469 Q175 468 46 466Z"/>
		<path d="M1045 306 Q1157 301 1268 306 L1329 312 L1097 312Z"/>
	</g>
	<circle cx="566" cy="555" r="184" fill="var(--front-planet)" stroke="var(--front-ink)"/>
	<path d="M405 645 Q447 689 518 714" fill="none" stroke="var(--front-planet-line)"/>
	<path d="M395 631 Q429 677 491 703" fill="none" stroke="var(--front-planet-line)"/>`,
	`<path fill="var(--front-far)" d="M0 732 L95 723 L133 685 L212 682 L232 631 L325 625 L355 655 L370 706 L450 724 L938 722 L989 680 L1022 626 L1090 622 L1124 659 L1142 714 L1440 731 V900 H0Z"/>
	<path fill="url(#vertical-1)" d="M325 625 L339 654 L349 699 L370 706 L355 655Z M1090 622 L1098 656 L1112 707 L1142 714 L1124 659Z"/>
	<path fill="var(--front-mesa)" d="M1108 737 L1127 587 Q1135 546 1210 545 L1240 547 L1258 566 L1211 568 Q1163 570 1161 608 L1158 738Z M1274 585 L1303 594 L1320 741 L1283 740Z"/>
	<path fill="url(#vertical-1)" d="M1127 587 L1141 603 L1128 738 L1108 737Z M1283 740 L1274 585 L1288 603 L1304 740Z"/>
	<path fill="none" d="M1143 617 L1136 706 M1192 557 L1225 555 M1293 628 L1301 704"/>`,
	`<path fill="var(--front-ridge)" d="M0 778 Q195 760 374 748 Q533 725 660 743 Q797 753 952 738 Q1153 732 1440 767 V900 H0Z"/>
	<path fill="var(--front-shadow)" stroke="none" d="M605 739 L620 739 L836 771 L819 774Z"/>
	<path fill="none" d="M0 790 Q233 775 368 763 M385 759 Q492 740 557 746 M641 755 Q821 773 951 752"/>
	<g fill="var(--front-ink)" stroke="none">
		<path d="M596 676 Q596 662 606 659 Q619 661 618 675 L611 681 L599 679Z"/>
		<path d="M599 680 L613 680 L621 706 L614 715 L614 737 L609 740 L606 714 L601 728 L596 739 L590 739 L598 710 L593 696 L588 703 L584 701 L594 683Z"/>
		<path d="M591 678 L596 676 L600 706 L593 708Z"/>
	</g>
	<path d="M623 679 Q641 700 625 719 M625 679 L625 719" fill="none" stroke-width="1.5"/>
	<path d="M586 671 L594 691 M591 669 L598 689" fill="none" stroke-width="1.2"/>
	<path fill="none" d="M439 784 Q549 769 644 783 M950 782 Q1151 763 1305 791"/>`,
	`<path fill="var(--front-dune)" d="M0 853 Q211 799 394 835 Q624 889 836 831 Q1119 801 1440 862 V900 H0Z"/>
	<g fill="none">
		<path d="M0 863 Q201 810 390 846 Q626 901 840 842 Q1119 812 1440 873"/>
		<path d="M0 875 Q204 823 388 858 Q626 914 844 854 Q1119 824 1440 885"/>
		<path d="M30 881 Q189 843 330 864 M906 870 Q1121 841 1362 884"/>
		<path d="M58 888 Q188 862 289 878 M969 884 Q1110 865 1234 886"/>
	</g>`,
]

export function createBackdrop(root) {
	const el = document.createElement('div')
	el.className = 'front-backdrop'
	el.setAttribute('aria-hidden', 'true')
	el.style.setProperty('--front-ink', hex('ink'))
	for (const [name, role, weight] of [
		['peach', 'teamB', 18],
		['mint', 'court', 16],
		['lilac', 'bowl', 16],
		['planet', 'ammo', 26],
		['planet-line', 'ammoShaft', 30],
		['cloud', 'cream', 40],
		['far', 'scenery', 18],
		['mesa', 'ammoShaft', 32],
		['ridge', 'scenery', 34],
		['dune', 'ammo', 32],
		['shadow', 'ink', 28],
	])
		el.style.setProperty(
			'--front-' + name,
			`color-mix(in srgb, ${hex(role)} ${weight}%, ${hex('cream')})`,
		)
	el.innerHTML =
		`<div class="front-sky"></div><div class="front-sky front-sky-next"></div>` +
		planes
			.map(
				(paths, i) => `<svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
			<defs>
				<pattern id="hatch-${i}" patternUnits="userSpaceOnUse" width="6" height="6">
					<path d="M0 3 H6" stroke="var(--front-ink)" stroke-width="0.75"/>
				</pattern>
				<pattern id="vertical-${i}" patternUnits="userSpaceOnUse" width="6" height="6">
					<path d="M3 0 V6" stroke="var(--front-ink)" stroke-width="0.75"/>
				</pattern>
			</defs><g stroke="var(--front-ink)" stroke-width="0.75" stroke-linejoin="round">${paths}</g></svg>`,
			)
			.join('')
	const layers = [...el.querySelectorAll('svg')]
	const sky = el.querySelector('.front-sky-next')
	const reduced = matchMedia('(prefers-reduced-motion: reduce)')
	const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }
	let fade = null
	let frame = null
	let last = 0
	let scale = 1
	let disposed = false
	function resize() {
		const shot = projectFrame(innerWidth, innerHeight)
		scale = shot.scale
		root.style.setProperty('--front-scale', scale)
		root.style.setProperty('--front-sign-x', `${shot.signX}px`)
		root.style.setProperty('--front-ground', `${shot.ground}px`)
		for (const pattern of el.querySelectorAll('pattern'))
			pattern.setAttribute('patternTransform', `scale(${1 / scale})`)
		for (const path of el.querySelectorAll('g path'))
			path.setAttribute('vector-effect', 'non-scaling-stroke')
	}
	function wake() {
		if (disposed || reduced.matches || frame !== null || fade?.playState === 'running') return
		last = performance.now()
		frame = requestAnimationFrame(move)
	}
	function move(now) {
		frame = null
		const dt = (now - last) / 1000
		last = now
		pointer.x = easePointer(pointer.x, pointer.targetX, dt, tune.parallax.response)
		pointer.y = easePointer(pointer.y, pointer.targetY, dt, tune.parallax.response)
		const settled =
			Math.max(
				Math.abs(pointer.x - pointer.targetX) * innerWidth,
				Math.abs(pointer.y - pointer.targetY) * innerHeight,
			) *
				tune.parallax.depth <
			tune.parallax.settle
		if (settled) {
			pointer.x = pointer.targetX
			pointer.y = pointer.targetY
		}
		layers.forEach((layer, index) => {
			const depth = ((index + 1) / layers.length) * tune.parallax.depth
			layer.style.transform = `translate3d(${pointer.x * innerWidth * depth}px, ${pointer.y * innerHeight * depth}px, 0)`
		})
		// The sign is planted in the ridge, so it shares that plane's translation.
		const ridgeDepth = (3 / layers.length) * tune.parallax.depth
		root.style.setProperty('--front-sign-dx', `${pointer.x * innerWidth * ridgeDepth}px`)
		root.style.setProperty('--front-sign-dy', `${pointer.y * innerHeight * ridgeDepth}px`)
		if (!settled) frame = requestAnimationFrame(move)
	}
	function parallax(event) {
		pointer.targetX = Math.max(-1, Math.min(1, (event.clientX / innerWidth) * 2 - 1))
		pointer.targetY = Math.max(-1, Math.min(1, (event.clientY / innerHeight) * 2 - 1))
		wake()
	}
	function motionPreference() {
		if (frame !== null) cancelAnimationFrame(frame)
		frame = null
		if (reduced.matches) {
			pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0
			move(performance.now())
		} else wake()
	}
	resize()
	window.addEventListener('resize', resize)
	window.addEventListener('pointermove', parallax)
	reduced.addEventListener('change', motionPreference)
	return {
		el,
		retune() {
			if (fade?.playState === 'running')
				fade.effect.updateTiming({ duration: reduced.matches ? 0 : tune.skyFade * 1000 })
			wake()
		},
		crossfade(dusk = true) {
			// Read the live opacity before cancel exposes the previous underlying target.
			const from = Number(getComputedStyle(sky).opacity)
			fade?.cancel()
			if (frame !== null) cancelAnimationFrame(frame)
			frame = null
			sky.style.opacity = dusk ? '1' : '0'
			const animation = sky.animate([{ opacity: from }, { opacity: dusk ? 1 : 0 }], {
				duration: reduced.matches ? 0 : tune.skyFade * 1000,
				easing: 'ease-in-out',
			})
			fade = animation
			return animation.finished.then(
				() => {
					if (fade === animation) wake()
				},
				() => {},
			)
		},
		dispose() {
			disposed = true
			fade?.cancel()
			if (frame !== null) cancelAnimationFrame(frame)
			window.removeEventListener('resize', resize)
			window.removeEventListener('pointermove', parallax)
			reduced.removeEventListener('change', motionPreference)
			el.remove()
		},
	}
}
