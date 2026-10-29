export const meta = {
	name: 'whole-cast-feel',
	description:
		'Give all eight heroes coherent, expressive and readable ability kits, with reusable effects and fast motion previews.',
	phases: [
		{ title: 'Workshop' },
		{ title: 'Kits' },
		{ title: 'Judgment' },
		{ title: 'Revision' },
		{ title: 'Integration' },
		{ title: 'Cast review' },
		{ title: 'Ship' },
	],
}
const common = `You are working in /home/osk/sites/dodgethis, the shared project checkout. Read AGENTS.md, docs/feel-pass.md, docs/world.md, docs/look.md, docs/build-rules.md and docs/verify.md. User explicitly authorized ambitious autonomous creative work over the next couple of days, all 8 heroes and their whole kits, mechanics/timing changes allowed, balance secondary. They want fun, snappy, impactful and readable. References: Heroes of the Storm for combat clarity, Hades for graphic motion/shapes, Smash for anticipation and impact. Take concrete lessons, not copied assets or an alien look. Do not wait for user answers: decisions within this brief are yours; genuine non-blocking questions go to INBOX per AGENTS.md. You are not alone in this checkout: never revert others' work. No worktrees, PRs, new unit tests, global hit stop or manual deployment. Use jj for version control; only the designated integration coordinator may commit/push. Keep simulation deterministic, cast/collision areas honest, team ownership clear, online guests working and resources bounded/disposed. World and reference docs are direction, not a reason to be timid. Use real existing architecture, avoid a parallel VFX framework. Skills applicable to the task should be read. No additional agent spawning: this workflow owns concurrency.`
const workshop = await agent(
	common +
		`
FOUNDATION OWNERSHIP: shared effect/view primitives only where multiple kits need them; existing preview/proof scripts and small extensions; package script if necessary; a short repo-local .agents/skills/ability-feel/SKILL.md; docs/feel-pass.md workshop notes. No hero or ability folder edits, no pages/index.html or pages/items.json edits, no commits.
Inspect existing effects.js, hero-view.js and per-hero animate/release hooks, skills-view.js, proof API, scripts/shot.js and scripts/review.js before designing. Reuse the kit. User explicitly requested internal tooling, primitives and skills that make this and future agents faster. Deliver a practical way to exercise each hero's full kit through real inputs and capture a brief match-camera clip with asserted cast state. Extend existing tools rather than constructing a new product. A shared capture lock must serialize browser work; host load is already ~40. Avoid long unbounded proof attempts; say honestly if hardware responsiveness cannot be measured.
Research the named peer games using official developer footage/articles or talks; record a few concrete applicable observations with source links, no invented timings or claims of having played. Distill the observations into useful direction for builders.
Add only opt-in primitives justified by at least two kits, preserving current callers. Check cleanup, rewind, interpolation, guest lifecycle and truthful telegraphs. Avoid speculative geometry factories and multiplying effects.
Use skill-creator guidance for the local skill: short, non-obvious routing to actual primitives and the tested fast verification command, no bureaucratic checklist or approvals. Validate the recipe once on the existing balloon and a different hero; don't claim quantified efficiency without a controlled benchmark. Tell builders exactly how to use it and any real limitations.
Existing balloon implementation is final and uncommitted from thread thr_t8se7k3x2h, with proof pages/balloon-polish; do not edit it. Integration inherits it later.
Run relevant quick checks; do not fix unrelated changes. Return exact owned files, stable primitive/tool contracts, capture locking command, reference lessons, verification results, blockers, and a concise builder brief. Make the foundation usable before returning.`,
	{
		provider: 'claude-code',
		model: 'claude-sonnet-5-5',
		reasoningLevel: 'high',
		phase: 'Workshop',
		label: 'Shared effects, quick previews and ability skill',
	},
)
const kits = [
	{
		hero: 'ibis',
		abilities: ['loose', 'rain', 'vault'],
		character:
			'A taut archer: draw and release, an unmistakable falling volley, a nimble vault with a crisp landing. Distinguish precision, area threat and escape.',
		provider: 'codex',
		model: 'gpt-6-astra',
	},
	{
		hero: 'kappa',
		abilities: ['gloveSlap', 'toss', 'catch', 'dive'],
		character:
			'A compact keeper: a satisfying slap, weight in the toss, an unmistakable catch with possession payoff, a low committed dive. Show the hands and the ball.',
		provider: 'claude-code',
		model: 'claude-sonnet-5-5',
	},
	{
		hero: 'oolong',
		abilities: ['palmStrike', 'flyingKick', 'stagger', 'swig'],
		character:
			'A weighty martial brawler: a quick palm, a coiled then decisive kick, a readable braced stagger, a swig with personality. Weight without making controls feel late.',
		provider: 'codex',
		model: 'gpt-6-astra',
	},
	{
		hero: 'lasso',
		abilities: ['yoYoFlick', 'throw', 'tangle', 'aroundTheWorld'],
		character:
			'A taut string and spinning weight: elastic launch and return, a crisp binding gesture, a grand circular sweep. Read line tension and orbit, not a generic magic flash.',
		provider: 'codex',
		model: 'gpt-6-astra',
	},
	{
		hero: 'mandador',
		abilities: ['tennisBall', 'pass', 'tagOut', 'rallyRing', 'outThrow'],
		character:
			'A commanding field captain: a clean ball strike, a legible pass and receipt, a decisive tag-out exchange, a rally with a clear call and response. Support actions must feel as satisfying as damage.',
		provider: 'claude-code',
		model: 'claude-sonnet-5-5',
	},
	{
		hero: 'undine',
		abilities: ['waterFlick', 'balloon', 'sprinkler', 'slide'],
		character:
			'Water with weight and playfulness: sharp flick, water-heavy balloon with a decisive burst, a sprinkler whose rhythm reads, a slick flowing slide. Build on the first balloon pass; demand a coherent whole kit.',
		provider: 'codex',
		model: 'gpt-6-astra',
	},
	{
		hero: 'carambola',
		abilities: ['bank', 'lob', 'pinball'],
		character:
			'A trick-shot artist: readable banking direction, a satisfyingly weighted lob, a pinball chain with crisp impacts and a clear path. A different rhythm from Ibis, not another generic projectile kit.',
		provider: 'codex',
		model: 'gpt-6-astra',
	},
	{
		hero: 'salvia',
		abilities: ['mend', 'ward'],
		character:
			'A deliberate healer: a visible gathering and release of restoration, a ward that forms and absorbs with character. Healing should feel affirmative and strong without covering allies. Include the shared Tennis Ball in your assessment; Mandador owns its edits.',
		provider: 'claude-code',
		model: 'claude-sonnet-5-5',
	},
]
const reviewSchema = {
	type: 'object',
	properties: {
		accepted: { type: 'boolean' },
		findings: { type: 'array', items: { type: 'string' } },
		summary: { type: 'string' },
	},
	required: ['accepted', 'findings', 'summary'],
	additionalProperties: false,
}
log(
	'Scope: all eight heroes, 23 slotted abilities, basics and relevant traits. At most two revision rounds per kit before integration triage; no ability silently omitted. Browser captures serialized by the workshop tool.',
)
function buildAgent(prompt, kit, phase, label) {
	if (kit.provider === 'codex')
		return agent(prompt, {
			provider: 'codex',
			model: 'gpt-6-astra',
			reasoningLevel: 'high',
			phase,
			label,
		})
	return agent(prompt, {
		provider: 'claude-code',
		model: 'claude-sonnet-5-5',
		reasoningLevel: 'high',
		phase,
		label,
	})
}
const results = await pipeline(
	kits,
	async (kit) => {
		const ownership = `Own src/modes/moba/heroes/${kit.hero}/ and these ability folders only: ${kit.abilities.map((a) => 'src/modes/moba/abilities/' + a + '/').join(', ')}. Own pages/feel-${kit.hero}/ proof artifacts. Do not edit other heroes/abilities, shared kit files, package/scripts, AGENTS.md, shared docs or page registries. New local view files are allowed; generated registries belong to integration. Shared basic attack changes belong to integration except tennisBall, owned solely by Mandador (Salvia consumes it). Do not undo the balloon work already in the checkout.`
		const brief =
			common +
			'\n' +
			ownership +
			'\nWORKSHOP HANDOFF:\n' +
			workshop +
			`
Build the ENTIRE ${kit.hero} kit, not one showcase spell. Direction: ${kit.character}
Be ambitious: visibly stage anticipation, release, travel/contact and recovery; adjust cast time, windup, travel timing, recovery and local mechanics where they serve feel. Avoid delays added just to display animation. Design strong shapes and contrasting rhythms rather than adding particles to everything. Keep one dominant mark per action and subordinate lingering effects. Include basic attack and the relevant trait/status visual feedback. Preserve current hero identity, proportions and roster; no invented third Salvia ability or removal of draft status.
Read actual callers before local hook changes. Use the workshop primitives and ability-feel skill. If a shared change is needed, describe the concrete missing contract in your result; do the local work that can proceed.
Prove the whole kit in one compact motion clip (with honest speed labels) through existing real-input tooling. Assert action states; show all assigned abilities, basic and applicable trait, plus a miss/expiry where relevant. Serialize captures via workshop lock. Do not fabricate FPS or call a staged isolated clip a crowded-fight proof. No repeated replay sweep. Use writePage/export or equivalent to publish under your owned proof directory without touching index/items.
Run check and relevant existing tests; no new unit tests. Unit-tune changes must not leave descriptions lying. Briefly review your complete owned diff.
Return exact files, per-ability before/after and authored timing, coverage including intentional no-change decisions with reasons, proof path, checks, shared requests and known limitations. No commits or pushes.`
		const built = await buildAgent(brief, kit, 'Kits', kit.hero + ' whole kit')
		return { ownership, brief, built }
	},
	async (built, kit) => {
		const judgePrompt =
			common +
			`\nYou are the independent READ-ONLY judge for ${kit.hero}. Use arbe-review. Inspect the whole changed owned files and actual proof; do not just trust the builder. No file edits, no commits, no new capture unless the existing evidence cannot establish a specific finding. Review usefulness and visual/readability quality as well as correctness. This should be a visible full-kit improvement, not tiny tuning justified in prose. Check all assigned abilities and basic/trait coverage; verify cast timing and true danger radius, one dominant visual beat, quiet residue, allocation/disposal, replay reset and guest data shapes. Don't request a huge framework or balance study. Report confirmed specific blockers with file/line/scenario and precise fixes; distinguish uncertainty. You may accept intentional no-change abilities if already strong and the decision is supported. \nOwnership: ${built.ownership}\nWorkshop: ${workshop}\nBuilder result: ${built.built}`
		const judgment = await agent(judgePrompt, {
			provider: 'claude-code',
			model: 'claude-opus-5-5',
			reasoningLevel: 'high',
			phase: 'Judgment',
			label: kit.hero + ' independent judgment',
			schema: reviewSchema,
		})
		return { ...built, judgment, judgePrompt }
	},
	async (state, kit) => {
		for (let round = 0; !state.judgment.accepted && round < 2; round++) {
			state.revision = await buildAgent(
				state.brief +
					'\nYour prior result:\n' +
					state.built +
					'\nIndependent judgment:\n' +
					JSON.stringify(state.judgment) +
					'\nResolve confirmed findings within your ownership. Inspect current files; preserve others. Reuse proof unless changes invalidate it. Return actual fixes, checks and any unresolved findings.',
				kit,
				'Revision',
				kit.hero + ' revision ' + (round + 1),
			)
			state.judgment = await agent(
				state.judgePrompt +
					'\nRevision:\n' +
					state.revision +
					'\nRecheck the relevant current files/evidence. Accept only when material issues are resolved; do not invent new cosmetic work to prolong this.',
				{
					provider: 'claude-code',
					model: 'claude-opus-5-5',
					reasoningLevel: 'high',
					phase: 'Judgment',
					label: kit.hero + ' recheck ' + (round + 1),
					schema: reviewSchema,
				},
			)
		}
		if (!state.judgment.accepted)
			log(kit.hero + ' needs integration triage after two revision rounds.')
		return {
			hero: kit.hero,
			abilities: kit.abilities,
			ownership: state.ownership,
			built: state.built,
			revision: state.revision || null,
			judgment: state.judgment,
		}
	},
)
const integrationBrief =
	common +
	`
You are the INTEGRATION COORDINATOR, inheriting coordination from root thr_req99inm6w. All kit pipeline work has ended. You now own the files produced by this workflow, generated registries, any necessary shared integration changes, docs/feel-pass.md, pages/items.json and pages/index.html, the final pages/cast-feel/ proof/index, and the existing balloon changes/pages/balloon-polish. Preserve unrelated checkout changes. Root also owns .bb/workflows/whole-cast-feel.js and docs/feel-pass.md and authorizes you to include them. Read orchestrate, arbe-jj-jujutsu and arbe-review skills.
Workshop result:\n${workshop}
All kit results:\n${JSON.stringify(results)}
Integrate the ENTIRE cast, not only accepted results; null or rejected results are unfinished work that you must diagnose and complete, not omit. No new agents. Inspect actual diffs and local/remote state, reconcile generated registries, shared primitives, inherited basics and tennisBall behavior for both consumers. Resolve requested shared changes only where justified. Fix actual cross-kit bugs and all confirmed review blockers; check user input still feels prompt and mechanics/telegraphs match. Add integration notes and a complete eight-hero/all-ability coverage record to docs/feel-pass.md. Check existing tests and bun run check; run bun run test before any eventual push. Do not commit or push in this first integration stage.
Use the fast preview tool to make ONE honest crowded-fight/readability proof spanning contrasting kits, plus a compact pinboard page linking the individual kit proofs. Inspect it. Reduce clutter where it actually obscures ownership, danger or bodies. Capture only under the shared lock, don't overload the host or claim software-rendered frame timings are hardware FPS. Don't invent proof if browser fails; preserve usable clips and report the exact limitation.
Keep the internal skill accurate to the actual integrated kit/tool, based on exercised commands. Avoid an elaborate framework or broad AGENTS rewrite. Return exact owned files, resolved issues, whole-cast verdict, tests and proof URL, remaining blockers and proposed user-facing checkpoint slices.`
const integrated = await agent(integrationBrief, {
	provider: 'codex',
	model: 'gpt-6-astra',
	reasoningLevel: 'high',
	phase: 'Integration',
	label: 'Integrate the eight kits and judge the crowded fight',
})
const castReview = await agent(
	common +
		'\nREAD-ONLY whole-cast final review using arbe-review and the orchestrate bar. Inspect actual integrated changes, coverage and final proof. Look for missing heroes or abilities, broken shared primitives, false verification claims, visual uniformity or unreadable clutter, mechanical/replication regressions and skill/tool mismatch. No new sprawling analysis; confirm concrete material findings. No file edits or commits.\nIntegration report:\n' +
		integrated,
	{
		provider: 'claude-code',
		model: 'claude-opus-5-5',
		reasoningLevel: 'high',
		phase: 'Cast review',
		label: 'Opus whole-cast judgment',
		schema: reviewSchema,
	},
)
const shipped = await agent(
	integrationBrief +
		'\nYour integration result:\n' +
		integrated +
		'\nIndependent whole-cast review:\n' +
		JSON.stringify(castReview) +
		`
FINAL INTEGRATION AND SHIPMENT: resolve verified findings, recheck only affected proof/tests plus required full suite. You are the sole commit/push owner now. Do not ship unresolved material correctness/readability failures. Use jj, explicit owned paths, user-facing commit messages and verify each committed file list. Keep unrelated changes intact, no jj restore. Root aligned its empty working change onto main before this workflow; recheck current state and remote before committing. Ship green coherent checkpoints to main, which deploys; never wrangler deploy. If automatic approval blocks a write/push, follow available escalation and clearly record what remains, do not claim shipment.
Make one INBOX task linking the finished cast review and asking Oskar to judge the feel when he returns, status todo and attached, per tasks skill; this is not an approval gate for already-authorized implementation/shipment. No unsolicited messages to external services. Record shipped revisions, checks, honest proof limitations and any leftovers in docs/feel-pass.md before final commit. Final result: concise player-facing changes, full scope coverage, proof URL, actual commit/push status, unresolved issues only. Be candid if not complete.`,
	{
		provider: 'codex',
		model: 'gpt-6-astra',
		reasoningLevel: 'high',
		phase: 'Ship',
		label: 'Resolve final findings and ship the cast',
	},
)
return {
	kits: results.map((r) => r && { hero: r.hero, accepted: r.judgment.accepted }),
	castReview,
	shipped,
}
