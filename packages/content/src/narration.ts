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
  identifiedPrefix: 'You read the windup. {{description}}',
  vaguePrefix: 'You catch only a glimpse: {{description}}',
  systemDamage: '[ you have taken {{damage}} damage ]',
} as const

export type NarrationTemplateKey = keyof typeof NARRATION
