# Combat System — Design Summary (POC)

A text-only, single-player browser RPG. Combat is **turn-based in structure, semi-realtime in feel**: every action unfolds on a continuous **tick timeline**, and speed/reflex/perception decide how much of an opponent's action you can read and answer before it lands.

The engine is **deterministic and replayable** from a `seed + input log`.

---

## Design philosophy

> **It should always be better to hold the initiative and attack than to defend or react.**
>
> Defense exists to *buy tempo*, never to win. Reacting is a corrective, not a strategy. Every mechanic must preserve this bias: attacks are the only path to victory; defense only denies or delays.

Corollaries:

- **Only attacks reduce HP.** Defense never advances the win condition.
- **Tempo is worthless until spent attacking.**
- **A failed read costs damage + recovery.**
- **Getting hit is consequential** (hitstun + combo pressure), never a "reset."
- **Overwhelming weaker opponents is a valid power fantasy** — infinite chains may emerge from a sufficient stat gap; they are not artificially capped.
- **No artificial caps.** Let properties emerge from the timing model, then iterate.

---

## 1. Stats

| Stat | Role |
|------|------|
| **Speed** | Initiative: who acts first on a same-tick / opening tie. *(Deferred: also scales phase ticks — e.g. +10 speed → −1 windup — not in POC.)* |
| **Reflex** | Reaction latency: when an actor may *begin* acting. |
| **Perception** | Information: what an actor knows about an incoming skill, and when. |

Plus combat stats (HP, damage, etc.). **Hitstun is a per-skill value.**

---

## 2. Skill model — every action is a skill

Blocks, dodges, parries, counters, combos and mixups are all skills with three phases:

| Phase | Job |
|-------|-----|
| **Startup (windup)** | The *tell* + the interruptible commit window + the perception budget. |
| **Delivery** | Active threat. Damage **connects at the end**: `connectAt = startup + delivery`. |
| **Ending** | Recovery / punish window. Long ending = strong but readable and punishable. |

Because reactions are just skills, the engine needs **no special-case counter logic** — one timeline, one rule: **whoever connects first wins.**

`obscurity` (a readability modifier decoupled from duration) is **deferred**.

---

## 3. Perception & identification

- **Vague description is always shown** (e.g. *"the blade swings up toward you"*).
- **Exact skill information** is shown only if the actor *identifies* the skill.
- Reading builds over time: `readTicks = f(perception)`; identification occurs at `skillStart + readTicks`, **only if `readTicks ≤ startup`**. Short windups therefore require higher Perception.
- **Precise reactions are a two-stat gate:** Perception (identify) **and** Reflex (still have time to act).

Deferred: per-skill `obscurity`; bestiary / known-skill exemption (reward player knowledge).

---

## 4. Reflex & the reaction rule

- Reflex maps to a **reaction delay** via a diminishing curve with a floor (`clamp(C − k·reflex, floor, ∞)`), so nobody reacts at tick 0.
- Reflex is symmetric: it applies to the attacker too.

Resolution for any incoming action:

```
success  ⇔  reactAt + reaction.connectsAt  ≤  incoming.connectAt
ties → defender wins
```

---

## 5. Game loop (turn-based pause)

```
advance ticks → reach decision point → pause → input → apply → repeat
```

- **No wall clock ever runs.** `step()` advances to the next decision point, returns "needs intent from actor X + legal options," and the UI waits as long as needed.
- **Who is prompted:** whoever is free first. If two are free on the same tick (or at combat start), **higher Speed** wins; an exact Speed tie is broken by a **seeded coin flip** (deterministic — never `Math.random()`).
- **Auto-advance** if a free actor has no legal options.
- Defenders still receive a reaction decision point on every incoming attack, even while committed or recovering — they may simply be *too slow to succeed*.
- **Block and dodge are always playable**, even when the skill is unidentified. Whether they *land in time* depends on the timing race.

---

## 6. Tempo & commitment

