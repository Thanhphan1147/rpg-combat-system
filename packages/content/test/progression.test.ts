import { describe, expect, it } from 'vitest'
import { wanderer } from '../src/characters'
import { goblinArchetypes, rollEncounter } from '../src/encounter'
import {
  applyVictory,
  buildPlayer,
  createRun,
  essenceSkillPool,
  loadEssence,
  playerSkillIds,
  playerStats,
  unloadEssence,
  xpForNextLevel,
} from '../src/progression'
import type { Essence, RunState } from '../src/progression'

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function archetype(id: string) {
  const found = goblinArchetypes.find((candidate) => candidate.id === id)
  if (found === undefined) {
    throw new Error(`Missing archetype: ${id}`)
  }
  return found
}

describe('progression', () => {
  it('starts at level 1 with one empty slot', () => {
    const run = createRun()
    expect(run.level).toBe(1)
    expect(run.xp).toBe(0)
    expect(run.essences).toEqual([])
    expect(run.slots).toEqual([null])
  })

  it('drops an essence, awards XP, and adds a slot on level up', () => {
    const clubber = archetype('clubber')
    const run = applyVictory(createRun(), 'clubber', seeded(1))

    expect(run.level).toBe(2)
    expect(run.xp).toBe(clubber.xp - xpForNextLevel(1))
    expect(run.slots).toHaveLength(2)
    expect(run.slots[1]).toBeNull()
    expect(run.essences).toHaveLength(1)
    expect(run.essences[0]?.buffs).toEqual(clubber.essenceBuffs)
    expect(essenceSkillPool(clubber)).toContain(run.essences[0]?.skillId)
  })

  it('levels up multiple times and adds one slot per level', () => {
    const starting: RunState = { ...createRun(), xp: 250 }
    const run = applyVictory(starting, 'clubber', seeded(2))
    expect(run.level).toBe(3)
    expect(run.xp).toBe(50)
    expect(run.slots).toHaveLength(3)
    expect(run.slots.every((slot) => slot === null)).toBe(true)
  })

  it('loads, overrides, and unloads without losing essences', () => {
    let run = applyVictory(createRun(), 'clubber', seeded(3))
    run = applyVictory(run, 'archer', seeded(4))
    const [first, second] = run.essences
    if (first === undefined || second === undefined) {
      throw new Error('Expected two essences')
    }

    const loaded = loadEssence(run, first.id, 0)
    expect(loaded.slots[0]?.id).toBe(first.id)
    expect(loaded.essences.map((essence) => essence.id)).not.toContain(first.id)

    const replaced = loadEssence(loaded, second.id, 0)
    expect(replaced.slots[0]?.id).toBe(second.id)
    expect(replaced.essences.map((essence) => essence.id)).toContain(first.id)

    const cleared = unloadEssence(replaced, 0)
    expect(cleared.slots[0]).toBeNull()
    expect(cleared.essences.map((essence) => essence.id)).toContain(second.id)
  })

  it('applies equipped buffs and skills to the player build', () => {
    let run = applyVictory(createRun(), 'archer', seeded(5))
    const essence = run.essences[0]
    if (essence === undefined) {
      throw new Error('Expected an essence')
    }
    run = loadEssence(run, essence.id, 0)

    const stats = playerStats(run)
    expect(stats.maxHp).toBe(wanderer.baseStats.maxHp + (essence.buffs.maxHp ?? 0))
    expect(stats.speed).toBe(wanderer.baseStats.speed + (essence.buffs.speed ?? 0))
    expect(stats.attack).toBe(wanderer.baseStats.attack + (essence.buffs.attack ?? 0))
    expect(playerSkillIds(run)).toContain(essence.skillId)

    const build = buildPlayer(run)
    expect(build.character.baseStats).toEqual(stats)
    expect(build.skillIds).toContain('basic')
    expect(build.skillIds).toContain(essence.skillId)
  })

  it('does not duplicate a skill granted by two essences', () => {
    const essence = (id: string): Essence => ({
      id,
      name: id,
      sourceId: 'berserker',
      sourceName: 'Goblin Berserker',
      buffs: { attack: 1 },
      skillId: 'cleave',
    })
    const run: RunState = {
      level: 2,
      xp: 0,
      essences: [],
      slots: [essence('a'), essence('b')],
      nextEssenceId: 3,
    }
    expect(playerSkillIds(run).filter((skillId) => skillId === 'cleave')).toHaveLength(1)
  })

  it('feeds equipped essences and buffed stats into the next encounter', () => {
    let run = applyVictory(createRun(), 'berserker', seeded(6))
    const essence = run.essences[0]
    if (essence === undefined) {
      throw new Error('Expected an essence')
    }
    run = loadEssence(run, essence.id, 0)

    const encounter = rollEncounter(seeded(7), undefined, buildPlayer(run))
    const player = encounter.combatants.find((combatant) => combatant.side === 'player')
    if (player === undefined) {
      throw new Error('Expected a player combatant')
    }
    const template = encounter.content.characters[player.characterId]
    if (template === undefined) {
      throw new Error('Expected the player template')
    }

    expect(player.skillIds).toContain(essence.skillId)
    expect(template.baseStats).toEqual(playerStats(run))
    expect(template.baseStats.maxHp).toBeGreaterThan(wanderer.baseStats.maxHp)
  })

  it('ignores unknown essences and out-of-range slots', () => {
    const run = createRun()
    expect(loadEssence(run, 'missing', 0)).toBe(run)
    expect(loadEssence(run, 'missing', 9)).toBe(run)
    expect(unloadEssence(run, 0)).toBe(run)
    expect(unloadEssence(run, 9)).toBe(run)
  })
})
