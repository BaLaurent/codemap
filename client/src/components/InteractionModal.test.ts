import { describe, it, expect } from 'vitest';
import { formatAnswers } from './InteractionModal';

describe('formatAnswers', () => {
  it('pairs each question with its selected options and free text', () => {
    const question = {
      questions: [
        { question: 'Lib ?', options: [{ label: 'date-fns' }, { label: 'dayjs' }] },
        { question: 'Features ?', multiSelect: true, options: [{ label: 'cache' }, { label: 'logs' }] },
      ],
    };
    const answers = [
      { selected: ['date-fns'], other: '' },
      { selected: ['cache'], other: 'retry custom' },
    ];
    expect(formatAnswers(question, answers)).toBe(
      'Lib ? → date-fns\nFeatures ? → cache, retry custom'
    );
  });

  it('includes only free text when no option is selected', () => {
    const question = { questions: [{ question: 'Autre ?', options: [{ label: 'a' }] }] };
    expect(formatAnswers(question, [{ selected: [], other: 'something else' }]))
      .toBe('Autre ? → something else');
  });

  it('handles a missing answer entry gracefully', () => {
    const question = { questions: [{ question: 'Q', options: [] }] };
    expect(formatAnswers(question, [])).toBe('Q → ');
  });
});
