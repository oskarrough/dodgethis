// A field declares its dimension once. Exact dotted suffixes beat bare names;
// a block declaration is a default only when no field declaration matches.
const fields = (unit, names) =>
	Object.fromEntries(
		names
			.split(/\s+/)
			.filter(Boolean)
			.map((name) => [name, unit]),
	)

export const tuneUnits = {
	...fields(
		's',
		`cooldown castPoint duration dur life time tell windup backswing delay interval lateInterval
		channel warning stun silence lock linger respawn hold reaction dodgeReaction burstWindow late
		first passiveStart fullHealSeconds slipTime spitTime closeTime focusUntil decision maxWait maxSeconds think
		feedLife ending hoverDelay longPress inspectHold warn objective lateStep minInterval growthPeriod helpHold
		calm coyoteTime stallTime repeatPing cancelLockout buffer returnTell pocketLife maxStep response
		flipMin flipMax castEvery minFlight popTell puddle resetCooldown prone deathRefund sweep payout shieldLife
		dragTime hitstop reset firstSlam slamEvery lateEvery window immunity swim fly lifeStep handoffFor flipTime
		remeasure fillTime settleTime slamTime leapTime stickFor releaseTime punchTime period stagger drain
		flightEase afterStagger releaseSnap releaseRecover grow flash`,
	),
	...fields(
		'm',
		`radius range x z width depth margin length halfX halfZ spacing reach ringNear to ringWidth
		near far sag neckRadius neckY inset pick attackMovePick carrot arrival grid replanDistance rejoinDistance
		clearance attackRange nearMiss cushionGap lookCap rimShow span knockback ballRadius rippleSize
		maxRange bodyRadius dangerRange dashSpacing dragDistance spawnSpacing entrance
		innerZ outerZ pillarRadius postRadius baseX gatehouseX laserX towerX fortX coreX waveSpawnX slick push
		wetStripe kerbWidth footprintWidth thickness baseWallX throat hedgeInnerX hedgeOuterX hedgeInnerZ
		hedgeOuterZ scallopRadius scallopSpacing plazaRadius pillarX pillarZ guardX guardZ lineWidth dashLength
		boundaryThickness rockDepth chalkWidth courtInset surroundSize surroundDrop ledge column lipMin lipMax
		mossMin mossMax strata rimInk blockMin blockMax joint bevel mossHeight spawnX aggro leash fileSpacing
		rowSpacing laneZ soak structureStandoff supportRange fightRange laneBehind goalTolerance globeRange
		chaseRange dodgeClearance zoneClearance shadowRange escortAhead carrierFlank carrierDanger
		throwHeroRange throwMargin siegeBackoff openingX rotateRange rotateQuiet laneClaim slickWary
		slickMargin dunkRain safeRange engageMin escapeGain contact bow swing gust borderWidth band labelGap
		aimRadius arch leg tip ball roam tube capRadius island wall edgeMargin postExtra railRadius panelWidth
		diamond bollardRadius separation epsilon pickup edge ahead slip spit seamWidth channelRadius ringBorder
		teamRingRadius teamRingWidth aimBorder gagWidth size sizeStep`,
	),
	...fields(
		'height m',
		`height y halfHeight capHeight hedgeHeight wallHeight pillarHeight bob hop nameHeight
		labelY ringY fillY shadowY aimY aimFillY printY carryHeight gagHeight ground groundY chalkY
		barHeight neckHeight jugHeight palmY spoutY handleY minHeight leapHeight bollardHeight bollardCapHeight`,
	),
	...fields(
		'm/s',
		'speed shotSpeed stopSpeed jumpSpeed movingSpeed pan fallSpeed minSpeed fullSpeed',
	),
	...fields('m/s²', 'gravity'),
	...fields('deg', 'angle fov minFov assistAngle'),
	...fields(
		'rad',
		'lean tilt gagAngle drinkTilt drinkLean kickLean staggerLean flickTilt balloonTilt sprinklerTilt slideTilt swingTurn swingLean slamLean',
	),
	...fields('rad/s', 'spin bobRate swayRate'),
	...fields('deg/s', 'turnRate'),
	...fields('Hz', 'freq slideTo frequencies'),
	...fields('hp', 'hp damage healAmount bruiseDamage shield damagePerCushion hpTick'),
	...fields('hp/s', 'shieldPerSecond'),
	...fields('xp', 'xp structureXp increment takedown victimLevel'),
	...fields(
		'fraction',
		`gain opacity alpha dodge aggression slickCare catchRate growth heal damageReduction
		retreatHp meleeRetreatHp recoverHp chaseHp flagHp ballHp ballContestHp siegeLowHp interruptDamage
		retreat recover dim sky cloud stallProgress inMin inMax outMin assistBend edgeSpeed lookAhead
		burstHp saveHp healReserveHp finishHp escapeHp critChance slow lateGunDamage abilityStructure
		shadowStrength shadowLength bandMix haloOpacity glowHaloOpacity chance wetOpacity patchContrast
		mossChance strataInk flipOut flipEdge flipOvershoot overlap fromCard settled tint saturation outline
		shadow into lead taper front last clickPad overshoot bounce fling crackle fadeFrom gloss gaps`,
	),
	...fields(
		'multiplier',
		`structureDamage carrySpeed visualScale critMultiplier speedFactor deficit tension squash
		scale capScale rockFlare flare relief bumpRock hitSquash throwSquash pickupSquash extraHolder decay
		power glowHalo halo haloScale viewPadding precision airSpeedMul gravityMul retreatDisadvantage`,
	),
	...fields(
		'count',
		`count segments cap rosterMax capacity partyCapacity passes lines hops balls speckles patches
		chips steps stars isles wisps curveSteps radialSegments clampPasses sparks history flagGo rainHeroes
		clearMinions bruteEscort siegeMinions humanAttackers feedLines recapSources level critEvery botEnemies
		enemies crowd leaves bells puffs sides arches rockBands chalkSegments levels wallCourses pillarSegments
		bagLimit fitIterations every`,
	),
	...fields('int', 'seed seedMax'),
	...fields('ticks', 'thinkTicks batch trace'),
	...fields('1/s', 'rate accel airAccel friction stopFriction pullRate roll damping'),
	...fields('1/s²', 'stiffness'),
	...fields('px', 'edgeBand skyPixels labelSpace'),
	...fields('px/s', 'scrollSpeed'),
	...fields('px/m', 'pixelsPerMeter shadowPixelsPerMetre'),
	...fields('bytes', 'observationBytes'),

	// Homogeneous geometry blocks, including arrays of coordinates.
	view: 'm',
	ballView: 'm',
	map: 'm',
	dungeon: 'm',
	'fog.sight': 'm',
	'lobby.bounds': 'm',
	'lobby.fall': 'm',
	'lobby.portal.countdown': 's',
	'lobby.portal.width': 'fraction',
	'lobby.portal.reach': 'm',
	'lobby.portal.sink': 'm',
	'lobby.portal.charge.hum': 'fraction',
	'lobby.portal.charge.ease': '1/s',
	'lobby.portal.tearRadius': 'm',
	'lobby.portal.farChalkWidth': 'm',
	'lobby.portal.farWardenScale': 'multiplier',
	'lobby.portal.farBaseInset': 'm',
	'lobby.portal.farTarget': 'm',
	'lobby.portal.farHeight': 'height m',
	'lobby.portal.farScale': 'multiplier',
	'lobby.portal.openTime': 's',
	'lobby.bowl.maps': 'm',
	'lobby.fence.runs': 'multiplier',
	'lobby.fence.bollards': 'multiplier',
	jungle: 'm',
	'hedge.runs': 'm',
	'flagfall.gaps': 'm',
	'moon.at': 'm',
	leaf: 'm',
	puffDepth: 'm',
	'spires.radius': 'm',
	'light.dir': 'multiplier',
	'clouds.scale': 'm',
	palette: 'color',
	'light.sun': 'color',
	'light.shade': 'color',
	'print.layers': 'height m',
	'print.radii': 'm',
	printLayers: 'height m',
	markerLayers: 'height m',
	'stone.drums': 'multiplier',

	// Context changes the meaning of otherwise shared field names.
	'testing.speed': 'multiplier',
	'testing.speedMin': 'multiplier',
	'testing.speedMax': 'multiplier',
	'testing.speedStep': 'multiplier',
	'levels.first': 'xp',
	'levels.passive': 'xp/s',
	'respawn.base': 's',
	'respawn.perLevel': 's',
	'momentum.reduction': 's',
	'camps.bots.hp': 'fraction',
	'camps.guards.0.damage': 'multiplier',
	'camps.guards.1.damage': 'multiplier',
	'camps.guards.2.damage': 'multiplier',
	'camps.mercs.0.damage': 'multiplier',
	'camps.mercs.1.damage': 'multiplier',
	'camps.mercs.2.damage': 'multiplier',
	'camps.bots.every': 'count',
	'scripted.file': 'm',
	'bots.siegeFile': 'count',
	'bots.ballPrepare': 's',
	'bots.flagPrepare': 's',
	'bots.towerExposure': 'count',
	'bots.sticky': 's',
	'bots.stutter': 'm',
	leadError: 'fraction',
	'fog.reveal': '1/s',
	'fog.resolution': 'px/m',
	'fog.drift': 'm',
	'clouds.drift': 'm/s',
	'haze.top': 'height m',
	'haze.bottom': 'height m',
	'haze.max': 'fraction',
	'bank.bounce.max': 'count',
	'lob.fieldRadius': 'm',
	'lob.fieldLife': 's',
	'lob.burnDamage': 'hp',
	'lob.fieldSlow': 'fraction',
	'lob.view.up': 'fraction',
	'lob.view.shadowFrom': 'fraction',
	'lob.view.shockGrow': 'multiplier',
	'lob.view.shockLife': 's',
	'lob.view.embers': 'count',
	'lob.view.emberRise': 'height m',
	'lob.view.emberLife': 's',
	'lob.view.pulse': 'rad/s',
	'rallyRing.view.chalkWidth': 'fraction',
	'rallyRing.haste': 'fraction',
	'rallyRing.pulse': 's',
	'rallyRing.bot.reach': 'multiplier',
	'rallyRing.view.dashes': 'count',
	'rallyRing.view.dashFill': 'fraction',
	'rallyRing.view.draw': 's',
	'rallyRing.view.dust': 'count',
	'rallyRing.view.dustRise': 'height m',
	'rallyRing.view.dustLife': 's',
	'pinball.jumps': 'count',
	'pinball.jumpRange': 'm',
	'pinball.falloff': 'fraction',
	'pinball.view.hopTime': 's',
	'pinball.view.arc': 'height m',
	'pinball.view.dashFill': 'fraction',
	'pinball.view.ringLife': 's',
	'pinball.view.ringWidth': 'fraction',
	'slam.splash': 'hp',
	'impact.splash': 'fraction',
	'balloon.flight': 's',
	'flagfall.dunk.flight': 'm',
	'flagfall.dunk.sink': 's',
	'flagfall.garden.sink': 'm',
	'flagfall.garden.low': 'height m',
	'flagfall.garden.tall': 'height m',
	'flagfall.garden.bell': 'm',
	'flagfall.flag.every': 's',
	'flagfall.flag.silence': 's',
	'flagfall.flag.pole': 'height m',
	'flagfall.pool.strength': 'fraction',
	'flagfall.pool.spread': 'fraction',
	'flagfall.kerb.offset': 'multiplier',
	'flagfall.kerb.ends': 'm',
	'flagfall.glow.post': 'height m',
	'camps.spread': 'm',
	'cushion.post': 'm',
	'threat.heal': 'multiplier',
	'threat.multiplier': 'multiplier',
	'threat.switch': 'multiplier',
	'boss.pose.slamLift': 'height m',
	'heroes.brew.view.swigEase': 'ticks',
	'heroes.brew.view.drinkLift': 'height m',
	'heroes.coach.cutout.searchStep': 'm',
	'heroes.wata.view.releaseSnap': 's',
	'heroes.wata.view.releaseRecover': 's',
	'mend.view.preview.line': 'fraction',
	'mend.view.preview.pulse': 'rad/s',
	'mend.view.beam.glow': 'fraction',
	'ward.view.grow': 's',
	'ward.view.flash': 's',
	'ward.view.pop.to': 'multiplier',
	'tagOut.view.dashFill': 'fraction',
	'toss.feedback.shotKick': 'm',
	'toss.feedback.hitKick': 'm',
	'overthrowTerrain.patchScale': 'm',

	// Lobby dimensions whose names are shared with times, factors or angles.
	'lobby.style.line': 'fraction',
	'lobby.style.pastel': 'fraction',
	'lobby.hud.margin': 'px',
	'lobby.camera.margin': 'px',
	'lobby.camera.top': 'px',
	'lobby.camera.back': 'm',
	'follow.back': 'm',
	'lobby.inspect.deadzone': 'fraction',
	'lobby.strip.settle': 'px',
	'lobby.jolt.bump': '1/s',
	'lobby.jolt.hit': 'rad/s',
	'lobby.dust.pulse': 's',
	'lobby.dust.grains.life': 's',
	'lobby.dust.grains.streak': 's',
	'lobby.ready.hologram.float': 'height m',
	'lobby.ready.hologram.sway': 'rad',
	'lobby.ready.hologram.lift': 'fraction',
	'lobby.ready.hologram.face': 'multiplier',
	'lobby.ready.hologram.faceGap': 'm',
	'lobby.ready.promptRadius': 'm',
	'lobby.ready.corner': 'm',
	'lobby.flow.walk.from': 'fraction',
	'lobby.flow.ripple.grow': 'multiplier',
	'lobby.flow.groove.corner': 'm',
	'lobby.flow.groove.trunk': 'm',
	'lobby.flow.groove.lip': 'm',
	'lobby.flow.groove.step': 'm',
	'lobby.flow.groove.mix.side': 'multiplier',
	'lobby.flow.groove.mix.swirl': 'multiplier',
	'lobby.flow.groove.mix.twist': 'rad',
	'lobby.flow.groove.mix.sharp': 'multiplier',
	'lobby.flow.groove.glint.amount': 'fraction',
	'lobby.gallery.magnet.face': 'm',
	'lobby.gallery.magnet.rest': 'm',
	jitter: 'rad',
	'lobby.floor.crazing.jitter': 'fraction',
	'lobby.intro.distance': 'multiplier',
	'lobby.floor.cradle.angles': 'deg',
	'lobby.floor.cradle.open': 'deg',
	'lobby.floor.cradle.pole': 'm',
	'lobby.floor.grounds.blocks.side': 'm',
	'lobby.floor.grounds.flags.centre': 'm',
	'lobby.floor.grounds.flags.ring': 'm',
	'lobby.floor.grounds.flags.stone': 'm',
	'lobby.floor.grounds.flags.unevenness': 'm',
	'lobby.floor.grounds.flags.waver': 'm',
	'lobby.floor.grounds.blocks.groutWidth': 'm',
	'lobby.floor.grounds.blocks.terraces': 'count',
	'lobby.floor.grounds.blocks.stairs.angles': 'deg',
	'lobby.floor.grounds.blocks.stairs.down': 'count',
	'lobby.floor.grounds.blocks.stairs.up': 'count',
	'lobby.floor.grounds.blocks.stairs.tread': 'm',
	'lobby.floor.grounds.blocks.stairs.rise': 'height m',
	'lobby.floor.grounds.blocks.stairs.slab': 'm',
	'lobby.floor.grounds.blocks.stairs.jamb': 'm',
	'lobby.floor.grounds.blocks.stairs.door': 'height m',
	'lobby.floor.grounds.flags.groutWidth': 'm',
	'lobby.floor.grounds.flags.terraces': 'count',
	'lobby.floor.grounds.flags.stairs.angles': 'deg',
	'lobby.floor.grounds.flags.stairs.down': 'count',
	'lobby.floor.grounds.flags.stairs.up': 'count',
	'lobby.floor.grounds.flags.stairs.tread': 'm',
	'lobby.floor.grounds.flags.stairs.rise': 'height m',
	'lobby.floor.grounds.flags.stairs.slab': 'm',
	'lobby.floor.grounds.flags.stairs.jamb': 'm',
	'lobby.floor.grounds.flags.stairs.door': 'height m',
	'lobby.bowl.turn': 'rad/s',
	'lobby.bowl.rest': 'rad',
	'lobby.bowl.floor': 'm',
	'lobby.bowl.lift': 'height m',
	'lobby.bowl.label.from': 'multiplier',
	'lobby.bowl.maps.overthrow.moon': 'fraction',
	'lobby.bowl.maps.flagfall.moon': 'fraction',
	'lobby.replica.size': 'count',
	'lobby.replica.depth': 'ticks',
	...fields(
		'm',
		`well glazeLine cell lip nearby brush danger puffMin puffMax glowSize lantern drop
		centreZ pathZ jag step orbit`,
	),
	...fields('s', 'bruiseEvery bruiseDuration'),
	'base.fill': 'fraction',
	'base.line': 'fraction',
	'recall.open': 's',
	'impact.rings': 'm',
	'impact.shake.amount': 'm',
	'lobby.practice.tellY': 'height m',
	'lobby.gallery.magnet.hover': 'height m',
	buzz: 'm',
	'lobby.fence.bottom': 'height m',
	'lobby.ready.hologram.core': 'fraction',
	'lobby.gallery.magnet.punch': 'multiplier',
	'lobby.flow.groove.taper': 'm',
	'lobby.flow.groove.front': 'm',
	'lobby.flow.groove.mix.speed': 'Hz',
	'lobby.flow.groove.glint.speed': 'Hz',
	edgePan: 'bool',

	// Presentation controls share the same declarations even though look is not hashed by the sim.
	...fields('s', 'fade popIn tweet warble fatigue press'),
	...fields(
		'multiplier',
		'slamScale squish flat rebound quieter attackSquash castSquash vaultSquash rainSquash',
	),
	'out.slam': 's',
	'out.tilt': 'deg',
	'out.hold': 'fraction',
	'out.streak': 's',
	'out.kick': 'm',
	'card.fall': 's',
	'card.bounce': 's',
	'squeak.turn': 'deg',
	'squeak.speed': 'fraction',
	'damageNumbers.enabled': 'bool',
	'damageNumbers.rise': 'height m',
	'damageNumbers.drift': 'm',
	'damageNumbers.spread': 'm',
	'damageNumbers.overshoot': 'multiplier',
	'damageNumbers.crit.punch': 'multiplier',
	'damageNumbers.sizing': 'multiplier',
	'damageNumbers.sizing.xp': 'multiplier',
	'damageNumbers.sizing.growth': 'multiplier',
	'juice.shakeTaken': 'm',
	'juice.shakeTakedown': 'm',

	// Splash controls use pixels and screen fractions, not world metres.
	'front.skyFade': 's',
	'front.loading.preview': 's',
	'front.loading.creep': 'fraction',
	'front.loading.line': 'fraction',
	'front.loading.pastel': 'fraction',
	'front.loading.riseEnd': 'fraction',
	'front.loading.pitchEnd': 'fraction',
	'front.loading.uiFadeEnd': 'fraction',
	'front.loading.fitMargin': 'multiplier',
	'front.loading.arcHeight': 'height m',
	'front.loading.back': 'm',
	'front.loading.targetY': 'height m',
	'front.shot.ease': 'multiplier',
	'front.shot.depth': 'multiplier',
	'front.shot.splash.lift': 'px',
	'front.shot.lobby.lift': 'px',
	'front.shot.apex.lift': 'px',
	'front.shot.splash.zoom': 'multiplier',
	'front.shot.lobby.zoom': 'multiplier',
	'front.shot.apex.zoom': 'multiplier',
	'front.parallax.depth': 'fraction',
	'front.parallax.settle': 'px',
	'front.tile.snap': 's',
	'front.tile.press': 's',
	'front.tile.lift': 'px',
	'front.tile.tilt': 'deg',
	'front.tile.wash': 'fraction',
	'front.tile.drop': 's',
	'front.tile.pop': 's',
	'front.skin.line': 'px',
	'front.skin.shadow': 'px',
	'front.skin.ring': 'px',
	'front.skin.cut': 'px',
	'front.mist.period': 's',
	'front.dusk.amount': 'fraction',
	'front.deny.shake': 's',
}

// No patterns or name guessing: try exact suffixes, longest first, then block defaults.
export function resolveUnit(path) {
	const parts = path.split('.')
	for (let end = parts.length; end > 0; end--)
		for (let start = 0; start < end; start++) {
			const key = parts.slice(start, end).join('.')
			if (Object.hasOwn(tuneUnits, key)) return tuneUnits[key]
		}
}

// Resolve actual target objects, not GUI folder names (some sliders edit nested/aliased objects).
export function unitResolver(root) {
	const paths = new WeakMap()
	function walk(object, path) {
		if (!object || typeof object !== 'object') return
		paths.set(object, path)
		for (const [key, value] of Object.entries(object))
			if (value && typeof value === 'object') walk(value, [...path, key])
	}
	walk(root, [])
	return (object, key) => {
		const path = paths.get(object)
		return path && resolveUnit([...path, key].join('.'))
	}
}
