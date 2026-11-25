import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT_SLOTS,
  createEquipment,
  rollEquipment,
  rollEquipmentCount,
} from '../src/equipment'
import type { Equipment, EquipmentRarity, EquipmentSlot } from '../src/equipment'
import { HP_PER_POINT, statScore } from '../src/stats'

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

type StatKey = keyof Equipment['buffs']

const CORE_STATS: Record<EquipmentSlot, StatKey[]> = {
  weapon: ['attack'],
  armor: ['maxHp', 'defense'],
  helmet: ['perception', 'reflex'],
  boots: ['speed'],
}

function points(value: number, stat: StatKey): number {
  return stat === 'maxHp' ? value / HP_PER_POINT : value
}

function coreShare(item: Equipment): number {
  const total = statScore(item.buffs)
  if (total <= 0) {
    return 0
  }
  const core = CORE_STATS[item.slot].reduce(
    (sum, stat) => sum + points(item.buffs[stat] ?? 0, stat),
    0,
  )
  return core / total
}

describe('equipment generation', () => {
  it('gives every slot its signature stats', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const item = createEquipment(slot, 1, seeded(1))
      expect(item.slot).toBe(slot)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.flavor.length).toBeGreaterThan(0)
      for (const stat of CORE_STATS[slot]) {
        expect(item.buffs[stat] ?? 0).toBeGreaterThan(0)
      }
    }
  })

  it('scales the stat budget with level', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const low = createEquipment(slot, 1, seeded(2))
      const high = createEquipment(slot, 5, seeded(2))
      expect(statScore(high.buffs)).toBeGreaterThan(statScore(low.buffs))
    }
  })

  it('weights more of the budget toward core stats as the weight rises', () => {
    const samples = 40
    const meanShare = (weight: number): number => {
      let total = 0
      for (let seed = 1; seed <= samples; seed += 1) {
        for (const slot of EQUIPMENT_SLOTS) {
          total += coreShare(createEquipment(slot, 1, seeded(seed), weight))
        }
      }
      return total / (samples * EQUIPMENT_SLOTS.length)
    }

    const high = meanShare(0.8)
    const mid = meanShare(0.7)
    const low = meanShare(0.6)
    expect(high).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(low)
    expect(Math.abs(high - 0.8)).toBeLessThan(0.12)
    expect(Math.abs(mid - 0.7)).toBeLessThan(0.12)
    expect(Math.abs(low - 0.6)).toBeLessThan(0.12)
  })

  it('makes each extra worn piece rarer', () => {
    const random = seeded(42)
    const counts = [0, 0, 0, 0, 0]
    for (let sample = 0; sample < 400; sample += 1) {
      counts[rollEquipmentCount(random)]! += 1
    }
    expect(counts[0]).toBe(0)
    expect(counts[1] ?? 0).toBeGreaterThan(counts[2] ?? 0)
    expect(counts[2] ?? 0).toBeGreaterThan(counts[3] ?? 0)
    expect(counts[3] ?? 0).toBeGreaterThan(counts[4] ?? 0)
  })


  it('rolls higher rarities less often', () => {
    const random = seeded(21)
    const counts: Record<EquipmentRarity, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    }
    for (let sample = 0; sample < 1000; sample += 1) {
      counts[createEquipment('weapon', 1, random).rarity] += 1
    }
    expect(counts.common).toBeGreaterThan(counts.uncommon)
    expect(counts.uncommon).toBeGreaterThan(counts.rare)
    expect(counts.rare).toBeGreaterThan(counts.epic)
    expect(counts.epic).toBeGreaterThan(counts.legendary)
    expect(counts.legendary).toBeGreaterThan(0)
  })

  it('scales total stats by rarity', () => {
    const rarities: EquipmentRarity[] = [
      'common',
      'uncommon',
      'rare',
      'epic',
      'legendary',
    ]
    const averages = rarities.map((rarity) => {
      let total = 0
      for (let seed = 1; seed <= 20; seed += 1) {
        total += statScore(
          createEquipment('armor', 5, seeded(seed), undefined, rarity).buffs,
        )
      }
      return total / 20
    })
    for (let index = 1; index < averages.length; index += 1) {
      expect(averages[index]!).toBeGreaterThan(averages[index - 1]!)
    }
  })

  it('adds extra flavor to rare and better items', () => {
    const common = createEquipment('armor', 5, seeded(9), undefined, 'common')
    const rare = createEquipment('armor', 5, seeded(9), undefined, 'rare')
    const legendary = createEquipment('armor', 5, seeded(9), undefined, 'legendary')
    expect(rare.flavor.startsWith(common.flavor)).toBe(true)
    expect(rare.flavor.length).toBeGreaterThan(common.flavor.length)
    expect(legendary.flavor.length).toBeGreaterThan(common.flavor.length)
    expect(legendary.flavor.split('.').length).toBeGreaterThan(
      common.flavor.split('.').length,
    )
  })

  it('rolls distinct slots for a full set', () => {
    const loot = rollEquipment(9, seeded(3), 4)
    expect(loot).toHaveLength(4)
    expect(new Set(loot.map((item) => item.slot)).size).toBe(4)
    expect(new Set(loot.map((item) => item.id)).size).toBe(4)
  })
})
