// Model choices for the chat header and the spawn form. supportedModels() can
// return [] (e.g. subscription sessions), so we fall back to stable aliases and
// always offer one "Défaut". Shared so both selectors look identical, cold start
// or not. The agent reports model 'default' when on the default, so that is the
// reset value; the server maps it back to "no model" → CLI default.
import type { ModelOption } from '../types';

const FALLBACK_MODELS = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

export function buildModelOptions(models: ModelOption[], current?: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  const add = (value: string, label: string) => { if (!seen.has(value)) { seen.add(value); out.push({ value, label }); } };
  add('default', 'Défaut');
  for (const m of models.length ? models.map(m => ({ value: m.value, label: m.displayName })) : FALLBACK_MODELS) add(m.value, m.label);
  if (current) add(current, current);  // keep an unknown current value visible
  return out;
}
