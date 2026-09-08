import { expect, test } from 'bun:test'
import { PALETTE, applyCssVariables, hex } from '../src/style.js'
import { TRAIL, WEAPONS } from '../src/weapons.js'

test('every role resolves to six-digit hex, with or without a DOM', () => {
	for (const role of Object.keys(PALETTE)) expect(hex(role)).toMatch(/^#[0-9a-f]{6}$/)
	expect(() => applyCssVariables(null)).not.toThrow()
	const props = {}
	applyCssVariables({ style: { setProperty: (k, v) => (props[k] = v) } })
	expect(props['--court-bg']).toBe(hex('court'))
	expect(props['--accent-bowl']).toBe(hex('bowl'))
})

test('a weapon names its palette role once, and the trail agrees with it', () => {
	for (const [id, def] of Object.entries(WEAPONS)) {
		expect(PALETTE[def.role]).toBeDefined()
		expect(TRAIL[def.kind]).toBe(PALETTE[def.role])
		expect(def.key).toBeTruthy()
		expect(def.pad).toBeTruthy()
		expect(id).toBeTruthy()
	}
})
