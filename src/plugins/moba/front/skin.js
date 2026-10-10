import { tune } from './tune.js'

// The card skin's painted edges: SVG filters defined once per document, then referenced by
// every card. Each filter comes in a few seeds so neighbouring cards never share a wobble.
const seeds = 3

export function ensureSkinDefs() {
	if (document.getElementById('skin-defs')) return
	const { deckle, pen, wash, bloom, brush } = tune.skin.paint
	const filters = Array.from(
		{ length: seeds },
		(_, i) => `
		<filter id="skin-deckle-${i}" x="-10%" y="-10%" width="120%" height="120%">
			<feTurbulence type="fractalNoise" baseFrequency="${deckle.frequency}" numOctaves="4" seed="${i * 7 + 1}"/>
			<feDisplacementMap in="SourceGraphic" scale="${deckle.scale}" xChannelSelector="R" yChannelSelector="G"/>
		</filter>
		<filter id="skin-pen-${i}" x="-10%" y="-10%" width="120%" height="120%">
			<feTurbulence type="fractalNoise" baseFrequency="${pen.frequency}" numOctaves="3" seed="${i * 5 + 2}"/>
			<feDisplacementMap in="SourceGraphic" scale="${pen.scale}" xChannelSelector="R" yChannelSelector="G"/>
		</filter>
		<filter id="skin-brush-${i}" x="-10%" y="-10%" width="120%" height="120%">
			<feTurbulence type="fractalNoise" baseFrequency="${pen.frequency}" numOctaves="3" seed="${i * 5 + 2}" result="warp"/>
			<feDisplacementMap in="SourceGraphic" in2="warp" scale="${pen.scale}" xChannelSelector="R" yChannelSelector="G" result="line"/>
			<feTurbulence type="fractalNoise" baseFrequency="${brush.grain}" numOctaves="2" seed="${i + 11}" result="grain"/>
			<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${brush.dry * 4} 0 0 0 ${1 - brush.dry * 2.4}" result="bristles"/>
			<feComposite in="line" in2="bristles" operator="in"/>
		</filter>
		${[
			['wash', wash],
			['bloom', bloom],
		]
			.map(
				([name, w]) => `<filter id="skin-${name}-${i}" x="-25%" y="-35%" width="150%" height="170%">
			<feTurbulence type="fractalNoise" baseFrequency="${w.frequency}" numOctaves="3" seed="${i * 3 + 4}" result="warp"/>
			<feDisplacementMap in="SourceGraphic" in2="warp" scale="${w.scale}" xChannelSelector="R" yChannelSelector="G" result="shape"/>
			<feGaussianBlur in="shape" stdDeviation="${w.soften}" result="soft"/>
			<feTurbulence type="fractalNoise" baseFrequency="${w.frequency * 2}" numOctaves="2" seed="${i + 9}" result="pool"/>
			<feColorMatrix in="pool" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${w.pooling} 0 0 0 ${0.75 - w.pooling / 2}" result="pigment"/>
			<feComposite in="soft" in2="pigment" operator="in" result="body"/>
			<feMorphology in="shape" operator="erode" radius="${w.rim}" result="inner"/>
			<feComposite in="shape" in2="inner" operator="out" result="edge"/>
			<feGaussianBlur in="edge" stdDeviation="1" result="rim"/>
			<feMerge><feMergeNode in="body"/><feMergeNode in="rim"/></feMerge>
		</filter>`,
			)
			.join('')}`,
	).join('')
	document.body.insertAdjacentHTML(
		'beforeend',
		`<svg id="skin-defs" width="0" height="0" aria-hidden="true" style="position:absolute">${filters}</svg>`,
	)
}

// The painted layers of one card, `i` picking its seed: a wash that bleeds out behind it when
// you're on it, a painted shadow and ring, then the deckled paper with its pen line.
export function paintedCard(i) {
	const s = i % seeds
	const layer = (name, ...rects) =>
		`<svg class="skin-paint skin-${name}" aria-hidden="true">${rects.map(([cls, filter]) => `<rect class="${cls}" width="100%" height="100%" rx="${cls === 'skin-bleed-wash' ? '30%' : 0}" filter="url(#skin-${filter}-${s})"/>`).join('')}</svg>`
	return (
		layer('bleed', ['skin-bleed-wash', 'bloom']) +
		layer('shadow', ['skin-shadow-paint', 'deckle']) +
		layer('halo', ['skin-ring-paint', 'brush']) +
		layer('paper', ['skin-paper-fill', 'deckle'], ['skin-pen-line', 'pen'])
	)
}

// A deckled paper edge laid over a picture's straight one, with an optional pen line.
export function paintedEdge(i) {
	const s = (i + 1) % seeds
	return `<svg class="skin-paint skin-edge" aria-hidden="true"><rect class="skin-edge-paper" width="100%" height="100%" filter="url(#skin-deckle-${s})"/><rect class="skin-edge-pen" width="100%" height="100%" filter="url(#skin-pen-${s})"/></svg>`
}

// A watercolour wash to sit behind a title.
export function paintedWash(i) {
	return `<svg class="skin-paint skin-wash" aria-hidden="true"><rect width="100%" height="100%" rx="12" filter="url(#skin-wash-${(i + 2) % seeds})"/></svg>`
}
