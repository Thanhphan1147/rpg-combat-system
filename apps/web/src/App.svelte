<script lang="ts">
  import {
    canReactAt,
    CENTITICKS_PER_TICK,
    createCombat,
    getEffectiveStat,
    getFreeActors,
    getMaxHp,
    getPrompt,
    readTicks,
    scalePhases,
    step,
    Stat,
  } from '@rpg/engine'
  import type {
    ActorId,
    CombatLogEntry,
    CombatState,
    IncomingSkillInfo,
    Intent,
    Prompt,
    SkillId,
    TimelineSkill,
  } from '@rpg/engine'
  import { NARRATION, rollEncounter } from '@rpg/content'
  import type { Encounter } from '@rpg/content'

  const STAT_ROWS = [
    { key: Stat.MaxHp, label: 'max hp' },
    { key: Stat.Attack, label: 'attack' },
    { key: Stat.Defense, label: 'defense' },
    { key: Stat.Speed, label: 'speed' },
    { key: Stat.Reflex, label: 'reflex' },
    { key: Stat.Perception, label: 'perception' },
  ] as const

  function beginFight(excludeId?: string): { encounter: Encounter; combat: CombatState } {
    const encounter = rollEncounter(undefined, excludeId)
    const combat = createCombat({
      content: encounter.content,
      rules: encounter.rules,
      combatants: encounter.combatants,
    })
    return { encounter, combat }
  }

  const opening = beginFight()
  let encounter = $state<Encounter>(opening.encounter)
  let combat = $state<CombatState>(opening.combat)
  let logElement = $state<HTMLElement>()
  let debug = $state(false)

  const prompt = $derived.by(() => getPrompt(combat))
  const ended = $derived.by(() => combat.outcome.status === 'ended')
  const freeActors = $derived.by(() => getFreeActors(combat))
  const playerHasInitiative = $derived.by(() => {
    const player = actorIdForSide('player')
    const enemy = actorIdForSide('enemy')
    if (player === undefined || enemy === undefined) {
      return false
    }
    return (
      getEffectiveStat(combat, player, Stat.Speed) >=
      getEffectiveStat(combat, enemy, Stat.Speed)
    )
  })
  const narration = $derived.by(() => {
    const preamble = [encounter.narration.opening]
    const initiative = playerHasInitiative
      ? encounter.narration.playerInitiative
      : encounter.narration.enemyInitiative
    if (initiative.length > 0) {
      preamble.push(initiative)
    }
    const events = combat.log
      .filter((entry) => entry.event.kind !== 'combatStart')
      .flatMap((entry) => narrate(entry).split('\n'))
      .filter((line) => line.length > 0)
    return [...preamble, ...events]
  })

  const timelineWindow = $derived.by(() => {
    const ticks = [combat.timeline.tick]
    for (const skill of combat.timeline.active) {
      const span = skillSpan(skill)
      ticks.push(skill.startedAt, span.startupEnd, span.connectAt, span.end)
    }
    const start = Math.min(...ticks)
    const end = Math.max(...ticks, combat.timeline.tick + CENTITICKS_PER_TICK * 4)
    return { start, end: end <= start ? start + 1 : end }
  })

  $effect(() => {
    combat.log.length
    if (logElement) {
      logElement.scrollTop = logElement.scrollHeight
    }
  })

  function actorName(id: ActorId): string {
    const actor = combat.actors[id]
    return actor ? (combat.content.characters[actor.characterId]?.name ?? id) : id
  }

  function skillName(id: SkillId): string {
    return combat.content.skills[id]?.name ?? id
  }

  function actorIdForSide(side: 'player' | 'enemy'): ActorId | undefined {
    return combat.roster.find((id) => combat.actors[id]?.side === side)
  }

  function isPlayer(id: ActorId): boolean {
    return combat.actors[id]?.side === 'player'
  }

  function isEnemy(id: ActorId): boolean {
    return combat.actors[id]?.side === 'enemy'
  }

  function subject(id: ActorId): string {
    return `The ${actorName(id)}`
  }

  function object(id: ActorId): string {
    return `the ${actorName(id)}`
  }

  function fill(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
  }

  function describeIncoming(attackerId: ActorId, skillId: SkillId): string {
    const skill = combat.content.skills[skillId]
    if (skill === undefined) {
      return fill(NARRATION.skillUsedEnemy, { actor: subject(attackerId), skill: skillId })
    }
    const observer = combat.roster.find((id) => id !== attackerId)
    if (observer === undefined) {
      return fill(NARRATION.skillUsedEnemy, { actor: subject(attackerId), skill: skill.name })
    }
    const perception = getEffectiveStat(combat, observer, Stat.Perception)
    const readable =
      readTicks(perception, combat.rules) <= scalePhases(combat, attackerId, skill).startup
    return readable
      ? fill(NARRATION.skillUsedEnemy, { actor: subject(attackerId), skill: skill.name })
      : skill.vagueDescription
  }

  function skillSpan(skill: TimelineSkill): {
    startupEnd: number
    connectAt: number
    end: number
  } {
    const startupEnd = skill.startedAt + skill.startupTicks
    const connectAt = startupEnd + skill.deliveryTicks
    return { startupEnd, connectAt, end: skill.endingEndsAt }
  }

  function pct(tick: number): number {
    const { start, end } = timelineWindow
    return Math.max(0, Math.min(100, ((tick - start) / (end - start)) * 100))
  }

  function reactionMarker(skill: TimelineSkill): number | null {
    if (skill.resolved || skill.reactingToInstanceId !== null) {
      return null
    }
    const definition = combat.content.skills[skill.skillId]
    if (definition?.kind !== 'attack') {
      return null
    }
    const reactor = combat.roster.find((id) => id !== skill.actorId)
    if (reactor === undefined) {
      return null
    }
    return canReactAt(combat, reactor, skill)
  }

  function narrate(entry: CombatLogEntry): string {
    const { event } = entry
    switch (event.kind) {
      case 'combatStart':
        return ''
      case 'skillUsed':
        return isPlayer(event.actorId)
          ? fill(NARRATION.skillUsedPlayer, { skill: skillName(event.skillId) })
          : describeIncoming(event.actorId, event.skillId)
      case 'reactionUsed':
        return isPlayer(event.actorId)
          ? fill(NARRATION.reactionUsedPlayer, { skill: skillName(event.skillId) })
          : fill(NARRATION.reactionUsedEnemy, {
              actor: subject(event.actorId),
              skill: skillName(event.skillId),
            })
      case 'hit': {
        const flavor = combat.content.skills[event.skillId]?.hitFlavor ?? ''
        if (isPlayer(event.targetActorId)) {
          const line =
            flavor.length > 0
              ? flavor
              : fill(NARRATION.hitPlayerFallback, {
                  actor: subject(event.actorId),
                  skill: skillName(event.skillId),
                })
          return `${line}\n${fill(NARRATION.systemDamage, { damage: String(event.damage) })}`
        }
        return flavor.length > 0
          ? flavor
          : fill(NARRATION.hitEnemyFallback, {
              skill: skillName(event.skillId),
              target: object(event.targetActorId),
            })
      }
      case 'blocked':
        return isPlayer(event.targetActorId)
          ? fill(NARRATION.blockedPlayer, { skill: skillName(event.skillId) })
          : fill(NARRATION.blockedEnemy, {
              actor: subject(event.targetActorId),
              skill: skillName(event.skillId),
            })
      case 'dodged':
        return isPlayer(event.targetActorId)
          ? fill(NARRATION.dodgedPlayer, { skill: skillName(event.skillId) })
          : fill(NARRATION.dodgedEnemy, {
              actor: subject(event.targetActorId),
              skill: skillName(event.skillId),
            })
      case 'parried':
        return isPlayer(event.targetActorId)
          ? fill(NARRATION.parriedPlayer, { skill: skillName(event.skillId) })
          : fill(NARRATION.parriedEnemy, {
              actor: subject(event.targetActorId),
              skill: skillName(event.skillId),
            })
      case 'interrupted':
        return isPlayer(event.byActorId)
          ? fill(NARRATION.interruptedByPlayer, {
              skill: skillName(event.bySkillId),
              target: object(event.actorId),
              targetSkill: skillName(event.skillId),
            })
          : fill(NARRATION.interruptedByEnemy, {
              actor: subject(event.byActorId),
              skill: skillName(event.bySkillId),
              targetSkill: skillName(event.skillId),
            })
      case 'staggered':
        return isPlayer(event.actorId)
          ? NARRATION.staggeredPlayer
          : fill(NARRATION.staggeredEnemy, { actor: subject(event.actorId) })
      case 'armored':
        return isPlayer(event.actorId)
          ? fill(NARRATION.armoredPlayer, { skill: skillName(event.skillId) })
          : fill(NARRATION.armoredEnemy, {
              actor: subject(event.actorId),
              skill: skillName(event.skillId),
            })
      case 'unreactable':
        return isPlayer(event.targetActorId)
          ? encounter.narration.tooFastPlayer
          : encounter.narration.tooFastEnemy
      case 'combatEnd': {
        const enemy = actorIdForSide('enemy')
        return isPlayer(event.winner)
          ? fill(NARRATION.victory, { enemy: enemy ? subject(enemy) : 'The goblin' })
          : NARRATION.defeat
      }
    }
  }

  function chooseGoblinIntent(current: Prompt): Intent {
    if (current.kind === 'commit') {
      return { kind: 'commit' }
    }
    if (current.kind === 'reaction') {
      const candidates = current.options
        .filter(
          (option) =>
            option.kind === 'block' || option.kind === 'dodge' || option.kind === 'parry',
        )
        .map((option) => {
          const definition = combat.content.skills[option.skillId]
          if (definition === undefined) {
            return { option, connectsAt: Number.POSITIVE_INFINITY }
          }
          const durations = scalePhases(combat, current.actorId, definition)
          return {
            option,
            connectsAt: combat.timeline.tick + durations.startup + durations.delivery,
          }
        })
        .filter((candidate) => candidate.connectsAt <= current.incoming.connectAt)
        .sort((a, b) => a.connectsAt - b.connectsAt)
      const best = candidates[0]
      return best ? { kind: 'react', skillId: best.option.skillId } : { kind: 'pass' }
    }
    const attacks = current.options.filter((option) => option.kind === 'attack')
    const pool = attacks.length > 0 ? attacks : current.options
    const choice = pool[Math.floor(Math.random() * pool.length)]
    return choice ? { kind: 'act', skillId: choice.skillId } : { kind: 'pass' }
  }

  function autoPlay(): void {
    let safety = 0
    while (safety < 200) {
      safety += 1
      const current = getPrompt(combat)
      if (current === null || !isEnemy(current.actorId)) {
        return
      }
      combat = step(combat, chooseGoblinIntent(current))
    }
  }

  function act(skillId: SkillId): void {
    try {
      combat = step(combat, { kind: 'act', skillId })
      autoPlay()
    } catch (error) {
      console.error(error)
    }
  }

  function react(skillId: SkillId): void {
    try {
      combat = step(combat, { kind: 'react', skillId })
      autoPlay()
    } catch (error) {
      console.error(error)
    }
  }

  function takeIt(): void {
    try {
      combat = step(combat, { kind: 'pass' })
      autoPlay()
    } catch (error) {
      console.error(error)
    }
  }

  function keepCommitting(): void {
    try {
      combat = step(combat, { kind: 'commit' })
      autoPlay()
    } catch (error) {
      console.error(error)
    }
  }

  function reset(): void {
    const next = beginFight(encounter.id)
    encounter = next.encounter
    combat = next.combat
    autoPlay()
  }

  function formatTick(value: number): string {
    return (value / CENTITICKS_PER_TICK).toFixed(1)
  }

  function incomingLine(current: { incoming: IncomingSkillInfo }): string {
    const skill = current.incoming.skillId
    const identified = current.incoming.identified
    const description = identified
      ? (combat.content.skills[skill]?.preciseDescription ?? '')
      : (combat.content.skills[skill]?.vagueDescription ?? 'Something is coming.')
    return fill(identified ? NARRATION.identifiedPrefix : NARRATION.vaguePrefix, {
      description,
    })
  }
