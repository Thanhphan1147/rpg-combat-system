/**
 * Generic narration templates. Placeholders use `{{name}}` and are filled by
 * the UI. Text lives here so the prose can be edited without touching code.
 */
export const NARRATION = {
  skillUsedPlayer: '[ you used {{skill}} ]',
  skillUsedEnemy: '{{actor}} winds up a {{skill}}.',
  reactionUsedPlayer: '[ you used {{skill}} ]',
  reactionUsedEnemy: '{{actor}} answers with a {{skill}}.',
  hitPlayer: '[ you took {{damage}} damage from {{actor}} with {{skill}} ]',
  hitEnemy: '[ you hit {{target}} with {{skill}} for {{damage}} damage ]',
  blockedPlayer: '[ you blocked {{skill}} ]',
  blockedEnemy: '[ {{actor}} blocked your {{skill}} ]',
  dodgedPlayer: '[ you dodged {{skill}} ]',
  dodgedEnemy: '[ {{actor}} dodged your {{skill}} ]',
  parriedPlayer: '[ you parried {{skill}} ]',
  parriedEnemy: '[ {{actor}} parried your {{skill}} ]',
  interruptedByPlayer: "[ you interrupted {{target}}'s {{targetSkill}} with {{skill}} ]",
  interruptedByEnemy: "[ your {{targetSkill}} was interrupted by {{actor}}'s {{skill}} ]",
  staggeredPlayer: '[ you are staggered ]',
  staggeredEnemy: '[ {{actor}} is staggered ]',
  armoredPlayer: '[ your {{skill}} shrugs off the hit ]',
  armoredEnemy: "[ {{actor}}'s {{skill}} shrugs off the hit ]",
  unreactablePlayer: '[ {{skill}} was too fast for you ]',
  unreactableEnemy: '[ your {{skill}} was too fast for {{target}} ]',
  victory: '[ you defeated {{enemy}} ]',
  defeat: '[ you were defeated ]',
  enemyGearOne: 'The enemy wears a single piece of gear. {{flavor}}',
  enemyGearMany: 'The enemy wears {{count}} pieces of gear. {{flavor}}',
  difficultFight: 'This is going to be a difficult fight.',
  spoils: 'Spoils: {{items}}.',
  noSpoils: 'Nothing worth stripping from this one.',
  essenceDropped: 'An essence drops: {{essence}} (grants {{skill}}).',
  noEssence: 'No essence this time.',
  buffedPlayer: '[ you are buffed by {{skill}} for {{duration}} ticks ]',
  buffedEnemy: '[ {{actor}} is buffed by {{skill}} ]',
  healedPlayer: '[ you healed {{amount}} hp ]',
  healedEnemy: '[ {{actor}} healed {{amount}} hp ]',
  xpGained: '[ you have gained {{xp}} experience ]',
  levelUp: '[ you have leveled up — level {{level}} ]',
  obtainedItem: '[ you obtained {{item}} ]',
  foundEssence: '[ you found {{essence}} ]',
  equippedItem: '[ you equipped {{item}} ]',
  removedItem: '[ you removed {{item}} ]',
  loadedEssence: '[ you loaded {{essence}} into an essence slot ]',
  unloadedEssence: '[ you unloaded {{essence}} ]',
  runOver: 'The wanderer falls. The run ends here.',
} as const

export type NarrationTemplateKey = keyof typeof NARRATION

export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
}
