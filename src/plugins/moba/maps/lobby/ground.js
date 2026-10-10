import { saucerShape } from '../../lobby-floor.js'

// Only the saucer's glaze: nothing beyond it, so the sky shows through.
export function ground({ add, material, m }) {
	add(saucerShape(), material('cream', { flat: true }), 0, m.printLayers.lobby, 0)
}
