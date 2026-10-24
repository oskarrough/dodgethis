export default {
	castPoint: 0.3, // The blocking wall needs the same readable placement tell as other enemy casts.
	range: 8,
	length: 4.5,
	radius: 2.25, // the held circle: half the wall
	post: 0.3, // each post of the wall
	duration: 4,
	cooldown: 10,
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'cushion.post': 'm',
}
