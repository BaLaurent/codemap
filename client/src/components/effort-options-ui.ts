// Effort presets shown in the spawn form AND in the chat panel's runtime
// selector. Same labels both places so the user sees one consistent vocabulary.
//
// Sent to the server as-is; the server whitelists via isEffortValue() (see
// server/src/effort-options.ts). At spawn, the SDK reads `options.effort` /
// `options.thinking` directly. At runtime, the server maps the label to a
// max-thinking-tokens budget — on Opus 4.6+ this is on/off only, on older
// models it's a real budget. The 'help' label spells this out.
export interface EffortOption { value: string; label: string }

export const EFFORT_OPTIONS: EffortOption[] = [
  { value: 'default', label: 'Adaptatif (par défaut)' },
  { value: 'low',     label: '🪶 Bas' },
  { value: 'medium',  label: '⚖ Moyen' },
  { value: 'high',    label: '🧠 Élevé' },
  { value: 'xhigh',   label: '🧠✨ Très élevé (Opus 4.7)' },
  { value: 'max',     label: '🚀 Maximum' },
  { value: 'off',     label: '🚫 Désactivé' },
];

/** Tooltip text reused by both selectors so the on/off-on-recent-models caveat
 *  is never silently dropped. */
export const EFFORT_TOOLTIP =
  'Profondeur du raisonnement étendu. Sur Opus 4.6+ le SDK ne gère qu’un on/off à chaud ; les niveaux fins (bas/moyen/…) prennent tout leur sens sur des modèles plus anciens.';
