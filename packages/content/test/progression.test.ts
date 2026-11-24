import { describe, expect, it } from 'vitest'
import { wanderer } from '../src/characters'
import { enemyArchetypes, rollEncounter } from '../src/encounter'
import { createEquipment, equipmentPiecesForLevel } from '../src/equipment'
import type { Equipment } from '../src/equipment'
import {
  applyVictory,
  buildPlayer,
  createRun,
  equipItem,
  essenceSkillPool,
  loadEssence,
  playerSkillIds,
  playerStats,
  unequipItem,
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
  const found = enemyArchetypes.find((candidate) => candidate.id === id)
  if (found === undefined) {
    throw new Error(`Missing archetype: ${id}`)
  }
  return found
}

const alwaysDrop = (): number => 0
const neverDrop = (): number => 0.5

function reward(archetypeId: string, equipment: Equipment[] = []) {
  return { archetypeId, equipment }
}

describe('progression', () => {
  it('starts at level 1 with one empty slot, no gear, and no items', () => {
    const run = createRun()
    expect(run.level).toBe(1)
    expect(run.xp).toBe(0)
    expect(run.essences).toEqual([])
    expect(run.slots).toEqual([null])
    expect(run.items).toEqual([])
    expect(run.gear).toEqual({ weapon: null, armor: null, helmet: null, boots: null })
  })

  it('takes gear, awards XP, and drops an essence on a successful roll', () => {
    const clubber = archetype('clubber')
    const weapon = createEquipment('weapon', 1, seeded(1))
    const run = applyVictory(createRun(), reward('clubber', [weapon]), alwaysDrop)

    expect(run.level).toBe(2)
    expect(run.xp).toBe(clubber.xp - xpForNextLevel(1))
    expect(run.slots).toHaveLength(2)
    expect(run.items).toEqual([weapon])
    expect(run.essences).toHaveLength(1)
    expect(run.essences[0]?.buffs).toEqual(clubber.essenceBuffs)
    expect(essenceSkillPool(clubber)).toContain(run.essences[0]?.skillId)
  })

  it('skips the essence on a failed 10% roll but still takes gear', () => {
    const armor = createEquipment('armor', 1, seeded(2))
    const run = applyVictory(createRun(), reward('archer', [armor]), neverDrop)

    expect(run.level).toBe(1)
    expect(run.xp).toBe(90)
    expect(run.slots).toHaveLength(1)
    expect(run.items).toEqual([armor])
    expect(run.essences).toHaveLength(0)
  })

  it('levels up multiple times and adds one slot per level', () => {
    const starting: RunState = { ...createRun(), xp: 250 }
    const run = applyVictory(starting, reward('clubber'), neverDrop)
    expect(run.level).toBe(3)
    expect(run.xp).toBe(50)
    expect(run.slots).toHaveLength(3)
    expect(run.slots.every((slot) => slot === null)).toBe(true)
  })

  it('loads, overrides, and unloads essences without losing them', () => {
    let run = applyVictory(createRun(), reward('clubber'), alwaysDrop)
    run = applyVictory(run, reward('archer'), alwaysDrop)
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

  it('equips items into their slot and returns the replaced item to the reserve', () => {
    const weaponOne = createEquipment('weapon', 1, seeded(3))
    const weaponTwo = createEquipment('weapon', 2, seeded(4))
    const armor = createEquipment('armor', 1, seeded(5))
    let run = applyVictory(
      createRun(),
      reward('clubber', [weaponOne, weaponTwo, armor]),
      neverDrop,
    )

    run = equipItem(run, weaponOne.id)
    expect(run.gear.weapon?.id).toBe(weaponOne.id)
    expect(run.items.map((item) => item.id)).not.toContain(weaponOne.id)

    run = equipItem(run, weaponTwo.id)
    expect(run.gear.weapon?.id).toBe(weaponTwo.id)
    expect(run.items.map((item) => item.id)).toContain(weaponOne.id)

    run = equipItem(run, armor.id)
    expect(run.gear.armor?.id).toBe(armor.id)

    run = unequipItem(run, 'weapon')
    expect(run.gear.weapon).toBeNull()
    expect(run.items.map((item) => item.id)).toContain(weaponTwo.id)
  })

  it('applies essence and equipment buffs and skills to the player build', () => {
    const weapon = createEquipment('weapon', 1, seeded(6))
    let run = applyVictory(createRun(), reward('archer', [weapon]), alwaysDrop)
    const essence = run.essences[0]
    if (essence === undefined) {
      throw new Error('Expected an essence')
    }
    run = loadEssence(run, essence.id, 0)
    run = equipItem(run, weapon.id)

    const stats = playerStats(run)
    expect(stats.maxHp).toBe(
      wanderer.baseStats.maxHp +
        (essence.buffs.maxHp ?? 0) +
        (weapon.buffs.maxHp ?? 0),
    )
    expect(stats.attack).toBe(
      wanderer.baseStats.attack +
        (essence.buffs.attack ?? 0) +
        (weapon.buffs.attack ?? 0),
    )
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
      ...createRun(),
      level: 2,
      slots: [essence('a'), essence('b')],
    }
    expect(playerSkillIds(run).filter((skillId) => skillId === 'cleave')).toHaveLength(1)
  })

  it('ignores unknown items, essences, and out-of-range slots', () => {
    const run = createRun()
    expect(equipItem(run, 'missing')).toBe(run)
    expect(unequipItem(run, 'weapon')).toBe(run)
    expect(loadEssence(run, 'missing', 0)).toBe(run)
    expect(loadEssence(run, 'missing', 9)).toBe(run)
    expect(unloadEssence(run, 0)).toBe(run)
    expect(unloadEssence(run, 9)).toBe(run)
  })

  it('starts against goblins and gates harder enemies by level', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const encounter = rollEncounter({ random: seeded(seed), level: 1 })
      expect(['clubber', 'archer', 'berserker']).toContain(encounter.id)
    }

    for (let seed = 1; seed <= 30; seed += 1) {
      const encounter = rollEncounter({ random: seeded(seed), level: 3 })
      const found = enemyArchetypes.find((candidate) => candidate.id === encounter.id)
      expect(found?.minLevel).toBeLessThanOrEqual(3)
      expect(encounter.level).toBe(3)
      expect(encounter.loot.length).toBe(equipmentPiecesForLevel(3))
    }

    for (let seed = 1; seed <= 20; seed += 1) {
      const encounter = rollEncounter({ random: seeded(seed), level: 6 })
      expect(['lizardman', 'beastman', 'skeletonCaptain']).toContain(encounter.id)
    }
  })

  it('feeds equipped essences and gear into the next encounter', () => {
    const weapon = createEquipment('weapon', 1, seeded(7))
    let run = applyVictory(createRun(), reward('berserker', [weapon]), alwaysDrop)
    const essence = run.essences[0]
    if (essence === undefined) {
      throw new Error('Expected an essence')
    }
    run = loadEssence(run, essence.id, 0)
    run = equipItem(run, weapon.id)

    const encounter = rollEncounter({
      random: seeded(8),
      player: buildPlayer(run),
      level: run.level,
    })
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
    expect(encounter.level).toBe(run.level)
    expect(encounter.loot.length).toBe(equipmentPiecesForLevel(run.level))
  })
})
