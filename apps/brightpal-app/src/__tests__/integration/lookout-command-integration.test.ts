import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectLookoutCommand } from '@/app/reader/utils/lookoutCommandDetection';

describe('Lookout Command Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectLookoutCommand integration scenarios', () => {
    it('should handle lookout command with highlighted text context', () => {
      const input = '@lookout explain this concept';
      const contextSnippets = [
        'Quantum computing is a type of computation that harnesses the collective properties of quantum states.',
        'Unlike classical computers, quantum computers use quantum bits or qubits.'
      ];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain this concept');
      expect(result.highlightedContext).toBe(
        'Quantum computing is a type of computation that harnesses the collective properties of quantum states.\n\n' +
        'Unlike classical computers, quantum computers use quantum bits or qubits.'
      );
    });

    it('should handle lookout command without context', () => {
      const input = '@lookout what is machine learning?';
      const contextSnippets: string[] = [];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what is machine learning?');
      expect(result.highlightedContext).toBeUndefined();
    });

    it('should handle normal chat input without lookout command', () => {
      const input = 'Can you help me understand this text?';
      const contextSnippets = ['Some highlighted text'];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(false);
      expect(result.question).toBe('');
      expect(result.highlightedContext).toBeUndefined();
    });

    it('should handle edge cases with whitespace and formatting', () => {
      const input = '  @lookout   how does this algorithm work?  ';
      const contextSnippets = ['  Algorithm pseudocode here  '];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('how does this algorithm work?');
      expect(result.highlightedContext).toBe('  Algorithm pseudocode here  ');
    });

    it('should validate command format correctly', () => {
      const validCommands = [
        '@lookout what is this?',
        '@LOOKOUT explain concept',
        '  @lookout  test question  ',
        '@Lookout How does it work?'
      ];

      const invalidCommands = [
        '@lookout',
        '@lookout   ',
        'please @lookout explain',
        'regular message',
        ''
      ];

      validCommands.forEach(cmd => {
        const result = detectLookoutCommand(cmd);
        expect(result.isLookoutCommand).toBe(true);
      });

      invalidCommands.forEach(cmd => {
        const result = detectLookoutCommand(cmd);
        expect(result.isLookoutCommand).toBe(false);
      });
    });

    it('should handle complex questions with punctuation', () => {
      const input = '@lookout What is the difference between AI, ML, and Deep Learning?';
      const result = detectLookoutCommand(input);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('What is the difference between AI, ML, and Deep Learning?');
    });

    it('should handle multi-line context snippets', () => {
      const input = '@lookout summarize this';
      const contextSnippets = [
        'First paragraph of text\nwith multiple lines',
        'Second paragraph\nwith more content\nand even more lines'
      ];

      const result = detectLookoutCommand(input, contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('summarize this');
      expect(result.highlightedContext).toBe(
        'First paragraph of text\nwith multiple lines\n\n' +
        'Second paragraph\nwith more content\nand even more lines'
      );
    });
  });

  describe('Requirements validation', () => {
    it('should satisfy requirement 1.1: detect @lookout command and extract question', () => {
      const input = '@lookout explain quantum entanglement';
      const result = detectLookoutCommand(input);

      // WHEN a user types `@lookout <question>` in the chat input 
      // THEN the system SHALL detect the command and extract the question
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain quantum entanglement');
    });

    it('should satisfy requirement 1.2: combine highlighted text and user question', () => {
      const input = '@lookout what does this mean?';
      const contextSnippets = ['Highlighted technical text about quantum mechanics'];
      const result = detectLookoutCommand(input, contextSnippets);

      // WHEN the lookout command is detected AND there is highlighted text context 
      // THEN the system SHALL combine both the highlighted text and user question for research
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what does this mean?');
      expect(result.highlightedContext).toBe('Highlighted technical text about quantum mechanics');
    });

    it('should satisfy requirement 5.1: detect lookout commands without interfering with normal chat', () => {
      const normalInput = 'Can you help me with this problem?';
      const lookoutInput = '@lookout explain this concept';

      const normalResult = detectLookoutCommand(normalInput);
      const lookoutResult = detectLookoutCommand(lookoutInput);

      // WHEN the user types in the chat input 
      // THEN the system SHALL detect `@lookout` commands without interfering with normal chat
      expect(normalResult.isLookoutCommand).toBe(false);
      expect(lookoutResult.isLookoutCommand).toBe(true);
    });

    it('should handle requirement 1.6: search based on user question even without highlighted context', () => {
      const input = '@lookout what is artificial intelligence?';
      const result = detectLookoutCommand(input, []);

      // When the lookout command is detected even when the highlighted text context are not added by user, 
      // lookout command still search on web based on what user asked in the prompt
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what is artificial intelligence?');
      expect(result.highlightedContext).toBeUndefined();
    });
  });
});