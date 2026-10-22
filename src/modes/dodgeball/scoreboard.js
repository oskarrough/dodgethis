// YOU/FOE pips imply best-of; CSS dots avoid Darumadrop's fallback glyph shapes.
// Filled marks count survivors; beyond MAX_MARKS use one mark plus a number so debug-sized teams still fit.
const MAX_MARKS = 6

export function createScoreboard(el, court) {
	let lastRoster = ''

	function pips(flow, n) {
		let s = ''
		for (let i = 0; i < flow.match.needed; i++) {
			s += `<span class="pip${i < n ? ' on' : ''}"></span>`
		}
		return s
	}
	function roster(flow, team) {
		if (!flow.round) return ''
		let alive = 0
		let total = 0
		for (const u of flow.round.units) {
			if (u.team !== team) continue
			total++
			if (u.alive) alive++
		}
		if (total > MAX_MARKS) {
			return `<span class="unit${alive ? ' up' : ''}"></span><span class="count">${alive}</span>`
		}
		let s = ''
		for (const u of flow.round.units) {
			if (u.team !== team) continue
			s += `<span class="unit${u.alive ? ' up' : ''}"></span>`
		}
		return s
	}

	function render(flow) {
		const menu = flow.phase === 'lobby'
		court.updateScore(menu ? 0 : flow.match.wins.A, menu ? 0 : flow.match.wins.B)
		if (menu) {
			el.hidden = true
			return
		}
		const guest = flow.round?.localPlayer?.team === 'B'
		el.hidden = false
		el.innerHTML =
			`<span class="side a"><span class="name">${guest ? 'Foe' : 'You'}</span>` +
			`<span class="crew">${roster(flow, 'A')}</span>` +
			`<span class="pips">${pips(flow, flow.match.wins.A)}</span></span>` +
			`<span class="mid">Round ${flow.match.round}</span>` +
			`<span class="side b"><span class="pips">${pips(flow, flow.match.wins.B)}</span>` +
			`<span class="crew">${roster(flow, 'B')}</span>` +
			`<span class="name">${guest ? 'You' : 'Foe'}</span></span>`
	}

	// Cheap per-frame refresh: only touch the DOM when someone actually goes out.
	function sync(flow) {
		if (flow.phase === 'lobby' || !flow.round) return
		const key = `${roster(flow, 'A')}|${roster(flow, 'B')}`
		if (key === lastRoster) return
		lastRoster = key
		const crews = el.querySelectorAll('.crew')
		if (crews.length === 2) {
			crews[0].innerHTML = roster(flow, 'A')
			crews[1].innerHTML = roster(flow, 'B')
		}
	}

	return { render, sync }
}