</script>

<button class="debug-toggle" class:active={debug} onclick={() => (debug = !debug)}>
  debug
</button>

<main class="story">
  {#if debug}
    <section class="debug">
      <div class="debug-stats">
        {#each combat.roster as actorId}
          <div class="stat-card">
            <div class="stat-name">{actorName(actorId)}</div>
            <div class="stat-grid">
              <span>hp</span>
              <b>{combat.actors[actorId]?.runtime.hp} / {getMaxHp(combat, actorId)}</b>
              {#each STAT_ROWS as row (row.key)}
                <span>{row.label}</span>
                <b>{getEffectiveStat(combat, actorId, row.key)}</b>
              {/each}
            </div>
            <div class="status">
              {freeActors.includes(actorId) ? 'free' : 'busy'}
              · hitstun {formatTick(combat.actors[actorId]?.runtime.hitstunUntil ?? 0)}
              · stagger {formatTick(combat.actors[actorId]?.runtime.staggeredUntil ?? 0)}
            </div>
          </div>
        {/each}
      </div>

      <div class="timeline">
        <div class="timeline-head">timeline · tick {formatTick(combat.timeline.tick)}</div>
        {#each combat.timeline.active as skill (skill.instanceId)}
          {@const span = skillSpan(skill)}
          {@const marker = reactionMarker(skill)}
          <div class="tl-row">
            <span class="tl-label">{skill.actorId} · {skill.skillId}</span>
            <div class="tl-track">
              <div
                class="tl-seg tl-startup"
                style="left:{pct(skill.startedAt)}%; width:{pct(span.startupEnd) - pct(skill.startedAt)}%"
              ></div>
              <div
                class="tl-seg tl-delivery"
                style="left:{pct(span.startupEnd)}%; width:{pct(span.connectAt) - pct(span.startupEnd)}%"
              ></div>
              <div
                class="tl-seg tl-ending"
                style="left:{pct(span.connectAt)}%; width:{pct(span.end) - pct(span.connectAt)}%"
              ></div>
              {#if marker !== null}
                <div class="tl-react" style="left:{pct(marker)}%"></div>
              {/if}
              <div class="tl-now" style="left:{pct(combat.timeline.tick)}%"></div>
            </div>
          </div>
        {/each}
        {#if combat.timeline.active.length === 0}
          <p class="tl-empty">no active skills</p>
        {/if}
      </div>
    </section>
  {/if}

  <section class="narration" bind:this={logElement}>
    {#each narration as line}
      <p class:system={line.startsWith('[')}>{line}</p>
    {/each}
  </section>

  <section class="prompt">
    {#if ended}
      <button onclick={reset}>Fight again</button>
    {:else if prompt !== null}
      {#if !isPlayer(prompt.actorId)}
        <button onclick={autoPlay}>Continue</button>
      {:else if prompt.kind === 'action'}
        <div class="options">
          {#each prompt.options as option (option.skillId)}
            <button onclick={() => act(option.skillId)}>{option.label}</button>
          {/each}
        </div>
      {:else if prompt.kind === 'commit'}
        <p class="incoming">{incomingLine(prompt)}</p>
        <div class="options">
          {#each prompt.options as option (option.skillId)}
            <button onclick={() => react(option.skillId)}>{option.label}</button>
          {/each}
          <button class="ghost" onclick={keepCommitting}>Keep committing</button>
        </div>
      {:else}
        <p class="incoming">{incomingLine(prompt)}</p>
        <div class="options">
          {#each prompt.options as option (option.skillId)}
            <button onclick={() => react(option.skillId)}>{option.label}</button>
          {/each}
          <button class="ghost" onclick={takeIt}>Take it</button>
        </div>
      {/if}
    {/if}
  </section>
</main>
