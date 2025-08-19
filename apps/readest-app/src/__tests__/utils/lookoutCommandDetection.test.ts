import { describe, it, expect } from 'vitest';
import {
  detectLookoutCommand,
  isValidLookoutCommand,
  extractQuestionFromLookoutCommand,
} from '@/app/reader/utils/lookoutCommandDetection';

describe('lookoutCommandDetection', () => {
  describe('detectLookoutCommand', () => {
    it('should detect valid lookout commands', () => {
      const result = detectLookoutCommand('@lookout what is quantum computing?');
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what is quantum computing?');
      expect(result.highlightedContext).toBeUndefined();
    });

    it('should detect lookout commands with case insensitive matching', () => {
      const result = detectLookoutCommand('@LOOKOUT explain this concept');
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain this concept');
    });

    it('should handle lookout commands with mixed case', () => {
      const result = detectLookoutCommand('@Lookout how does this work?');
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('how does this work?');
    });

    it('should include highlighted context when provided', () => {
      const contextSnippets = ['Selected text here', 'Another snippet'];
      const result = detectLookoutCommand('@lookout explain this', contextSnippets);
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain this');
      expect(result.highlightedContext).toBe('Selected text here\n\nAnother snippet');
    });

    it('should not detect non-lookout commands', () => {
      const result = detectLookoutCommand('regular chat message');
      
      expect(result.isLookoutCommand).toBe(false);
      expect(result.question).toBe('');
      expect(result.highlightedContext).toBeUndefined();
    });

    it('should not detect lookout without question', () => {
      const result = detectLookoutCommand('@lookout');
      
      expect(result.isLookoutCommand).toBe(false);
      expect(result.question).toBe('');
    });

    it('should not detect lookout with only whitespace', () => {
      const result = detectLookoutCommand('@lookout   ');
      
      expect(result.isLookoutCommand).toBe(false);
      expect(result.question).toBe('');
    });

    it('should handle extra whitespace around command', () => {
      const result = detectLookoutCommand('  @lookout   what is this?  ');
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what is this?');
    });

    it('should not detect lookout in middle of text', () => {
      const result = detectLookoutCommand('please @lookout explain this');
      
      expect(result.isLookoutCommand).toBe(false);
      expect(result.question).toBe('');
    });

    it('should handle empty context snippets', () => {
      const result = detectLookoutCommand('@lookout test question', []);
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('test question');
      expect(result.highlightedContext).toBeUndefined();
    });

    it('should handle single context snippet', () => {
      const result = detectLookoutCommand('@lookout explain', ['single context']);
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain');
      expect(result.highlightedContext).toBe('single context');
    });
  });

  describe('isValidLookoutCommand', () => {
    it('should validate correct lookout commands', () => {
      expect(isValidLookoutCommand('@lookout what is this?')).toBe(true);
      expect(isValidLookoutCommand('@LOOKOUT explain concept')).toBe(true);
      expect(isValidLookoutCommand('  @lookout  test  ')).toBe(true);
    });

    it('should reject invalid lookout commands', () => {
      expect(isValidLookoutCommand('@lookout')).toBe(false);
      expect(isValidLookoutCommand('@lookout   ')).toBe(false);
      expect(isValidLookoutCommand('regular message')).toBe(false);
      expect(isValidLookoutCommand('please @lookout explain')).toBe(false);
      expect(isValidLookoutCommand('')).toBe(false);
    });
  });

  describe('extractQuestionFromLookoutCommand', () => {
    it('should extract question from valid commands', () => {
      expect(extractQuestionFromLookoutCommand('@lookout what is quantum computing?'))
        .toBe('what is quantum computing?');
      expect(extractQuestionFromLookoutCommand('@LOOKOUT explain this concept'))
        .toBe('explain this concept');
      expect(extractQuestionFromLookoutCommand('  @lookout  test question  '))
        .toBe('test question');
    });

    it('should return empty string for invalid commands', () => {
      expect(extractQuestionFromLookoutCommand('@lookout')).toBe('');
      expect(extractQuestionFromLookoutCommand('regular message')).toBe('');
      expect(extractQuestionFromLookoutCommand('')).toBe('');
    });
  });
});