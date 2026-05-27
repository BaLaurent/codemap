import { describe, it, expect, vi } from 'vitest';
import {
  getAgentName,
  setAgentName,
  clearAgentName,
  hasCustomName,
  AGENT_NAMES_CHANGED,
} from './agent-names';

// Each test uses a unique agentId to stay independent of the module-level cache.
describe('agent-names store', () => {
  it('returns the fallback when no custom name is set', () => {
    expect(getAgentName('agent-fallback', 'Claude 1')).toBe('Claude 1');
    expect(hasCustomName('agent-fallback')).toBe(false);
  });

  it('stores and returns a custom name', () => {
    setAgentName('agent-set', 'Backend guy');
    expect(getAgentName('agent-set', 'Claude 1')).toBe('Backend guy');
    expect(hasCustomName('agent-set')).toBe(true);
  });

  it('trims whitespace around the name', () => {
    setAgentName('agent-trim', '   Spaced   ');
    expect(getAgentName('agent-trim', 'x')).toBe('Spaced');
  });

  it('clears the name, restoring the fallback', () => {
    setAgentName('agent-clear', 'Temp');
    clearAgentName('agent-clear');
    expect(getAgentName('agent-clear', 'Claude 1')).toBe('Claude 1');
    expect(hasCustomName('agent-clear')).toBe(false);
  });

  it('treats an empty/whitespace name as a clear', () => {
    setAgentName('agent-empty', 'Temp');
    setAgentName('agent-empty', '   ');
    expect(hasCustomName('agent-empty')).toBe(false);
  });

  it('dispatches a change event on set', () => {
    const handler = vi.fn();
    window.addEventListener(AGENT_NAMES_CHANGED, handler);
    setAgentName('agent-event', 'Named');
    expect(handler).toHaveBeenCalled();
    window.removeEventListener(AGENT_NAMES_CHANGED, handler);
  });

  it('dispatches a change event on clear of an existing name', () => {
    setAgentName('agent-event-clear', 'Named');
    const handler = vi.fn();
    window.addEventListener(AGENT_NAMES_CHANGED, handler);
    clearAgentName('agent-event-clear');
    expect(handler).toHaveBeenCalled();
    window.removeEventListener(AGENT_NAMES_CHANGED, handler);
  });

  it('does not dispatch when clearing a name that was never set', () => {
    const handler = vi.fn();
    window.addEventListener(AGENT_NAMES_CHANGED, handler);
    clearAgentName('agent-never-set');
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(AGENT_NAMES_CHANGED, handler);
  });
});
