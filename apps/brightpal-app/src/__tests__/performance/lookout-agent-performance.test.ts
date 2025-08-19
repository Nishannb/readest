import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LookoutAgent } from '@/app/reader/components/LookoutAgent';
import { detectLookoutCommand } from '@/app/reader/utils/lookoutCommandDetection';
import { AIQueryGenerationService } from '@/app/reader/services/aiQueryGenerationService';

// Mock dependencies
vi.mock('@/app/reader/services/aiQueryGenerationService');
vi.mock('@/store/aiProviderStore', () => ({
  useAIProviderStore: {
    getState: vi.fn(() => ({
      defaultProvider: 'gemini',
      gemini: { apiKey: 'test-key', model: 'gemini-2.0-flash' }
    }))
  }
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen
});

/**
 * Performance and Edge Case Test Suite for Lookout Agent
 * 
 * This test suite focuses on performance characteristics, edge cases,
 * stress testing, and boundary conditions to ensure the system
 * remains stable and responsive under various conditions.
 */
describe('Lookout Agent - Performance and Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockWindowOpen.mockReturnValue({ focus: vi.fn() });
    
    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValue({
      success: true,
      searchQuery: 'test query',
      originalQuestion: 'test',
      usedFallback: false
    });
  });

  describe('Performance Tests', () => {
    it('should render modal within acceptable time limits', async () => {
      const startTime = performance.now();
      
      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'What is quantum computing?',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within 100ms
      expect(renderTime).toBeLessThan(100);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle large result sets efficiently', async () => {
      // Generate large result set
      const largeResults = Array.from({ length: 100 }, (_, i) => ({
        type: i % 3 === 0 ? 'video' : i % 3 === 1 ? 'article' : 'link',
        title: `Result ${i + 1} - This is a very long title that might cause performance issues if not handled properly`,
        description: `This is a detailed description for result ${i + 1} that contains a lot of text to test rendering performance with large amounts of content`,
        url: `https://example.com/result-${i + 1}?param1=value1&param2=value2&param3=value3`,
        source: `source${i % 10}.com`,
        thumbnail: i % 3 === 0 ? `https://img.youtube.com/vi/example${i}/mqdefault.jpg` : undefined
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: largeResults,
          searchQuery: 'test query'
        })
      });

      const startTime = performance.now();
      
      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 100 results')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should handle large result sets within reasonable time (2 seconds)
      expect(totalTime).toBeLessThan(2000);

      // Should display first and last results
      expect(screen.getByText('Result 1 - This is a very long title that might cause performance issues if not handled properly')).toBeInTheDocument();
      expect(screen.getByText('Result 100 - This is a very long title that might cause performance issues if not handled properly')).toBeInTheDocument();
    });

    it('should handle rapid modal open/close cycles', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      
      const props = {
        isOpen: true,
        onClose,
        question: 'test query',
        bookKey: 'test-book'
      };

      const { rerender } = render(<LookoutAgent {...props} />);

      // Rapidly toggle modal state
      for (let i = 0; i < 10; i++) {
        rerender(<LookoutAgent {...props} isOpen={false} />);
        rerender(<LookoutAgent {...props} isOpen={true} />);
      }

      // Should still be functional
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      
      const closeButton = screen.getByLabelText('Close');
      await user.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    });

    it('should handle concurrent API requests properly', async () => {
      let resolveFirst: (value: any) => void;
      let resolveSecond: (value: any) => void;
      
      const firstRequest = new Promise(resolve => {
        resolveFirst = resolve;
      });
      
      const secondRequest = new Promise(resolve => {
        resolveSecond = resolve;
      });

      mockFetch
        .mockReturnValueOnce(firstRequest)
        .mockReturnValueOnce(secondRequest);

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'first query',
        bookKey: 'test-book'
      };

      const { rerender } = render(<LookoutAgent {...props} />);

      // Change question while first request is pending
      rerender(<LookoutAgent {...props} question="second query" />);

      // Resolve first request (should be ignored)
      resolveFirst!({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [{ type: 'article', title: 'Old Result', url: 'https://old.com', source: 'old.com' }],
          searchQuery: 'first query'
        })
      });

      // Resolve second request
      resolveSecond!({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [{ type: 'article', title: 'New Result', url: 'https://new.com', source: 'new.com' }],
          searchQuery: 'second query'
        })
      });

      await waitFor(() => {
        expect(screen.getByText('Found 1 result')).toBeInTheDocument();
      });

      // Should show results for the current question, not the old one
      expect(screen.getByText('New Result')).toBeInTheDocument();
      expect(screen.queryByText('Old Result')).not.toBeInTheDocument();
    });

    it('should handle memory efficiently with repeated usage', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Simulate multiple lookout sessions
      for (let i = 0; i < 20; i++) {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: `test query ${i}`,
          bookKey: 'test-book'
        };

        const { unmount } = render(<LookoutAgent {...props} />);
        
        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        });
        
        unmount();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      if (initialMemory > 0) {
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely long questions', () => {
      const longQuestion = 'What is '.repeat(1000) + 'quantum computing?';
      
      const result = detectLookoutCommand(`@lookout ${longQuestion}`);
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe(longQuestion);
    });

    it('should handle questions with special characters and unicode', () => {
      const specialQuestion = '@lookout What is 量子计算 and how does it relate to Schrödinger\'s cat? 🐱⚛️';
      
      const result = detectLookoutCommand(specialQuestion);
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('What is 量子计算 and how does it relate to Schrödinger\'s cat? 🐱⚛️');
    });

    it('should handle context with extremely long text', () => {
      const longContext = 'This is a very long context. '.repeat(1000);
      
      const result = detectLookoutCommand('@lookout explain this', [longContext]);
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.highlightedContext).toBe(longContext);
    });

    it('should handle malformed URLs in results gracefully', async () => {
      const malformedResults = [
        {
          type: 'video',
          title: 'Test Video',
          description: 'Test description',
          url: 'not-a-valid-url',
          source: 'test.com'
        },
        {
          type: 'article',
          title: 'Test Article',
          description: 'Test description',
          url: 'javascript:alert("xss")',
          source: 'malicious.com'
        },
        {
          type: 'link',
          title: 'Test Link',
          description: 'Test description',
          url: '',
          source: 'empty.com'
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: malformedResults,
          searchQuery: 'test query'
        })
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 3 results')).toBeInTheDocument();
      });

      // Should still display results without crashing
      expect(screen.getByText('Test Video')).toBeInTheDocument();
      expect(screen.getByText('Test Article')).toBeInTheDocument();
      expect(screen.getByText('Test Link')).toBeInTheDocument();
    });

    it('should handle empty or null result fields', async () => {
      const incompleteResults = [
        {
          type: 'video',
          title: '',
          description: null,
          url: 'https://youtube.com/watch?v=example',
          source: ''
        },
        {
          type: 'article',
          title: 'Valid Title',
          description: undefined,
          url: 'https://example.com',
          source: 'example.com'
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: incompleteResults,
          searchQuery: 'test query'
        })
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Should handle missing fields gracefully
      expect(screen.getByText('Valid Title')).toBeInTheDocument();
    });

    it('should handle network interruptions gracefully', async () => {
      // Mock network interruption
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network connection lost')), 100);
        });
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Search Error')).toBeInTheDocument();
      });

      expect(screen.getByText('Unable to search at the moment. Please check your internet connection and try again.')).toBeInTheDocument();
    });

    it('should handle rapid user interactions', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [
            {
              type: 'video',
              title: 'Test Video',
              description: 'Test description',
              url: 'https://youtube.com/watch?v=example',
              source: 'youtube.com'
            }
          ],
          searchQuery: 'test query'
        })
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 1 result')).toBeInTheDocument();
      });

      const result = screen.getByText('Test Video');

      // Rapidly click the result multiple times
      for (let i = 0; i < 10; i++) {
        await user.click(result);
      }

      // Should handle multiple clicks without issues
      expect(mockWindowOpen).toHaveBeenCalledTimes(10);
    });

    it('should handle browser popup blocking', async () => {
      const user = userEvent.setup();
      
      // Mock popup blocking
      mockWindowOpen.mockImplementation(() => {
        throw new Error('Popup blocked');
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [
            {
              type: 'video',
              title: 'Test Video',
              description: 'Test description',
              url: 'https://youtube.com/watch?v=example',
              source: 'youtube.com'
            }
          ],
          searchQuery: 'test query'
        })
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 1 result')).toBeInTheDocument();
      });

      const result = screen.getByText('Test Video');
      
      // Should not crash when popup is blocked
      await user.click(result);
      
      // Component should still be functional
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Stress Tests', () => {
    it('should handle rapid modal state changes', async () => {
      const onClose = vi.fn();
      const props = {
        isOpen: true,
        onClose,
        question: 'test query',
        bookKey: 'test-book'
      };

      const { rerender } = render(<LookoutAgent {...props} />);

      // Rapidly change modal state 100 times
      for (let i = 0; i < 100; i++) {
        rerender(<LookoutAgent {...props} isOpen={i % 2 === 0} />);
      }

      // Should end in a stable state
      rerender(<LookoutAgent {...props} isOpen={true} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle multiple simultaneous error conditions', async () => {
      // Mock AI service failure
      vi.mocked(AIQueryGenerationService.generateSearchQuery).mockRejectedValue(
        new Error('AI service unavailable')
      );

      // Mock fetch failure
      mockFetch.mockRejectedValue(new Error('Network error'));

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      // Should handle multiple failures gracefully
      await waitFor(() => {
        expect(screen.getByText('Search Error')).toBeInTheDocument();
      });

      expect(screen.getByText('Unable to search at the moment. Please check your internet connection and try again.')).toBeInTheDocument();
    });

    it('should maintain performance with complex result data', async () => {
      // Generate complex results with nested data
      const complexResults = Array.from({ length: 50 }, (_, i) => ({
        type: 'article',
        title: `Complex Result ${i + 1}`.repeat(10),
        description: `This is a very complex description with lots of nested data and special characters: ${JSON.stringify({ nested: { data: { value: i } } })}`,
        url: `https://example.com/complex-result-${i + 1}?${new URLSearchParams(Object.fromEntries(Array.from({ length: 20 }, (_, j) => [`param${j}`, `value${j}`]))).toString()}`,
        source: `complex-source-${i % 5}.com`,
        metadata: {
          tags: Array.from({ length: 10 }, (_, j) => `tag${j}`),
          categories: Array.from({ length: 5 }, (_, j) => `category${j}`),
          timestamps: Array.from({ length: 10 }, (_, j) => Date.now() + j * 1000)
        }
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: complexResults,
          searchQuery: 'complex test query',
          metadata: {
            totalResults: 1000,
            searchTime: 0.5,
            sources: ['source1', 'source2', 'source3']
          }
        })
      });

      const startTime = performance.now();
      
      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'complex test query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 50 results')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should handle complex data within reasonable time
      expect(totalTime).toBeLessThan(3000);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle zero results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [],
          searchQuery: 'no results query'
        })
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'no results query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
    });

    it('should handle exactly one result', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [
            {
              type: 'video',
              title: 'Single Result',
              description: 'The only result',
              url: 'https://youtube.com/watch?v=single',
              source: 'youtube.com'
            }
          ],
          searchQuery: 'single result query'
        })
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'single result query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 1 result')).toBeInTheDocument();
      });

      expect(screen.getByText('Single Result')).toBeInTheDocument();
    });

    it('should handle maximum reasonable result count', async () => {
      // Test with 1000 results (upper boundary)
      const maxResults = Array.from({ length: 1000 }, (_, i) => ({
        type: 'article',
        title: `Result ${i + 1}`,
        description: `Description ${i + 1}`,
        url: `https://example.com/result-${i + 1}`,
        source: 'example.com'
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: maxResults,
          searchQuery: 'max results query'
        })
      });

      const props = {
        isOpen: true,
        onClose: vi.fn(),
        question: 'max results query',
        bookKey: 'test-book'
      };

      render(<LookoutAgent {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Found 1000 results')).toBeInTheDocument();
      });

      // Should still be responsive
      expect(screen.getByText('Result 1')).toBeInTheDocument();
    });

    it('should handle minimum valid question length', () => {
      const result = detectLookoutCommand('@lookout a');
      
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('a');
    });

    it('should handle context at boundary conditions', () => {
      // Empty context array
      const emptyResult = detectLookoutCommand('@lookout test', []);
      expect(emptyResult.highlightedContext).toBeUndefined();

      // Single empty string in context
      const emptyStringResult = detectLookoutCommand('@lookout test', ['']);
      expect(emptyStringResult.highlightedContext).toBe('');

      // Multiple empty strings
      const multipleEmptyResult = detectLookoutCommand('@lookout test', ['', '', '']);
      expect(multipleEmptyResult.highlightedContext).toBe('\n\n');
    });
  });
});