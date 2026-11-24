<script lang="ts">
  import {
    advanceUntilDecision,
    applyTransition,
    createCombat,
    getEffectiveStat,
    getFreeActors,
    getMaxHp,
    isDecisionPoint,
    nextTransition,
    reactionAt,
    reactionDelay,
    startSkill,
    Stat,
  } from '@rpg/engine'
  import type { ActorId, CombatState, SkillId, TimelineSkill } from '@rpg/engine'
  import { sampleContent, sampleRules } from '@rpg/content'

  const combatants = [
    { id: 'hero', side: 'player' as const, characterId: 'hero', skillIds: ['jab', 'heavy', 'guard'] },
    { id: 'foe', side: 'enemy' as const, characterId: 'foe', skillIds: ['jab', 'heavy', 'guard'] },
  ]

  function fresh(): CombatState {
    return createCombat({ content: sampleContent(), rules: sampleRules, combatants })
  }

  let combat = $state<CombatState>(fresh())
  let log = $state<string[]>([])

  const freeActors = $derived.by(() => getFreeActors(combat))
  const decision = $derived.by(() => isDecisionPoint(combat))
  const nextT = $derived.by(() => nextTransition(combat))

  function pushLog(message: string): void {
    log = [message, ...log].slice(0, 80)
  }

  function opponentOf(actorId: ActorId): ActorId | undefined {
    return combat.roster.find((id) => id !== actorId)
  }

  function act(actorId: ActorId, skillId: SkillId): void {
    const def = combat.content.skills[skillId]
    try {
      const target = def?.targeting === 'opponent' ? opponentOf(actorId) : undefined
      combat = startSkill(combat, actorId, skillId, target)
      pushLog(`t${combat.timeline.tick}  ${actorId} starts ${skillId}`)
    } catch (error) {
      pushLog(`error: ${(error as Error).message}`)
    }
  }

  function applyNext(): void {
    const transition = nextTransition(combat)
    if (transition === null) {
      pushLog('no scheduled transition')
      return
    }
    combat = applyTransition(combat, transition)
    pushLog(`t${transition.tick}  ${transition.kind} ${transition.instanceId}`)
  }

  function advance(): void {
    const before = combat.timeline.tick
    combat = advanceUntilDecision(combat)
    pushLog(`advance ${before} -> ${combat.timeline.tick}`)
  }

  function reset(): void {
    combat = fresh()
    log = []
  }

  function startupEndOf(skill: TimelineSkill): number {
    const def = combat.content.skills[skill.skillId]
    return def === undefined ? Number.NaN : skill.startedAt + def.startup
  }

  function connectAtOf(skill: TimelineSkill): number {
    const def = combat.content.skills[skill.skillId]
    return def === undefined ? Number.NaN : skill.startedAt + def.startup + def.delivery
  }

  function phaseOf(skill: TimelineSkill): string {
    if (skill.resolved) {
      return combat.timeline.tick < skill.endingEndsAt ? 'ending' : 'done'
    }
    if (combat.timeline.tick < startupEndOf(skill)) {
      return 'startup'
    }
    if (combat.timeline.tick < connectAtOf(skill)) {
      return 'delivery'
    }
    return 'ending'
  }

  function reactorOf(skill: TimelineSkill): ActorId | undefined {
    return combat.roster.find((id) => id !== skill.actorId)
  }

  function reactAtOf(skill: TimelineSkill): number | null {
    const reactor = reactorOf(skill)
    if (reactor === undefined) {
      return null
    }
    const reflex = getEffectiveStat(combat, reactor, Stat.Reflex)
    return reactionAt(skill.startedAt, reflex, combat.rules)
  }
</script>

<main>
  <header>
    <h1>Combat Debug</h1>
    <div class="meta">
      <span>tick <b>{combat.timeline.tick}</b></span>
      <span>outcome <b>{combat.outcome.status}</b></span>
      <span>decision <b class:active={decision}>{decision ? 'yes' : 'no'}</b></span>
    </div>
    <div class="actions">
      <button onclick={reset}>reset</button>
      <button onclick={applyNext}>apply next transition</button>
      <button onclick={advance}>advance to decision</button>
    </div>
  </header>

  <section class="panels">
    {#each combat.roster as actorId}
      <article class="panel">
        <h2>{actorId}</h2>
        <dl>
          <dt>side</dt>
          <dd>{combat.actors[actorId]?.side}</dd>
          <dt>hp</dt>
          <dd>{combat.actors[actorId]?.runtime.hp} / {getMaxHp(combat, actorId)}</dd>
          <dt>free</dt>
          <dd class:active={freeActors.includes(actorId)}>
            {freeActors.includes(actorId) ? 'yes' : 'no'}
          </dd>
          <dt>hitstun</dt>
          <dd>{combat.actors[actorId]?.runtime.hitstunUntil}</dd>
          <dt>stagger</dt>
          <dd>{combat.actors[actorId]?.runtime.staggeredUntil}</dd>
          <dt>reflex</dt>
          <dd>{getEffectiveStat(combat, actorId, Stat.Reflex)}</dd>
          <dt>react delay</dt>
          <dd>{reactionDelay(getEffectiveStat(combat, actorId, Stat.Reflex), combat.rules)}</dd>
        </dl>

        <div class="tags">
          {#each Object.entries(combat.actors[actorId]?.runtime.cooldownEndsAt ?? {}) as [skillId, readyAt]}
            <span class="tag">{skillId}@{readyAt}</span>
          {/each}
        </div>

        <div class="tags">
          {#each combat.timeline.active.filter((skill) => skill.actorId === actorId) as skill (skill.instanceId)}
            <span class="tag">{skill.skillId} · {phaseOf(skill)}</span>
          {/each}
        </div>

        {#if freeActors.includes(actorId)}
          <div class="actions">
            {#each combat.actors[actorId]?.runtime.skillIds ?? [] as skillId}
              <button onclick={() => act(actorId, skillId)}>{skillId}</button>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </section>

  <section class="panel">
    <h2>Active skills</h2>
    {#if combat.timeline.active.length === 0}
      <p class="empty">none</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>actor</th>
            <th>skill</th>
            <th>phase</th>
            <th>start</th>
            <th>connect</th>
            <th>end</th>
            <th>resolved</th>
            <th>target</th>
            <th>reacts</th>
          </tr>
        </thead>
        <tbody>
          {#each combat.timeline.active as skill (skill.instanceId)}
            {@const reactAt = reactAtOf(skill)}
            <tr>
              <td>{skill.instanceId}</td>
              <td>{skill.actorId}</td>
              <td>{skill.skillId}</td>
              <td>{phaseOf(skill)}</td>
              <td>{skill.startedAt}</td>
              <td>{connectAtOf(skill)}</td>
              <td>{skill.endingEndsAt}</td>
              <td>{skill.resolved ? 'yes' : 'no'}</td>
              <td>{skill.targetActorId ?? '—'}</td>
              <td>
                {#if reactAt === null}
                  —
                {:else}
                  <span class:active={combat.timeline.tick >= reactAt}>{reactAt}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="panel">
    <h2>Next decision</h2>
    <pre>{JSON.stringify({ decision, freeActors, nextTransition: nextT, pending: combat.pending }, null, 2)}</pre>
  </section>

  <section class="panel">
    <h2>Log</h2>
    <ol class="log">
      {#each log as entry}
        <li>{entry}</li>
      {/each}
    </ol>
  </section>
</main>
