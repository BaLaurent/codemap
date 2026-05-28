// Translate the spawn form's "effort" picker into the SDK option pair that
// spawnAgent passes to query(). Centralised so the validation (server boundary,
// untrusted input) and the SDK option mapping live in one tested place.
//
// Mapping:
//  - 'low' | 'medium' | 'high' | 'xhigh' | 'max' → SDK `effort` of the same name
//  - 'off'                                       → SDK `thinking: { type: 'disabled' }`
//  - anything else (including 'default', '', undefined, garbage from the wire)
//                                                → {} (no SDK option passed,
//                                                   model falls back to its default;
//                                                   adaptive on Opus 4.6+)
//
// See: https://docs.anthropic.com/en/docs/build-with-claude/effort
//      https://docs.anthropic.com/en/docs/build-with-claude/adaptive-thinking
import type { EffortLevel, ThinkingConfig } from '@anthropic-ai/claude-agent-sdk';

const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** All effort values the spawn form and the chat panel are allowed to send,
 *  including the two pseudo-values 'default' (no override) and 'off' (disable). */
export const EFFORT_VALUES = ['default', 'low', 'medium', 'high', 'xhigh', 'max', 'off'] as const;
export type EffortValue = typeof EFFORT_VALUES[number];

export function isEffortValue(v: unknown): v is EffortValue {
  return typeof v === 'string' && (EFFORT_VALUES as readonly string[]).includes(v);
}

export function resolveEffortOptions(raw: unknown): { effort?: EffortLevel; thinking?: ThinkingConfig } {
  if (raw === 'off') return { thinking: { type: 'disabled' } };
  if (typeof raw === 'string' && (EFFORT_LEVELS as string[]).includes(raw)) {
    return { effort: raw as EffortLevel };
  }
  return {};
}

/** Runtime equivalent of resolveEffortOptions, for live sessions where the SDK
 *  only exposes Query.setMaxThinkingTokens(n|null).
 *
 *  Sweet spot caveat: on Opus 4.6+ this is interpreted as on/off (any n > 0 →
 *  adaptive, n === 0 → disabled), so 'low'/'medium'/'high'/… all behave the
 *  same — the UI tooltip mentions this. On older models, n IS the budget and
 *  the gradient matters. The numbers below are inspired by the SDK's adaptive
 *  presets so a switch produces a visible effect on every model that respects
 *  the budget.
 *
 *  Returns `null` when no setter call is needed — i.e. 'default' (clear limit
 *  via setMaxThinkingTokens(null)) is still expressed as a number (null) and
 *  forwarded, while unknown garbage returns `undefined` (no-op). */
export function effortToMaxThinkingTokens(raw: unknown): number | null | undefined {
  switch (raw) {
    case 'default': return null;   // clear the limit, back to the model's default
    case 'off':     return 0;      // 0 = disabled (per SDK docs on Opus 4.6+)
    case 'low':     return 2000;
    case 'medium':  return 5000;
    case 'high':    return 12000;
    case 'xhigh':   return 24000;
    case 'max':     return 48000;
    default:        return undefined;  // unknown → don't touch the session
  }
}
