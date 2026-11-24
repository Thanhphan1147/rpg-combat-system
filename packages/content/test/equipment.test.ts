import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT_SLOTS,
  createEquipment,
  equipmentPiecesForLevel,
  rollEquipment,
} from '../src/equipment'
import type { Equipment, EquipmentSlot } from '../src/equipment'
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

  it('wears more pieces as levels rise', () => {
    expect(equipmentPiecesForLevel(1)).toBe(1)
    expect(equipmentPiecesForLevel(2)).toBe(1)
    expect(equipmentPiecesForLevel(3)).toBe(2)
    expect(equipmentPiecesForLevel(5)).toBe(3)
    expect(equipmentPiecesForLevel(7)).toBe(4)
    expect(equipmentPiecesForLevel(12)).toBe(4)
  })

  it('rolls distinct slots for a full set', () => {
    const loot = rollEquipment(9, seeded(3))
    expect(loot).toHaveLength(4)
    expect(new Set(loot.map((item) => item.slot)).size).toBe(4)
    expect(new Set(loot.map((item) => item.id)).size).toBe(4)
  })
})
