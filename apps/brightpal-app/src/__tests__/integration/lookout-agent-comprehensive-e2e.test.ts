import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { LookoutAgent } from '@/app/reader/components/LookoutAgent';
import { detectLookoutCommand } from '@/app/reader/utils/lookoutCommandDetection';
import { AIQueryGenerationService } from '@/app/reader/services/aiQueryGenerationService';
import { ErrorHandlingService } from '@/app/reader/services/errorHandlingService';

// Mock dependencies
vi.mock('@/app/reader/services/aiQueryGenerationService');
vi.mock('@/app/reader/services/errorHandlingService');
vi.mock('@/store/aiProviderStore', () => ({
  useAIProviderStore: {
    getState: vi.fn(() => ({
      defaultProvider: 'gemini',
      gemini: { apiKey: 'test-key', model: 'gemini-2.0-flash' }
    }))
  }
}));

// Mock fetch for DuckDuckGo API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen
});

/**
 * Comprehensive End-to-End Test Suite for Lookout Agent
 * 
 * This test suite validates the complete workflow from command detection
 * through AI query generation, search execution, and result display.
 * It covers all requirements and edge cases specified in the design document.
 */
describe('Lookout Agent - Comprehensive End-to-End Tests', () => {
  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    question: 'What is quantum computing?',
    context: 'Quantum mechanics is a fundamental theory in physics.',
    bookKey: 'test-book'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockWindowOpen.mockReturnValue({ focus: vi.fn() });
    
    // Mock successful AI query generation by default
    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValue({
      success: true,
      searchQuery: 'quantum computing explained tutorial',
      originalQuestion: 'What is quantum computing?',
      usedFallback: false
    });

    // Mock successful DuckDuckGo search by default
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        results: [
          {
            type: 'video',
            title: 'Quantum Computing Explained',
            description: 'A comprehensive tutorial on quantum computing',
            url: 'https://youtube.com/watch?v=example',
            source: 'youtube.com',
            thumbnail: 'https://img.youtube.com/vi/example/mqdefault.jpg'
          },
          {
            type: 'article',
            title: 'Introduction to Quantum Computing',
            description: 'Learn the basics of quantum computing',
            url: 'https://example.com/quantum-computing',
            source: 'example.com'
          }
        ],
        searchQuery: 'quantum computing explained tutorial'
      })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Workflow - Happy Path', () => {
    it('should execute the complete lookout workflow successfully', async () => {
      const user = userEvent.setup();
      
      render(<LookoutAgent {...mockProps} />);

      // Step 1: Modal should open and show generating query stage
      expect(screen.getByText('Generating search strategy...')).toBeInTheDocument();
      expect(screen.getByText('Analyzing your question and context to create the best search query')).toBeInTheDocument();

      // Step 2: Wait for AI query generation to complete
      await waitFor(() => {
        expect(screen.getByText('Searching for relevant content...')).toBeInTheDocument();
      });

      // Verify AI service was called with correct parameters
      expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalledWith({
        question: 'What is quantum computing?',
        highlightedContext: 'Quantum mechanics is a fundamental theory in physics.',
        timeoutMs: 10000
      });

      // Step 3: Wait for search results to appear
      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Step 4: Verify search strategy is displayed
      expect(screen.getByText('Search strategy: quantum computing explained tutorial')).toBeInTheDocument();

      // Step 5: Verify results are displayed correctly
      expect(screen.getByText('Quantum Computing Explained')).toBeInTheDocument();
      expect(screen.getByText('Introduction to Quantum Computing')).toBeInTheDocument();
      
      // Verify video result has thumbnail
      const videoThumbnail = screen.getByAltText('Video thumbnail');
      expect(videoThumbnail).toBeInTheDocument();
      expect(videoThumbnail).toHaveAttribute('src', 'https://img.youtube.com/vi/example/mqdefault.jpg');

      // Step 6: Test result interaction
      const videoResult = screen.getByText('Quantum Computing Explained');
      await user.click(videoResult);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=example',
        '_blank',
        'noopener,noreferrer'
      );

      // Step 7: Test modal close functionality
      const closeButton = screen.getByLabelText('Close');
      await user.click(closeButton);

      expect(mockProps.onClose).toHaveBeenCalled();
    });

    it('should handle workflow with no context provided', async () => {
      const propsWithoutContext = {
        ...mockProps,
        context: undefined
      };

      render(<LookoutAgent {...propsWithoutContext} />);

      await waitFor(() => {
        expect(screen.getByText('Searching for relevant content...')).toBeInTheDocument();
      });

      // Verify AI service was called without context
      expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalledWith({
        question: 'What is quantum computing?',
        highlightedContext: undefined,
        timeoutMs: 10000
      });

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Workflows', () => {
    it('should handle AI query generation failure gracefully', async () => {
      // Mock AI service failure
      vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValue({
        success: false,
        searchQuery: 'What is quantum computing?',
        originalQuestion: 'What is quantum computing?',
        usedFallback: true,
        error: 'AI query generation failed. Using your original question for search.',
        retryCount: 0
      });

      render(<LookoutAgent {...mockProps} />);

      // Should still proceed with search using fallback
      await waitFor(() => {
        expect(screen.getByText('Searching for relevant content...')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Should show fallback message
      expect(screen.getByText('Search strategy: What is quantum computing? (using fallback)')).toBeInTheDocument();
    });

    it('should handle DuckDuckGo API failure with fallback results', async () => {
      // Mock DuckDuckGo API failure
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          results: [
            {
              type: 'video',
              title: 'Search on YouTube: quantum computing explained tutorial',
              description: 'Click to search for videos about this topic',
              url: 'https://www.youtube.com/results?search_query=quantum+computing+explained+tutorial',
              source: 'youtube.com'
            },
            {
              type: 'article',
              title: 'Search on Google: quantum computing explained tutorial',
              description: 'Click to search for articles about this topic',
              url: 'https://www.google.com/search?q=quantum+computing+explained+tutorial',
              source: 'google.com'
            }
          ],
          searchQuery: 'quantum computing explained tutorial',
          error: 'Search service temporarily unavailable. Here are some manual search options:'
        })
      });

      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Should show error message and fallback results
      expect(screen.getByText('Search service temporarily unavailable. Here are some manual search options:')).toBeInTheDocument();
      expect(screen.getByText('Search on YouTube: quantum computing explained tutorial')).toBeInTheDocument();
      expect(screen.getByText('Search on Google: quantum computing explained tutorial')).toBeInTheDocument();
    });

    it('should handle complete network failure', async () => {
      // Mock network failure
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Search Error')).toBeInTheDocument();
      });

      expect(screen.getByText('Unable to search at the moment. Please check your internet connection and try again.')).toBeInTheDocument();
      
      // Should show retry button
      const retryButton = screen.getByText('Try Again');
      expect(retryButton).toBeInTheDocument();
    });

    it('should handle retry functionality', async () => {
      const user = userEvent.setup();
      
      // Mock initial failure then success
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            results: [
              {
                type: 'video',
                title: 'Quantum Computing Explained',
                description: 'A comprehensive tutorial',
                url: 'https://youtube.com/watch?v=example',
                source: 'youtube.com'
              }
            ],
            searchQuery: 'quantum computing explained tutorial'
          })
        });

      render(<LookoutAgent {...mockProps} />);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Search Error')).toBeInTheDocument();
      });

      // Click retry
      const retryButton = screen.getByText('Try Again');
      await user.click(retryButton);

      // Should show loading again
      expect(screen.getByText('Searching for relevant content...')).toBeInTheDocument();

      // Should eventually show results
      await waitFor(() => {
        expect(screen.getByText('Found 1 result')).toBeInTheDocument();
      });

      expect(screen.getByText('Quantum Computing Explained')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation and Accessibility', () => {
    it('should support full keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(<LookoutAgent {...mockProps} />);

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Focus should be on the modal
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveFocus();

      // Tab to first result
      await user.tab();
      const firstResult = screen.getByLabelText('Open: Quantum Computing Explained');
      expect(firstResult).toHaveFocus();

      // Arrow down to second result
      await user.keyboard('{ArrowDown}');
      const secondResult = screen.getByLabelText('Open: Introduction to Quantum Computing');
      expect(secondResult).toHaveFocus();

      // Enter to open result
      await user.keyboard('{Enter}');
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://example.com/quantum-computing',
        '_blank',
        'noopener,noreferrer'
      );

      // Escape to close modal
      await user.keyboard('{Escape}');
      expect(mockProps.onClose).toHaveBeenCalled();
    });

    it('should have proper ARIA labels and roles', async () => {
      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Modal should have proper role and label
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-labelledby', 'lookout-modal-title');

      // Results should have proper labels
      expect(screen.getByLabelText('Open: Quantum Computing Explained')).toBeInTheDocument();
      expect(screen.getByLabelText('Open: Introduction to Quantum Computing')).toBeInTheDocument();

      // Close button should be accessible
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large result sets efficiently', async () => {
      // Mock large result set
      const largeResults = Array.from({ length: 50 }, (_, i) => ({
        type: i % 3 === 0 ? 'video' : i % 3 === 1 ? 'article' : 'link',
        title: `Result ${i + 1}`,
        description: `Description for result ${i + 1}`,
        url: `https://example.com/result-${i + 1}`,
        source: 'example.com'
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
      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Found 50 results')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (less than 1 second)
      expect(renderTime).toBeLessThan(1000);

      // Should display all results
      expect(screen.getByText('Result 1')).toBeInTheDocument();
      expect(screen.getByText('Result 50')).toBeInTheDocument();
    });

    it('should handle special characters in queries and results', async () => {
      const specialCharProps = {
        ...mockProps,
        question: 'What is C++ & how does it work?',
        context: 'Code: int main() { return 0; }'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [
            {
              type: 'article',
              title: 'C++ Programming: Basics & Advanced',
              description: 'Learn C++ from "Hello World" to complex algorithms',
              url: 'https://example.com/cpp-tutorial?lang=en&level=beginner',
              source: 'example.com'
            }
          ],
          searchQuery: 'C++ programming tutorial'
        })
      });

      render(<LookoutAgent {...specialCharProps} />);

      await waitFor(() => {
        expect(screen.getByText('Found 1 result')).toBeInTheDocument();
      });

      expect(screen.getByText('C++ Programming: Basics & Advanced')).toBeInTheDocument();
      expect(screen.getByText('Learn C++ from "Hello World" to complex algorithms')).toBeInTheDocument();
    });

    it('should handle concurrent requests properly', async () => {
      const user = userEvent.setup();
      
      // Mock slow response
      let resolveFirst: (value: any) => void;
      const firstRequest = new Promise(resolve => {
        resolveFirst = resolve;
      });

      mockFetch.mockReturnValueOnce(firstRequest);

      const { rerender } = render(<LookoutAgent {...mockProps} />);

      // Immediately close and reopen with different question
      rerender(<LookoutAgent {...mockProps} isOpen={false} />);
      rerender(<LookoutAgent {...mockProps} question="What is machine learning?" />);

      // Resolve first request (should be ignored)
      resolveFirst!({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          results: [{ type: 'article', title: 'Old Result', url: 'https://old.com', source: 'old.com' }],
          searchQuery: 'old query'
        })
      });

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Should show results for the current question, not the old one
      expect(screen.queryByText('Old Result')).not.toBeInTheDocument();
    });
  });

  describe('Integration with Command Detection', () => {
    it('should integrate properly with command detection system', () => {
      // Test various command formats
      const testCases = [
        {
          input: '@lookout what is quantum computing?',
          expected: { isLookoutCommand: true, question: 'what is quantum computing?' }
        },
        {
          input: '@LOOKOUT explain machine learning',
          expected: { isLookoutCommand: true, question: 'explain machine learning' }
        },
        {
          input: '  @lookout  how does AI work?  ',
          expected: { isLookoutCommand: true, question: 'how does AI work?' }
        },
        {
          input: 'regular chat message',
          expected: { isLookoutCommand: false, question: '' }
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = detectLookoutCommand(input);
        expect(result.isLookoutCommand).toBe(expected.isLookoutCommand);
        expect(result.question).toBe(expected.question);
      });
    });

    it('should handle context integration correctly', () => {
      const contextSnippets = [
        'First context snippet about neural networks',
        'Second context snippet about deep learning'
      ];

      const result = detectLookoutCommand('@lookout explain this', contextSnippets);

      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('explain this');
      expect(result.highlightedContext).toBe(
        'First context snippet about neural networks\n\nSecond context snippet about deep learning'
      );
    });
  });

  describe('Requirements Validation', () => {
    it('should validate Requirement 1.1: Command detection and question extraction', () => {
      const result = detectLookoutCommand('@lookout what is quantum computing?');
      expect(result.isLookoutCommand).toBe(true);
      expect(result.question).toBe('what is quantum computing?');
    });

    it('should validate Requirement 1.2: Context integration', () => {
      const result = detectLookoutCommand('@lookout explain this', ['context text']);
      expect(result.isLookoutCommand).toBe(true);
      expect(result.highlightedContext).toBe('context text');
    });

    it('should validate Requirement 1.3: Modal interface opening', async () => {
      render(<LookoutAgent {...mockProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should validate Requirement 1.4: Results prioritization', async () => {
      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      // Video result should appear first (prioritized)
      const results = screen.getAllByRole('button').filter(btn => 
        btn.getAttribute('aria-label')?.startsWith('Open:')
      );
      
      expect(results[0]).toHaveAttribute('aria-label', 'Open: Quantum Computing Explained');
    });

    it('should validate Requirement 1.5: Result opening in browser', async () => {
      const user = userEvent.setup();
      
      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Found 2 results')).toBeInTheDocument();
      });

      const result = screen.getByText('Quantum Computing Explained');
      await user.click(result);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=example',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should validate Requirement 2.1: AI query generation', async () => {
      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalled();
      });
    });

    it('should validate Requirement 2.3: Fallback to original question', async () => {
      vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValue({
        success: false,
        searchQuery: 'What is quantum computing?',
        originalQuestion: 'What is quantum computing?',
        usedFallback: true,
        error: 'AI failed',
        retryCount: 0
      });

      render(<LookoutAgent {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Search strategy: What is quantum computing? (using fallback)')).toBeInTheDocument();
      });
    });
  });
});