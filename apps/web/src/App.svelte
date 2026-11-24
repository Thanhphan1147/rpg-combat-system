<script lang="ts">
  import { createCombat, getPrompt, snapshot, step } from '@rpg/engine'
  import type {
    ActorId,
    CombatLogEntry,
    CombatState,
    Intent,
    Prompt,
    ReactionPrompt,
    SkillId,
  } from '@rpg/engine'
  import { goblinEncounter } from '@rpg/content'

  const PLAYER = 'wanderer'
  const GOBLIN = 'goblin'

  function fresh(): CombatState {
    return createCombat({
      content: goblinEncounter.content,
      rules: goblinEncounter.rules,
      combatants: goblinEncounter.combatants,
    })
  }

  let combat = $state<CombatState>(fresh())
  let logElement = $state<HTMLElement>()

  const prompt = $derived.by(() => getPrompt(combat))
  const view = $derived.by(() => snapshot(combat))
  const playerView = $derived.by(() => view.actors.find((actor) => actor.id === PLAYER))
  const goblinView = $derived.by(() => view.actors.find((actor) => actor.id === GOBLIN))
  const ended = $derived.by(() => combat.outcome.status === 'ended')
  const won = $derived.by(
    () => combat.outcome.status === 'ended' && combat.outcome.winner === PLAYER,
  )

  const narration = $derived.by(() =>
    combat.log.map((entry) => narrate(entry)).filter((line) => line.length > 0),
  )

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

  function narrate(entry: CombatLogEntry): string {
    const { event } = entry
    switch (event.kind) {
      case 'combatStart':
        return goblinEncounter.intro
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

  function health(actor: { hp: number; maxHp: number } | undefined): string {
    return actor ? `${actor.hp} / ${actor.maxHp}` : '—'
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

<main class="story">
  <header class="masthead">
    <h1>{goblinEncounter.title}</h1>
    <div class="bars">
      <div class="fighter">
        <span>{playerView?.name ?? 'You'}</span>
        <span class="hp">{health(playerView)}</span>
      </div>
      <div class="fighter">
        <span>{goblinView?.name ?? 'Goblin'}</span>
        <span class="hp">{health(goblinView)}</span>
      </div>
    </div>
  </header>

  <section class="narration" bind:this={logElement}>
    {#each narration as line}
      <p>{line}</p>
    {/each}
  </section>

  <section class="prompt">
    {#if ended}
      <p class="outcome">{won ? 'Victory.' : 'You fall.'}</p>
      <button onclick={reset}>Fight again</button>
    {:else if prompt === null}
      <p class="outcome">The world holds its breath.</p>
    {:else if prompt.actorId !== PLAYER}
      <p class="outcome">The goblin hesitates.</p>
      <button onclick={autoPlay}>Continue</button>
    {:else if prompt.kind === 'action'}
      <h2>Your move</h2>
      <div class="options">
        {#each prompt.options as option (option.skillId)}
          <button onclick={() => act(option.skillId)}>{option.label}</button>
        {/each}
      </div>
    {:else}
      <h2>React</h2>
      <p class="incoming">{incomingLine(prompt)}</p>
      <div class="options">
        {#each prompt.options as option (option.skillId)}
          <button onclick={() => react(option.skillId)}>{option.label}</button>
        {/each}
        <button class="ghost" onclick={takeIt}>Take it</button>
      </div>
    {/if}
  </section>
</main>
