import { expect, test } from 'bun:test'
import { PALETTE, applyCssVariables, hex } from '../src/style.js'
import { TRAIL, WEAPONS } from '../src/weapons.js'

test('roles resolve to six-digit hex, including ones with leading zeroes', () => {
	expect(hex('ink')).toBe('#26445f')
	expect(hex('cream')).toBe('#fffdf4')
	for (const role of Object.keys(PALETTE)) expect(hex(role)).toMatch(/^#[0-9a-f]{6}$/)
})

test('the palette is importable without a DOM', () => {
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
