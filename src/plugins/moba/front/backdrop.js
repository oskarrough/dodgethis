import { hex } from '../../../core/style.js'
import { tune } from './tune.js'

// Four viewport-sized planes. Paths scale; ink and the hatch pattern stay in CSS pixels.
const planes = [
	`<circle cx="280" cy="470" r="166" fill="var(--front-planet)" stroke="none"/>
	<path d="M0 326 H208 L260 332 H602 M905 256 H1228 L1294 264 H1440 M64 490 H530 M720 421 H1190"
		fill="none" stroke="var(--front-cloud)" stroke-width="9"/>`,
	`<path fill="var(--front-mesa)" d="M0 695 L120 689 L154 596 L214 593 L234 544 L332 544 L350 607 L411 611 L443 695 L640 691 L701 642 L748 642 L782 580 L823 580 L837 638 L884 638 L901 696 L1440 680 V900 H0Z"/>
	<path fill="url(#hatch-1)" d="M234 544 L260 568 L278 627 L332 660 L350 607 L332 544Z M782 580 L801 609 L812 675 L837 638 L823 580Z"/>
	<path fill="var(--front-mesa)" d="M1028 694 L1049 551 Q1053 496 1125 494 L1171 494 L1188 519 L1133 523 Q1091 523 1090 561 L1082 694Z M1204 540 L1240 551 L1259 694 L1220 694Z"/>
	<path fill="url(#hatch-1)" d="M1049 551 L1063 561 L1052 692 L1028 694Z M1220 694 L1204 540 L1223 556 L1239 694Z"/>`,
	`<path fill="var(--front-ridge)" d="M0 731 Q182 676 338 710 Q511 742 656 700 Q799 669 940 707 Q1110 760 1440 692 V900 H0Z"/>
	<path fill="url(#hatch-2)" d="M0 731 Q182 676 338 710 Q511 742 656 700 Q540 793 373 770 Q154 726 0 784Z"/>
	<g fill="var(--ui-text)" stroke="none">
	<circle cx="921" cy="685" r="3"/>
	<path d="M917 690 L924 690 L927 704 L922 702 L925 715 L922 715 L919 705 L916 715 L913 715 L918 699 L913 700Z"/>
	<path d="M928 687 Q939 697 928 708 L931 697Z"/>
	</g>`,
	`<path fill="var(--front-dune)" d="M0 809 Q207 757 415 812 Q623 865 851 803 Q1110 742 1440 818 V900 H0Z"/>
	<path fill="url(#hatch-3)" d="M0 809 Q207 757 415 812 Q623 865 851 803 Q696 904 462 853 Q195 795 0 852Z"/>
	<path fill="none" d="M70 875 Q188 834 300 858 M1010 868 Q1160 823 1365 861" />`,
]

export function createBackdrop() {
	const el = document.createElement('div')
	el.className = 'front-backdrop'
	el.setAttribute('aria-hidden', 'true')
	el.style.setProperty('--front-ink', hex('ink'))
	for (const [name, role] of Object.entries({
		peach: 'teamB',
		mint: 'court',
		lilac: 'bowl',
		planet: 'ammo',
		cloud: 'cream',
		mesa: 'ammoShaft',
		ridge: 'scenery',
		dune: 'ammo',
	}))
		el.style.setProperty('--front-' + name, `color-mix(in srgb, ${hex(role)} 40%, ${hex('cream')})`)
	el.innerHTML =
		`<div class="front-sky"></div><div class="front-sky front-sky-next"></div>` +
		planes
			.map(
				(paths, i) => `<svg viewBox="0 0 1440 900" preserveAspectRatio="none">
			<defs><pattern id="hatch-${i}" patternUnits="userSpaceOnUse" width="6" height="6">
				<path d="M0 0 H6" stroke="var(--front-ink)" stroke-width="0.75" opacity=".28"/>
			</pattern></defs><g stroke="var(--front-ink)" stroke-width="0.75"
				stroke-linejoin="round">${paths}</g></svg>`,
			)
			.join('')
	const sky = el.querySelector('.front-sky-next')
	let fade = null
	function resize() {
		for (const pattern of el.querySelectorAll('pattern'))
			pattern.setAttribute(
				'patternTransform',
				`scale(${1440 / (innerWidth * 1.1)} ${900 / (innerHeight * 1.1)}) rotate(30)`,
			)
		for (const path of el.querySelectorAll('g > path'))
			path.setAttribute('vector-effect', 'non-scaling-stroke')
	}
	const layers = [...el.querySelectorAll('svg')]
	const reduced = matchMedia('(prefers-reduced-motion: reduce)')
	function parallax(event) {
		if (reduced.matches || fade?.playState === 'running') return
		const x = Math.max(-1, Math.min(1, (event.clientX / innerWidth) * 2 - 1))
		const y = Math.max(-1, Math.min(1, (event.clientY / innerHeight) * 2 - 1))
		layers.forEach((layer, index) => {
			const depth = ((index + 1) / layers.length) * 0.015
			layer.style.transform = `translate(${x * innerWidth * depth}px, ${y * innerHeight * depth}px)`
		})
	}
	resize()
	window.addEventListener('resize', resize)
	window.addEventListener('pointermove', parallax)
	return {
		el,
		// Only opacity animates, and the scenery is still throughout.
		crossfade(dusk = true) {
			fade?.cancel()
			const from = Number(getComputedStyle(sky).opacity)
			sky.style.opacity = dusk ? '1' : '0'
			fade = sky.animate([{ opacity: from }, { opacity: dusk ? 1 : 0 }], {
				duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : tune.skyFade * 1000,
				easing: 'ease-in-out',
			})
			return fade.finished.catch(() => {})
		},
		dispose() {
			fade?.cancel()
			window.removeEventListener('resize', resize)
			window.removeEventListener('pointermove', parallax)
			el.remove()
		},
	}
}
