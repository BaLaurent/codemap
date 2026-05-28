// Public API of the chat completion module. The trigger utilities below are part
// of the module's declared surface even though current consumers (CompletionInput,
// the tests) import them straight from ./trigger — a barrel is structural public
// API, not dead code, so its re-exports are not flagged.
// fallow-ignore-file unused-export
// fallow-ignore-file unused-type
export { CompletionInput } from './CompletionInput';
export { detectTrigger, applyCompletion, filterCommands, filterFiles } from './trigger';
export type { Trigger, TriggerKind } from './trigger';
