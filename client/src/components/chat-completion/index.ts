// Public API of the chat completion module.
export { CompletionInput } from './CompletionInput';
export { detectTrigger, applyCompletion, filterCommands, filterFiles } from './trigger';
export type { Trigger, TriggerKind } from './trigger';
