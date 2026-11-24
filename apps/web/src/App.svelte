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
    StatBlock,
    TimelineSkill,
  } from '@rpg/engine'
  import { NARRATION, rollEncounter } from '@rpg/content'
  import {
    applyVictory,
    buildPlayer,
    createRun,
    EQUIPMENT_SLOTS,
    equipItem,
    loadEssence,
    unequipItem,
    unloadEssence,
    xpForNextLevel,
  } from '@rpg/content'
  import type { Encounter, EquipmentSlot, Essence, RunState } from '@rpg/content'

  const STAT_ROWS = [
    { key: Stat.MaxHp, label: 'max hp' },
    { key: Stat.Attack, label: 'attack' },
    { key: Stat.Defense, label: 'defense' },
    { key: Stat.Speed, label: 'speed' },
    { key: Stat.Reflex, label: 'reflex' },
    { key: Stat.Perception, label: 'perception' },
  ] as const

  const initialRun = createRun()
  let run = $state<RunState>(initialRun)
  let awarded = $state(false)
  let selectedEssenceId = $state<string | null>(null)
  let lastEssence = $state<Essence | null>(null)

  function beginFight(
    currentRun: RunState,
    excludeId?: string,
  ): { encounter: Encounter; combat: CombatState } {
    const encounter = rollEncounter({
      excludeId,
      player: buildPlayer(currentRun),
      level: currentRun.level,
    })
    const combat = createCombat({
      content: encounter.content,
      rules: encounter.rules,
      combatants: encounter.combatants,
    })
    return { encounter, combat }
  }

  const opening = beginFight(initialRun)
  let encounter = $state<Encounter>(opening.encounter)
  let combat = $state<CombatState>(opening.combat)
  let logElement = $state<HTMLElement>()
  let debug = $state(false)

  const prompt = $derived.by(() => getPrompt(combat))
  const ended = $derived.by(() => combat.outcome.status === 'ended')
  const victory = $derived.by(() => {
    if (combat.outcome.status !== 'ended') {
      return false
    }
    const player = actorIdForSide('player')
    return player !== undefined && combat.outcome.winner === player
  })
  const xpPercent = $derived.by(() => {
    const needed = xpForNextLevel(run.level)
    return needed > 0 ? Math.min(100, (run.xp / needed) * 100) : 0
  })
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
    for (const item of encounter.loot) {
      preamble.push(`The enemy wears ${item.name}. ${item.flavor}`)
    }
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

  $effect(() => {
    if (!victory || awarded) {
      return
    }
    awarded = true
    const before = run.essences.length
    const next = applyVictory(run, {
      archetypeId: encounter.id,
      equipment: encounter.loot,
    })
    lastEssence = next.essences.length > before ? (next.essences[before] ?? null) : null
    run = next
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

  function keepFighting(): void {
    awarded = false
    selectedEssenceId = null
    lastEssence = null
    const next = beginFight(run, encounter.id)
    encounter = next.encounter
    combat = next.combat
    autoPlay()
  }

  function newRun(): void {
    run = createRun()
    awarded = false
    selectedEssenceId = null
    lastEssence = null
    const next = beginFight(run)
    encounter = next.encounter
    combat = next.combat
    autoPlay()
  }

  function selectEssence(id: string): void {
    selectedEssenceId = selectedEssenceId === id ? null : id
  }

  function onSlot(index: number): void {
    if (selectedEssenceId !== null) {
      run = loadEssence(run, selectedEssenceId, index)
      selectedEssenceId = null
      return
    }
    run = unloadEssence(run, index)
  }

  function equipGear(itemId: string): void {
    run = equipItem(run, itemId)
  }

  function unequipGear(slot: EquipmentSlot): void {
    run = unequipItem(run, slot)
  }

  function buffLine(buffs: Partial<StatBlock>): string {
    return STAT_ROWS.filter((row) => (buffs[row.key] ?? 0) !== 0)
      .map((row) => `+${buffs[row.key] ?? 0} ${row.label}`)
      .join(' · ')
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
  <div class="run-bar">
    <span class="run-level">level {run.level}</span>
    <div class="xp-track"><div class="xp-fill" style="width:{xpPercent}%"></div></div>
    <span class="run-xp">{run.xp} / {xpForNextLevel(run.level)} xp</span>
    <span class="run-slots">{run.slots.length} slot{run.slots.length === 1 ? '' : 's'}</span>
  </div>

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
      {#if victory}
        <section class="meta">
          <div class="meta-head">
            <span>victory</span>
            <span>level {run.level}</span>
          </div>

          {#if encounter.loot.length > 0}
            <p class="meta-line">
              Spoils: {encounter.loot.map((item) => item.name).join(', ')}.
            </p>
          {:else}
            <p class="hint">Nothing worth stripping from this one.</p>
          {/if}
          {#if lastEssence}
            <p class="meta-line">
              An essence drops: {lastEssence.name} (grants {skillName(lastEssence.skillId)}).
            </p>
          {:else}
            <p class="hint">No essence this time.</p>
          {/if}

          <div class="slots">
            {#each EQUIPMENT_SLOTS as slot (slot)}
              <button
                class="slot"
                class:filled={run.gear[slot] !== null}
                onclick={() => unequipGear(slot)}
              >
                <span class="slot-label">{slot}</span>
                {#if run.gear[slot]}
                  <span class="slot-essence">{run.gear[slot].name}</span>
                  <span class="slot-flavor">{run.gear[slot].flavor}</span>
                {:else}
                  <span class="slot-empty">empty</span>
                {/if}
              </button>
            {/each}
          </div>

          <div class="inventory">
            <div class="inventory-head">equipment</div>
            {#if run.items.length === 0}
              <p class="empty">No spare equipment.</p>
            {:else}
              {#each run.items as item (item.id)}
                <button class="essence" onclick={() => equipGear(item.id)}>
                  <span class="essence-name">
                    {item.name}
                    <span class="slot-tag">{item.slot}</span>
                  </span>
                  <span class="equipment-flavor">{item.flavor}</span>
                </button>
              {/each}
            {/if}
            <p class="hint">Click equipment to equip it. Click a filled slot to remove it.</p>
          </div>

          <div class="slots">
            {#each run.slots as slot, index (index)}
              <button
                class="slot"
                class:filled={slot !== null}
                class:target={selectedEssenceId !== null}
                onclick={() => onSlot(index)}
              >
                <span class="slot-label">essence slot {index + 1}</span>
                {#if slot}
                  <span class="slot-essence">{slot.name}</span>
                  <span class="slot-buffs">{buffLine(slot.buffs)}</span>
                  <span class="slot-skill">grants {skillName(slot.skillId)}</span>
                {:else}
                  <span class="slot-empty">empty</span>
                {/if}
              </button>
            {/each}
          </div>

          <div class="inventory">
            <div class="inventory-head">essence reserve</div>
            {#if run.essences.length === 0}
              <p class="empty">Nothing in reserve.</p>
            {:else}
              {#each run.essences as essence (essence.id)}
                <button
                  class="essence"
                  class:selected={selectedEssenceId === essence.id}
                  onclick={() => selectEssence(essence.id)}
                >
                  <span class="essence-name">{essence.name}</span>
                  <span class="essence-buffs">{buffLine(essence.buffs)}</span>
                  <span class="essence-skill">grants {skillName(essence.skillId)}</span>
                </button>
              {/each}
            {/if}
            {#if selectedEssenceId !== null}
              <p class="hint">Choose an essence slot to load it. Click it again to cancel.</p>
            {:else if run.slots.some((slot) => slot !== null)}
              <p class="hint">Click a filled essence slot to unload it.</p>
            {/if}
          </div>

          <div class="meta-actions">
            <button onclick={keepFighting}>Keep fighting</button>
            <button class="ghost" onclick={newRun}>New run</button>
          </div>
        </section>
      {:else}
        <section class="meta">
          <div class="meta-head">
            <span>run over</span>
            <span>level {run.level}</span>
          </div>
          <p class="meta-line">The wanderer falls. The run ends here.</p>
          <div class="meta-actions">
            <button onclick={newRun}>New run</button>
          </div>
        </section>
      {/if}
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
