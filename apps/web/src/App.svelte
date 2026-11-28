<script lang="ts">
  import { untrack } from 'svelte'
  import {
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
    Intent,
    Prompt,
    SkillId,
    StatBlock,
  } from '@rpg/engine'
  import { NARRATION, rollEncounter } from '@rpg/content'
  import {
    applyVictory,
    buildPlayer,
    createRun,
    EQUIPMENT_SLOTS,
    findPlayerClass,
    equipItem,
    fillTemplate,
    loadEssence,
    PLAYER_CLASSES,
    unequipItem,
    unloadEssence,
    xpForNextLevel,
  } from '@rpg/content'
  import type { Encounter, EquipmentSlot, Essence, PlayerClassId, RunState } from '@rpg/content'

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
  let started = $state(false)
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
  let revealedCount = $state(0)
  let fightSerial = $state(0)
  let revealTimer: ReturnType<typeof setTimeout> | undefined
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const playerClass = $derived(findPlayerClass(run.classId))
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
    if (encounter.narration.gear.length > 0) {
      preamble.push(encounter.narration.gear)
    }
    if (encounter.narration.difficultFight.length > 0) {
      preamble.push(encounter.narration.difficultFight)
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

  interface TimelineOutcome {
    tick: number
    label: string
    kind: string
  }

  interface TimelineHistorySkill {
    key: string
    actorId: ActorId
    skillId: SkillId
    startedAt: number
    startupEnd: number
    connectAt: number
    endsAt: number
    targetActorId: ActorId | null
    incomingInstanceId: string | null
    active: boolean
    outcomes: TimelineOutcome[]
  }

  const timelineHistory = $derived.by((): TimelineHistorySkill[] => {
    const bars: TimelineHistorySkill[] = []
    combat.log.forEach((entry, index) => {
      const event = entry.event
      if (event.kind !== 'skillUsed' && event.kind !== 'reactionUsed') {
        return
      }
      const definition = combat.content.skills[event.skillId]
      if (definition === undefined) {
        return
      }
      const durations = scalePhases(combat, event.actorId, definition)
      const startedAt = entry.tick
      const startupEnd = startedAt + durations.startup
      const connectAt = startupEnd + durations.delivery
      const endsAt = connectAt + durations.ending
      bars.push({
        key: `history-${index}`,
        actorId: event.actorId,
        skillId: event.skillId,
        startedAt,
        startupEnd,
        connectAt,
        endsAt,
        targetActorId:
          definition.targeting === 'opponent'
            ? (combat.roster.find((id) => id !== event.actorId) ?? null)
            : null,
        incomingInstanceId:
          event.kind === 'reactionUsed' ? event.incomingInstanceId : null,
        active: combat.timeline.active.some(
          (skill) =>
            skill.actorId === event.actorId &&
            skill.skillId === event.skillId &&
            skill.startedAt === startedAt,
        ),
        outcomes: [],
      })
    })

    const latestBar = (
      actorId: ActorId,
      tick: number,
      skillId?: SkillId,
    ): TimelineHistorySkill | undefined => {
      let best: TimelineHistorySkill | undefined
      for (const bar of bars) {
        if (bar.actorId !== actorId || bar.startedAt > tick) {
          continue
        }
        if (skillId !== undefined && bar.skillId !== skillId) {
          continue
        }
        if (best === undefined || bar.startedAt > best.startedAt) {
          best = bar
        }
      }
      return best
    }

    const isDefensive = (bar: TimelineHistorySkill): boolean => {
      const kind = combat.content.skills[bar.skillId]?.kind
      return kind === 'block' || kind === 'dodge' || kind === 'parry'
    }

    const latestDefensiveBar = (
      actorId: ActorId,
      tick: number,
    ): TimelineHistorySkill | undefined => {
      let best: TimelineHistorySkill | undefined
      for (const bar of bars) {
        if (bar.actorId !== actorId || bar.startedAt > tick || !isDefensive(bar)) {
          continue
        }
        if (best === undefined || bar.startedAt > best.startedAt) {
          best = bar
        }
      }
      return best
    }

    for (const entry of combat.log) {
      const event = entry.event
      switch (event.kind) {
        case 'hit': {
          const bar = latestBar(event.actorId, entry.tick, event.skillId)
          bar?.outcomes.push({
            tick: entry.tick,
            label: `HIT ${event.damage}`,
            kind: 'hit',
          })
          break
        }
        case 'blocked':
        case 'dodged':
        case 'parried': {
          const attackerBar = latestBar(event.actorId, entry.tick, event.skillId)
          attackerBar?.outcomes.push({
            tick: entry.tick,
            label: event.kind.toUpperCase(),
            kind: event.kind,
          })
          const defenderBar = latestDefensiveBar(event.targetActorId, entry.tick)
          if (
            defenderBar !== undefined &&
            defenderBar !== attackerBar &&
            isDefensive(defenderBar)
          ) {
            defenderBar.outcomes.push({
              tick: entry.tick,
              label: event.kind.toUpperCase(),
              kind: event.kind,
            })
          }
          break
        }
        case 'interrupted': {
          const victimBar = latestBar(event.actorId, entry.tick, event.skillId)
          victimBar?.outcomes.push({
            tick: entry.tick,
            label: 'INTERRUPTED',
            kind: 'interrupted',
          })
          const interrupterBar = latestBar(event.byActorId, entry.tick, event.bySkillId)
          interrupterBar?.outcomes.push({
            tick: entry.tick,
            label: 'INTERRUPT',
            kind: 'interrupted',
          })
          break
        }
        case 'armored': {
          const bar = latestBar(event.actorId, entry.tick, event.skillId)
          bar?.outcomes.push({
            tick: entry.tick,
            label: 'ARMORED',
            kind: 'armored',
          })
          break
        }
        case 'unreactable': {
          const bar = latestBar(event.actorId, entry.tick, event.skillId)
          bar?.outcomes.push({
            tick: entry.tick,
            label: 'NO REACTION',
            kind: 'unreactable',
          })
          break
        }
        case 'staggered': {
          const bar = latestBar(event.actorId, entry.tick)
          bar?.outcomes.push({
            tick: entry.tick,
            label: 'STAGGERED',
            kind: 'staggered',
          })
          break
        }
        case 'buffed': {
          const bar = latestBar(event.actorId, entry.tick, event.skillId)
          bar?.outcomes.push({
            tick: entry.tick,
            label: 'BUFF',
            kind: 'buffed',
          })
          break
        }
        case 'healed': {
          const bar = latestBar(event.actorId, entry.tick, event.skillId)
          bar?.outcomes.push({
            tick: entry.tick,
            label: `HEAL ${event.amount}`,
            kind: 'healed',
          })
          break
        }
        default:
          break
      }
    }

    return bars
  })

  const historyWindow = $derived.by(() => {
    const ticks = [0, combat.timeline.tick]
    for (const bar of timelineHistory) {
      ticks.push(bar.startedAt, bar.startupEnd, bar.connectAt, bar.endsAt)
      for (const outcome of bar.outcomes) {
        ticks.push(outcome.tick)
      }
    }
    const end = Math.max(...ticks, CENTITICKS_PER_TICK)
    return { start: 0, end: end + CENTITICKS_PER_TICK / 2 }
  })

  function revealNarration(target: number): void {
    if (revealTimer !== undefined) {
      clearTimeout(revealTimer)
      revealTimer = undefined
    }
    const start = revealedCount
    if (target <= start) {
      return
    }
    if (reduceMotion) {
      revealedCount = target
      return
    }

    const pending = target - start
    const duration = Math.min(850, Math.max(160, pending * 70))
    const tickMs = 80
    const ticks = Math.max(1, Math.ceil(duration / tickMs))
    const step = Math.ceil(pending / ticks)

    const tick = (): void => {
      revealedCount = Math.min(target, revealedCount + step)
      if (revealedCount < target) {
        revealTimer = setTimeout(tick, tickMs)
      } else {
        revealTimer = undefined
      }
    }

    tick()
  }

  $effect(() => {
    fightSerial
    const target = narration.length
    untrack(() => {
      if (target > revealedCount) {
        revealNarration(target)
      }
    })
    return () => {
      if (revealTimer !== undefined) {
        clearTimeout(revealTimer)
        revealTimer = undefined
      }
    }
  })

  $effect(() => {
    combat.log.length
    revealedCount
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
    return fillTemplate(template, values)
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

  function pct(tick: number): number {
    const { start, end } = historyWindow
    return Math.max(0, Math.min(100, ((tick - start) / (end - start)) * 100))
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
      case 'buffed':
        return isPlayer(event.actorId)
          ? fill(NARRATION.buffedPlayer, { skill: skillName(event.skillId) })
          : fill(NARRATION.buffedEnemy, {
              actor: subject(event.actorId),
              skill: skillName(event.skillId),
            })
      case 'healed':
        return isPlayer(event.actorId)
          ? fill(NARRATION.healedPlayer, { amount: String(event.amount) })
          : fill(NARRATION.healedEnemy, {
              actor: subject(event.actorId),
              amount: String(event.amount),
            })
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
    fightSerial += 1
    revealedCount = 0
    const next = beginFight(run, encounter.id)
    encounter = next.encounter
    combat = next.combat
    autoPlay()
  }

  function startRun(classId: PlayerClassId): void {
    run = createRun(classId)
    started = true
    awarded = false
    selectedEssenceId = null
    lastEssence = null
    fightSerial += 1
    revealedCount = 0
    const next = beginFight(run)
    encounter = next.encounter
    combat = next.combat
    autoPlay()
  }

  function newRun(): void {
    started = false
    awarded = true
    selectedEssenceId = null
    lastEssence = null
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

  function rarityLabel(rarity: string): string {
    return rarity.length > 0 ? rarity[0]!.toUpperCase() + rarity.slice(1) : rarity
  }

  function buffLine(buffs: Partial<StatBlock>): string {
    return STAT_ROWS.filter((row) => (buffs[row.key] ?? 0) !== 0)
      .map((row) => `+${buffs[row.key] ?? 0} ${row.label}`)
      .join(' · ')
  }

  function formatTick(value: number): string {
    return (value / CENTITICKS_PER_TICK).toFixed(1)
  }
</script>

{#if started}
  <button class="debug-toggle" class:active={debug} onclick={() => (debug = !debug)}>
    debug
  </button>
{/if}

<main class="story">
  {#if !started}
    <section class="class-select">
      <div class="class-title">
        <h1>Choose your class</h1>
        <p>Every run begins with one art beside the basic strike.</p>
      </div>
      <div class="class-grid">
        {#each PLAYER_CLASSES as entry (entry.id)}
          <button class="class-card" onclick={() => startRun(entry.id)}>
            <span class="class-name">{entry.name}</span>
            <span class="class-desc">{entry.description}</span>
            <span class="class-kit">
              {entry.skillIds.map((skillId) => skillName(skillId)).join(' · ')}
            </span>
            <span class="class-start">begin run</span>
          </button>
        {/each}
      </div>
    </section>
  {:else}
  <div class="run-bar">
    <span class="run-class">{playerClass.name}</span>
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
              {#if combat.actors[actorId]?.runtime.buffs.some((buff) => buff.expiresAt > combat.timeline.tick)}
                · buffs {combat.actors[actorId]?.runtime.buffs
                  .filter((buff) => buff.expiresAt > combat.timeline.tick)
                  .map((buff) => `${skillName(buff.skillId)} ${formatTick(buff.expiresAt - combat.timeline.tick)}`)
                  .join(', ')}
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="history">
        <div class="timeline-head">
          <span>timeline history · now {formatTick(combat.timeline.tick)}</span>
          <span class="history-legend">
            <span class="legend-decision">◆ decision</span>
            <span class="legend-resolution">● resolution</span>
          </span>
        </div>
        <div class="history-columns">
          {#each combat.roster as actorId (actorId)}
            {@const actorBars = timelineHistory.filter((bar) => bar.actorId === actorId)}
            <div class="history-column">
              <div class="history-actor">{actorName(actorId)}</div>
              <div class="tl-lane">
                {#each actorBars as bar (bar.key)}
                  <div
                    class="tl-seg tl-startup"
                    style="left:{pct(bar.startedAt)}%; width:{pct(bar.startupEnd) - pct(bar.startedAt)}%"
                    title="{skillName(bar.skillId)} startup {formatTick(bar.startedAt)}–{formatTick(bar.startupEnd)}"
                  ></div>
                  <div
                    class="tl-seg tl-delivery"
                    style="left:{pct(bar.startupEnd)}%; width:{pct(bar.connectAt) - pct(bar.startupEnd)}%"
                    title="{skillName(bar.skillId)} delivery {formatTick(bar.startupEnd)}–{formatTick(bar.connectAt)}"
                  ></div>
                  <div
                    class="tl-seg tl-ending"
                    style="left:{pct(bar.connectAt)}%; width:{pct(bar.endsAt) - pct(bar.connectAt)}%"
                    title="{skillName(bar.skillId)} ending {formatTick(bar.connectAt)}–{formatTick(bar.endsAt)}"
                  ></div>
                  <div
                    class="tl-decision"
                    style="left:{pct(bar.startedAt)}%"
                    title="Decision: {skillName(bar.skillId)} @ {formatTick(bar.startedAt)}"
                  ></div>
                  {#each bar.outcomes as outcome, outcomeIndex (outcomeIndex)}
                    <div
                      class="tl-outcome tl-{outcome.kind}"
                      style="left:{pct(outcome.tick)}%"
                      title="{outcome.label} @ {formatTick(outcome.tick)}"
                    ></div>
                  {/each}
                {/each}
                <div
                  class="tl-now"
                  style="left:{pct(combat.timeline.tick)}%"
                  title="Current tick"
                ></div>
              </div>
              <div class="tl-events">
                {#each actorBars as bar (bar.key)}
                  <span class="tl-event tl-event-decision">
                    {formatTick(bar.startedAt)} {skillName(bar.skillId)}
                    {#if bar.targetActorId !== null}
                      → {actorName(bar.targetActorId)}
                    {/if}
                    {#if bar.incomingInstanceId !== null}
                      ← {bar.incomingInstanceId}
                    {/if}
                    {#if bar.active}
                      <span class="tl-active-badge">active</span>
                    {/if}
                  </span>
                  {#each bar.outcomes as outcome, outcomeIndex (outcomeIndex)}
                    <span class="tl-event tl-event-{outcome.kind}">
                      {outcome.label} @ {formatTick(outcome.tick)}
                    </span>
                  {/each}
                {/each}
                {#if actorBars.length === 0}
                  <p class="tl-empty">no actions yet</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <div class="stage">
    <section class="narration" bind:this={logElement}>
    {#key fightSerial}
      {#each narration.slice(0, revealedCount) as line, index (index)}
        <p class:system={line.startsWith('[')}>{line}</p>
      {/each}
    {/key}
  </section>

  <section class="prompt">
    <div class="prompt-inner">
    {#if ended}
      {#if victory}
        <section class="meta">
          <div class="meta-head">
            <span>victory</span>
            <span>level {run.level}</span>
          </div>

          {#if encounter.loot.length > 0}
            <p class="meta-line">
              {fill(NARRATION.spoils, {
                items: encounter.loot
                  .map(
                    (item) =>
                      `${rarityLabel(item.rarity)} ${item.name} (${buffLine(item.buffs)})`,
                  )
                  .join(', '),
              })}
            </p>
          {:else}
            <p class="hint">{NARRATION.noSpoils}</p>
          {/if}
          {#if lastEssence}
            <p class="meta-line">
              {fill(NARRATION.essenceDropped, {
                essence: lastEssence.name,
                skill: skillName(lastEssence.skillId),
              })}
            </p>
          {:else}
            <p class="hint">{NARRATION.noEssence}</p>
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
                  <span class="slot-essence">
                    {run.gear[slot].name}
                    <span class="rarity-tag rarity-{run.gear[slot].rarity}">
                      {rarityLabel(run.gear[slot].rarity)}
                    </span>
                  </span>
                  <span class="slot-buffs">{buffLine(run.gear[slot].buffs)}</span>
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
                    <span class="rarity-tag rarity-{item.rarity}">
                      {rarityLabel(item.rarity)}
                    </span>
                    <span class="slot-tag">{item.slot}</span>
                  </span>
                  <span class="essence-buffs">{buffLine(item.buffs)}</span>
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
          <p class="meta-line">{NARRATION.runOver}</p>
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
        <div class="options">
          {#each prompt.options as option (option.skillId)}
            <button onclick={() => react(option.skillId)}>{option.label}</button>
          {/each}
          <button class="ghost" onclick={keepCommitting}>Keep committing</button>
        </div>
      {:else}
        <div class="options">
          {#each prompt.options as option (option.skillId)}
            <button onclick={() => react(option.skillId)}>{option.label}</button>
          {/each}
          <button class="ghost" onclick={takeIt}>Take it</button>
        </div>
      {/if}
    {/if}
    </div>
  </section>
  </div>
  {/if}

</main>
