import assert from 'node:assert/strict'
import { bootMoba, STEP } from '../../tests/moba-harness.js'
import { abilityOf } from '../../src/modes/moba/ability.js'
import { createLaneReplica } from '../../src/modes/moba/lane-replica.js'
import { validFact } from '../../src/modes/moba/index.js'
import { extras as lobView } from '../../src/modes/moba/abilities/lob/lob-view.js'
import { extras as balloonView } from '../../src/modes/moba/abilities/balloon/balloon-view.js'

const results = []
for (const [id, heroId, makeView] of [['lob', 'pong', lobView], ['balloon', 'wata', balloonView]]) {
  const heroes = [{id:'A', team:'A', heroId}, {id:'B', team:'B', heroId:'fletcher'}]
  const host = bootMoba({map:'overthrow', heroes})
  const guest = bootMoba({map:'overthrow', heroes})
  const replica = createLaneReplica(guest.sim, guest.scene)
  const localView = makeView(host.scene), localGroup = host.scene.children.at(-1)
  const remoteView = makeView(guest.scene), remoteGroup = guest.scene.children.at(-1)
  const owner = host.sim.heroes[0]
  const ability = abilityOf(id)
  if (id === 'balloon') {
    ability.onRelease({hero:owner,sim:host.sim,target:{x:0,z:0},slot:'slot1'})
    // Run the actual summon brain and balloonPop, rather than manufacturing a field.
    host.step(Math.ceil(ability.stats.flight / STEP) + 1)
  } else host.sim.reactAbility('land', {hero:owner, ability, point:{x:0,z:0},slot:'slot2'})
  host.step(12)
  const row = host.sim.snapshot({wire:true}).groundFields[0]
  assert.equal(row.ability, id)
  assert.ok(row.radius > 0 && row.until > host.sim.tick)
  assert.ok(replica.apply(host.sim.snapshot({wire:true}), 0), replica.stats.rejectionReason)
  replica.update(1)
  const draw = (view, sim) => view.update({groundFields:sim.groundFields,summons:sim.summons,zones:sim.zones,units:sim.heroes,tick:sim.tick,alpha:0})
  draw(localView,host.sim); draw(remoteView,replica.sim)
  const before = [localGroup.children.length,remoteGroup.children.length]
  assert.ok(before.every(n=>n>0))
  host.sim.lane.match.winner = 'A'
  host.sim.lane.match.endedTick = host.sim.tick
  host.step()
  assert.equal(host.sim.snapshot().groundFields.length,0)
  assert.ok(replica.apply(host.sim.snapshot({wire:true}), 2), replica.stats.rejectionReason)
  replica.update(3)
  draw(localView,host.sim); draw(remoteView,replica.sim)
  const after = [localGroup.children.length,remoteGroup.children.length]
  assert.deepEqual(after,[0,0])
  assert.ok(host.facts.every(validFact), 'Every emitted fact must be accepted by validFact')
  results.push({ability:id, end:'match over before deadline', fieldRadius:row.radius, from:row.from, until:row.until, endedAt:host.sim.tick, localMeshes:before[0]+' → '+after[0], peerMeshes:before[1]+' → '+after[1], validFacts:true})
  localView.dispose(); remoteView.dispose(); replica.dispose(); host.dispose(); guest.dispose()
}
console.log(JSON.stringify({result:'PASS',cases:results},null,2))