- There are no "turns." A **tempo lead** belongs to whoever is free first; ending length is the dial, and tempo can ping-pong.
- While attacking, an actor is **committed** and cannot act freely.
- The only mid-action actions are **cancel edges** (combo / mixup) — *deferred from the POC core*.

---

## 7. Damage, hitstun & punish tiers

- A counter that connects **before** the incoming hit **interrupts** it: the attacker's skill fizzles, damage applies, and tempo moves.
- **Counter during the attacker's startup** → **×1.5 damage + stagger** (extra recovery applied to the attacker).
- **Counter during delivery** → baseline damage, no stagger.
- **Super-armor** (per-skill): a slow skill may be armored during **delivery**, making it interruptible *only during startup* — so an early read is the only answer.

---

## 8. Defense: block & dodge

- **Block** has its own tick cost. If it completes before the hit → *full block*. If the hit lands first → *incomplete block* still negates a portion of damage.
  - *Balance note:* keep the mitigated fraction modest and give incomplete block a recovery cost, or turtling dominates.
- **Dodge** has a low delivery tick and a **medium lag (ending)** — a *neutral reset*, not a free tempo win.

---

## 9. Chaining (designed; **deferred from POC core**)

| Mechanic | Trigger | Cuts | Purpose |
|----------|---------|------|---------|
| **Combo** | your attack **hits** | **ending** | keep the offense rolling |
| **Mixup** | you **detect an incoming counter** | **startup** (reduced) | reverse a losing exchange |

- A combo follow-up keeps its **normal startup**; only the ending is removed.
- Data model: cancel edges on a skill, as a **flexible directed graph** (a skill may carry both edge types; multiple edges may share a follow-up):

```ts
interface ChainEdge {
  trigger: 'onHit' | 'onCounterDetected'
  followUp: SkillId
  cancels: 'ending' | 'startup'
  startupMultiplier?: number
}
```

- **Pre-planning / concealment of chains is deferred.**

---

## 10. Termination & infinite chains

- **No gameplay chain cap.**
- Hits reduce HP and **no healing is planned**, so every fight eventually terminates.
- Infinite chains are an **emergent** result of a sufficient stat gap: a weaker defender cannot get a block/dodge/reaction out in time, so hits keep landing. An equal-or-stronger defender can always escape via the always-available block/dodge, so equal fights do not loop.
- *Dev-only:* simulation tests assert fights terminate; this is **not** a runtime cap.

---

## 11. Cooldowns

- Skills enter cooldown **as soon as the skill is started**.
- Consequently, an interrupted skill is already on cooldown.

---

## 12. Engine architecture

- **Pure, deterministic** `packages/engine`: seeded RNG (including coin flips), no wall-clock, no I/O.
- The web layer owns countdown pacing and text rendering.
- **Data-driven:**
  - `SkillDef` — phases, tags, hitstun, chain edges, armor.
  - `CharacterTemplate` — authored content, referenced by stable ID.
  - `CharacterRuntime` — current pools, effects, cooldowns.
- **Derived stats are computed on read and never persisted.**

---

## POC scope

**In scope:** three stats; tick timeline & scheduler; three-phase skills; perception-based identification; reflex delay; reaction race; block / dodge / parry / counter; hitstun; tempo; damage; punish tiers (×1.5 + stagger on startup interrupt); per-skill super-armor; cooldowns; turn loop with pause, Speed tiebreak and seeded coin flip; deterministic replay; sample skills & tests.

**Deferred:** chaining (combo / mixup) and chain pre-planning/concealment; `obscurity`; bestiary / known-skill exemption; Speed phase-tick scaling.

---

## Tuning placeholders (set defaults, iterate via simulation)

- `readBase` / `readTicks` formula; partial-info tiers.
- Reflex→delay curve constants (`C`, `k`) and floor value.
- Mixup startup multiplier (when chaining is added).
- Stagger ticks on a clean counter.
- Per-skill hitstun values; block startup + mitigated fraction; dodge lag.
- Combo damage scaling (when chaining is added).
- Base stat / skill numbers and cooldown durations.
- Super-armor coverage (full delivery vs partial; how common).
