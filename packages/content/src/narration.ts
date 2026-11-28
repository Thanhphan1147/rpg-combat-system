/**
 * Generic narration templates. Placeholders use `{{name}}` and are filled by
 * the UI. Text lives here so the prose can be edited without touching code.
 */
export const NARRATION = {
  skillUsedPlayer: 'You commit to a {{skill}}.',
  skillUsedEnemy: '{{actor}} winds up a {{skill}}.',
  reactionUsedPlayer: 'You answer with a {{skill}}.',
  reactionUsedEnemy: '{{actor}} answers with a {{skill}}.',
  hitPlayerFallback: "{{actor}}'s {{skill}} catches you.",
  hitEnemyFallback: 'Your {{skill}} bites into {{target}}.',
  blockedPlayer: 'You turn the {{skill}} aside on your guard.',
  blockedEnemy: '{{actor}} blocks your {{skill}} cleanly.',
  dodgedPlayer: 'You slip aside from the {{skill}}.',
  dodgedEnemy: '{{actor}} slips aside from your {{skill}}.',
  parriedPlayer: 'You parry the {{skill}} with a sharp turn of the wrist.',
  parriedEnemy: '{{actor}} parries your {{skill}}.',
  interruptedByPlayer: "Your {{skill}} cuts through {{target}}'s {{targetSkill}}.",
  interruptedByEnemy: "{{actor}}'s {{skill}} cuts through your {{targetSkill}}.",
  staggeredPlayer: 'You stagger, reeling.',
  staggeredEnemy: '{{actor}} staggers, reeling.',
  armoredPlayer: 'Your {{skill}} shrugs off the hit and keeps coming.',
  armoredEnemy: "{{actor}}'s {{skill}} shrugs off the hit and keeps coming.",
  victory: '{{enemy}} folds to the wet stones and moves no more.',
  defeat: 'Your knees give way. The dark closes in.',
  systemDamage: '[ you have taken {{damage}} damage ]',
  enemyGearOne: 'The enemy wears a single piece of gear. {{flavor}}',
  enemyGearMany: 'The enemy wears {{count}} pieces of gear. {{flavor}}',
  difficultFight: 'This is going to be a difficult fight.',
  spoils: 'Spoils: {{items}}.',
  noSpoils: 'Nothing worth stripping from this one.',
  essenceDropped: 'An essence drops: {{essence}} (grants {{skill}}).',
  noEssence: 'No essence this time.',
  buffedPlayer: '{{skill}} takes hold — your blows bite deeper and harm glances away.',
  buffedEnemy: '{{actor}} is steeled by {{skill}}.',
  healedPlayer: 'You knit your wounds closed. {{amount}} HP restored.',
  healedEnemy: '{{actor}} mends its wounds. {{amount}} HP restored.',
  runOver: 'The wanderer falls. The run ends here.',
} as const

export type NarrationTemplateKey = keyof typeof NARRATION

export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
}
