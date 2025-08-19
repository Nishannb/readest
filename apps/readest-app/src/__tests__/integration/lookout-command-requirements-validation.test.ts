import { describe, it, expect } from 'vitest';
import { detectLookoutCommand, isValidLookoutCommand, extractQuestionFromLookoutCommand } from '@/app/reader/utils/lookoutCommandDetection';

/**
 * Test suite to validate that the command detection logic meets all specified requirements
 * from the lookout-agent specification.
 */
describe('Lookout Command Requirements Validation', () => {
  describe('Requirement 1.1: Command Detection and Question Extraction', () => {
    it('WHEN a user types `@lookout <question>` in the chat input THEN the system SHALL detect the command and extract the question', () => {
      const testCases = [
        {
          input: '@lookout what is quantum computing?',
          expectedQuestion: 'what is quantum computing?'
        },
        {
          input: '@lookout explain machine learning algorithms',
          expectedQuestion: 'explain machine learning algorithms'
        },
        {
          input: '@LOOKOUT how does blockchain work?',
          expectedQuestion: 'how does blockchain work?'
        },
        {
          input: '  @lookout  what is artificial intelligence?  ',
          expectedQuestion: 'what is artificial intelligence?'
        }
      ];

      testCases.forEach(({ input, expectedQuestion }) => {
        const result = detectLookoutCommand(input);
        expect(result.isLookoutCommand).toBe(true);
        expect(result.question).toBe(expectedQuestion);
      });
    });
  });

  describe('Requirement 1.2: Context Integration', () => {
    it('WHEN the lookout command is detected AND there is highlighted text context THEN the system SHALL combine both the highlighted text and user question for research', () => {
      const input = '@lookout explain this concept';
      const contextSnippets = [
        'Neural networks are computing systems inspired by biological neural networks.',
        'They consist of interconnected nodes (neurons) that process information.'
      ];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain this concept');
      expect(result.highlightedContext).toBe(
        'Neural networks are computing systems inspired by biological neural networks.\n\n' +
        'They consist of interconnected nodes (neurons) that process information.'
      );
    });

    it('should handle single context snippet', () => {
      const input = '@lookout what does this mean?';
      const contextSnippets = ['Deep learning is a subset of machine learning.'];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what does this mean?');
      expect(result.highlightedContext).toBe('Deep learning is a subset of machine learning.');
    });

    it('should handle empty context gracefully', () => {
      const input = '@lookout explain artificial intelligence';
      const contextSnippets: string[] = [];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain artificial intelligence');
      expect(result.highlightedContext).toBeUndefined();
    });
  });

  describe('Requirement 5.1: Non-interference with Normal Chat', () => {
    it('WHEN the user types in the chat input THEN the system SHALL detect `@lookout` commands without interfering with normal chat', () => {
      const normalChatInputs = [
        'Can you help me understand this concept?',
        'What is the meaning of this text?',
        'Please explain this to me',
        'I need help with this problem',
        'lookout for errors in this code', // Contains "lookout" but not as command
        'please @lookout explain this', // @lookout not at start
        '@lookup something', // Similar but different command
        ''
      ];

      const lookoutCommands = [
        '@lookout what is this?',
        '@LOOKOUT explain concept',
        '  @lookout  how does it work?  '
      ];

      // Normal chat should not be detected as lookout commands
      normalChatInputs.forEach(input => {
        const result = detectLookoutCommand(input);
        expect(result.isLookoutCommand).toBe(false);
      });

      // Lookout commands should be detected
      lookoutCommands.forEach(input => {
        const result = detectLookoutCommand(input);
        expect(result.isLookoutCommand).toBe(true);
      });
    });
  });

  describe('Requirement 1.6: Search Without Context', () => {
    it('When the lookout command is detected even when the highlighted text context are not added by user, lookout command still search on web based on what user asked in the prompt', () => {
      const input = '@lookout what is machine learning?';
      const result = detectLookoutCommand(input, []);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what is machine learning?');
      expect(result.highlightedContext).toBeUndefined();
    });

    it('should work with complex questions without context', () => {
      const input = '@lookout What are the differences between supervised and unsupervised learning?';
      const result = detectLookoutCommand(input);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('What are the differences between supervised and unsupervised learning?');
      expect(result.highlightedContext).toBeUndefined();
    });
  });

  describe('Command Format Validation', () => {
    it('should validate correct command formats', () => {
      const validCommands = [
        '@lookout what is this?',
        '@LOOKOUT explain concept',
        '@Lookout How does it work?',
        '  @lookout  test question  ',
        '@lookout What are the key differences between AI and ML?'
      ];

      validCommands.forEach(command => {
        expect(isValidLookoutCommand(command)).toBe(true);
      });
    });

    it('should reject invalid command formats', () => {
      const invalidCommands = [
        '@lookout', // No question
        '@lookout   ', // Only whitespace after command
        'please @lookout explain', // Not at start
        'regular message', // No command
        '@lookup what is this?', // Wrong command
        '', // Empty string
        '   ', // Only whitespace
        '@lookout' // No space or question
      ];

      invalidCommands.forEach(command => {
        expect(isValidLookoutCommand(command)).toBe(false);
      });
    });
  });

  describe('Question Extraction Accuracy', () => {
    it('should extract questions with various punctuation and formatting', () => {
      const testCases = [
        {
          input: '@lookout What is quantum computing?',
          expected: 'What is quantum computing?'
        },
        {
          input: '@lookout explain neural networks!',
          expected: 'explain neural networks!'
        },
        {
          input: '@lookout How do transformers work in NLP?',
          expected: 'How do transformers work in NLP?'
        },
        {
          input: '@lookout what are the pros and cons of blockchain technology',
          expected: 'what are the pros and cons of blockchain technology'
        },
        {
          input: '@lookout Can you explain the difference between AI, ML, and Deep Learning?',
          expected: 'Can you explain the difference between AI, ML, and Deep Learning?'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const extracted = extractQuestionFromLookoutCommand(input);
        expect(extracted).toBe(expected);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle edge cases gracefully', () => {
      const edgeCases = [
        {
          input: '@lookout     multiple    spaces    in    question',
          expectedQuestion: 'multiple    spaces    in    question'
        },
        {
          input: '@lookout question with\nnewlines\nin it',
          expectedQuestion: 'question with\nnewlines\nin it'
        },
        {
          input: '@lookout question with special chars: @#$%^&*()',
          expectedQuestion: 'question with special chars: @#$%^&*()'
        }
      ];

      edgeCases.forEach(({ input, expectedQuestion }) => {
        const result = detectLookoutCommand(input);
        expect(result.isLookoutCommand).toBe(true);
        expect(result.question).toBe(expectedQuestion);
      });
    });

    it('should handle context with special characters and formatting', () => {
      const input = '@lookout explain this code';
      const contextSnippets = [
        'function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n-1) + fibonacci(n-2);\n}',
        'This is a recursive implementation with O(2^n) time complexity.'
      ];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain this code');
      expect(result.highlightedContext).toContain('function fibonacci');
      expect(result.highlightedContext).toContain('recursive implementation');
    });
  });

  describe('Integration with Existing Context System', () => {
    it('should work with the existing context array format used by useAIChatStore', () => {
      // Simulating the contextSnippets format from useAIChatStore
      const input = '@lookout summarize these concepts';
      const contextSnippets = [
        'Machine Learning: A subset of AI that enables computers to learn without being explicitly programmed.',
        'Deep Learning: A subset of ML that uses neural networks with multiple layers.',
        'Natural Language Processing: A branch of AI that helps computers understand human language.'
      ];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('summarize these concepts');
      expect(result.highlightedContext).toBe(
        'Machine Learning: A subset of AI that enables computers to learn without being explicitly programmed.\n\n' +
        'Deep Learning: A subset of ML that uses neural networks with multiple layers.\n\n' +
        'Natural Language Processing: A branch of AI that helps computers understand human language.'
      );
    });
  });
});