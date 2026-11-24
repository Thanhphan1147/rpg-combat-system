<script lang="ts">
  import {
    canReactAt,
    createCombat,
    getEffectiveStat,
    getFreeActors,
    getMaxHp,
    getPrompt,
    step,
    Stat,
  } from '@rpg/engine'
  import type {
    ActorId,
    CombatLogEntry,
    CombatState,
    Intent,
    Prompt,
    ReactionPrompt,
    SkillId,
    TimelineSkill,
  } from '@rpg/engine'
  import { rollGoblinEncounter } from '@rpg/content'

  const PLAYER = 'wanderer'
  const GOBLIN = 'goblin'

  const STAT_ROWS = [
    { key: Stat.MaxHp, label: 'max hp' },
    { key: Stat.Attack, label: 'attack' },
    { key: Stat.Defense, label: 'defense' },
    { key: Stat.Speed, label: 'speed' },
    { key: Stat.Reflex, label: 'reflex' },
    { key: Stat.Perception, label: 'perception' },
  ] as const

  function fresh(): CombatState {
    const encounter = rollGoblinEncounter()
    return createCombat({
      content: encounter.content,
      rules: encounter.rules,
      combatants: encounter.combatants,
    })
  }

  let combat = $state<CombatState>(fresh())
  let logElement = $state<HTMLElement>()
  let debug = $state(false)

  const prompt = $derived.by(() => getPrompt(combat))
  const ended = $derived.by(() => combat.outcome.status === 'ended')
  const freeActors = $derived.by(() => getFreeActors(combat))
  const narration = $derived.by(() =>
    combat.log
      .filter((entry) => entry.event.kind !== 'combatStart')
      .map((entry) => narrate(entry))
      .filter((line) => line.length > 0),
  )

  const timelineWindow = $derived.by(() => {
    const ticks = [combat.timeline.tick]
    for (const skill of combat.timeline.active) {
      const span = skillSpan(skill)
      ticks.push(skill.startedAt, span.startupEnd, span.connectAt, span.end)
    }
    const start = Math.min(...ticks)
    const end = Math.max(...ticks, combat.timeline.tick + 4)
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

  function skillSpan(skill: TimelineSkill): {
    startupEnd: number
    connectAt: number
    end: number
  } {
    const definition = combat.content.skills[skill.skillId]
    const startupEnd = skill.startedAt + (definition?.startup ?? 0)
    const connectAt = startupEnd + (definition?.delivery ?? 0)
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
        return event.actorId === PLAYER
          ? `You commit to a ${skillName(event.skillId)}.`
          : `The ${actorName(event.actorId)} winds up a ${skillName(event.skillId)}.`
      case 'reactionUsed':
        return event.actorId === PLAYER
          ? `You answer with a ${skillName(event.skillId)}.`
          : `The ${actorName(event.actorId)} answers with a ${skillName(event.skillId)}.`
      case 'hit':
        return event.targetActorId === PLAYER
          ? `The ${actorName(event.actorId)}'s ${skillName(event.skillId)} catches you for ${event.damage}.`
          : `Your ${skillName(event.skillId)} bites into the ${actorName(event.targetActorId)} for ${event.damage}.`
      case 'blocked':
        if (event.complete) {
          return event.targetActorId === PLAYER
            ? `You turn the ${skillName(event.skillId)} aside on your guard.`
            : `The ${actorName(event.targetActorId)} blocks your ${skillName(event.skillId)} cleanly.`
        }
        return event.targetActorId === PLAYER
          ? `Your guard comes a beat late — ${event.damage} gets through.`
          : `The ${actorName(event.targetActorId)}'s guard is late — ${event.damage} gets through.`
      case 'dodged':
        return event.targetActorId === PLAYER
          ? `You slip aside from the ${skillName(event.skillId)}.`
          : `The ${actorName(event.targetActorId)} slips aside from your ${skillName(event.skillId)}.`
      case 'parried':
        return event.targetActorId === PLAYER
          ? `You parry the ${skillName(event.skillId)} with a sharp turn of the wrist.`
          : `The ${actorName(event.targetActorId)} parries your ${skillName(event.skillId)}.`
      case 'countered': {
        const reader = event.actorId === PLAYER ? 'You read' : `The ${actorName(event.actorId)} reads`
        const verb = event.actorId === PLAYER ? 'counter' : 'counters'
        const clean = event.clean ? ' — a clean read!' : ''
        return `${reader} the ${skillName(event.targetSkillId)} and ${verb} for ${event.damage}${clean}.`
      }
      case 'staggered':
        return event.actorId === PLAYER
          ? 'You stagger, reeling.'
          : `The ${actorName(event.actorId)} staggers, reeling.`
      case 'combatEnd':
        return event.winner === PLAYER
          ? 'The goblin folds to the wet stones and moves no more.'
          : 'Your knees give way. The dark closes in.'
    }
  }

  function chooseGoblinIntent(current: Prompt): Intent {
    if (current.kind === 'reaction') {
      const guard = current.options.find((option) => option.kind === 'block')
      return guard ? { kind: 'react', skillId: guard.skillId } : { kind: 'pass' }
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
      if (current === null || current.actorId !== GOBLIN) {
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

  function reset(): void {
    combat = fresh()
    autoPlay()
  }

  function incomingLine(current: ReactionPrompt): string {
    const skill = current.incoming.skillId
    if (current.incoming.identified) {
      const precise = combat.content.skills[skill]?.preciseDescription ?? ''
      return `You read the windup. ${precise}`
    }
    const vague = combat.content.skills[skill]?.vagueDescription ?? 'Something is coming.'
    return `You catch only a glimpse: ${vague}`
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
              · hitstun {combat.actors[actorId]?.runtime.hitstunUntil}
              · stagger {combat.actors[actorId]?.runtime.staggeredUntil}
            </div>
          </div>
        {/each}
      </div>

      <div class="timeline">
        <div class="timeline-head">timeline · tick {combat.timeline.tick}</div>
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
      <p>{line}</p>
    {/each}
  </section>

  <section class="prompt">
    {#if ended}
      <button onclick={reset}>Fight again</button>
    {:else if prompt !== null}
      {#if prompt.actorId !== PLAYER}
        <button onclick={autoPlay}>Continue</button>
      {:else if prompt.kind === 'action'}
        <div class="options">
          {#each prompt.options as option (option.skillId)}
            <button onclick={() => act(option.skillId)}>{option.label}</button>
          {/each}
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
