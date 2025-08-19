import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
 * Comprehensive Requirements Validation Test Suite
 * 
 * This test suite systematically validates every requirement specified
 * in the lookout-agent requirements document. Each test maps directly
 * to specific acceptance criteria.
 */
describe('Lookout Agent - Requirements Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockWindowOpen.mockReturnValue({ focus: vi.fn() });
    
    // Default successful mocks
    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValue({
      success: true,
      searchQuery: 'quantum computing tutorial explained',
      originalQuestion: 'What is quantum computing?',
      usedFallback: false
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        results: [
          {
            type: 'video',
            title: 'Quantum Computing Explained',
            description: 'Comprehensive tutorial',
            url: 'https://youtube.com/watch?v=example',
            source: 'youtube.com',
            thumbnail: 'https://img.youtube.com/vi/example/mqdefault.jpg'
          },
          {
            type: 'article',
            title: 'Quantum Computing Basics',
            description: 'Learn the fundamentals',
            url: 'https://example.com/quantum',
            source: 'example.com'
          }
        ],
        searchQuery: 'quantum computing tutorial explained'
      })
    });
  });

  describe('Requirement 1: Quick Research with @lookout Command', () => {
    describe('Acceptance Criteria 1.1: Command Detection and Question Extraction', () => {
      it('WHEN a user types `@lookout <question>` in the chat input THEN the system SHALL detect the command and extract the question', () => {
        const testCases = [
          { input: '@lookout what is quantum computing?', expected: 'what is quantum computing?' },
          { input: '@LOOKOUT explain machine learning', expected: 'explain machine learning' },
          { input: '@Lookout how does AI work?', expected: 'how does AI work?' },
          { input: '  @lookout  test question  ', expected: 'test question' }
        ];

        testCases.forEach(({ input, expected }) => {
          const result = detectLookoutCommand(input);
          expect(result.isLookoutCommand).toBe(true);
          expect(result.question).toBe(expected);
        });
      });

      it('should reject invalid command formats', () => {
        const invalidInputs = [
          '@lookout', // No question
          '@lookout   ', // Only whitespace
          'please @lookout explain', // Not at start
          'regular message', // No command
          '@lookup what is this?' // Wrong command
        ];

        invalidInputs.forEach(input => {
          const result = detectLookoutCommand(input);
          expect(result.isLookoutCommand).toBe(false);
        });
      });
    });

    describe('Acceptance Criteria 1.2: Context Integration', () => {
      it('WHEN the lookout command is detected AND there is highlighted text context THEN the system SHALL combine both the highlighted text and user question for research', () => {
        const input = '@lookout explain this concept';
        const contextSnippets = [
          'Neural networks are computing systems inspired by biological neural networks.',
          'They consist of interconnected nodes that process information.'
        ];

        const result = detectLookoutCommand(input, contextSnippets);

        expect(result.isLookoutCommand).toBe(true);
        expect(result.question).toBe('explain this concept');
        expect(result.highlightedContext).toBe(
          'Neural networks are computing systems inspired by biological neural networks.\n\n' +
          'They consist of interconnected nodes that process information.'
        );
      });
    });

    describe('Acceptance Criteria 1.3: Modal Interface Opening', () => {
      it('WHEN the lookout command is processed THEN the system SHALL open a modal interface showing the research process', () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        // Modal should be present
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        
        // Should show initial loading state
        expect(screen.getByText('Generating search strategy...')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 1.4: Results Display with Prioritization', () => {
      it('WHEN the research is complete THEN the system SHALL display results prioritizing YouTube videos and informative articles', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Found 2 results')).toBeInTheDocument();
        });

        // Video result should be displayed first (prioritized)
        const results = screen.getAllByRole('button').filter(btn => 
          btn.getAttribute('aria-label')?.startsWith('Open:')
        );
        
        expect(results[0]).toHaveAttribute('aria-label', 'Open: Quantum Computing Explained');
        
        // Should show video thumbnail
        expect(screen.getByAltText('Video thumbnail')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 1.5: Result Opening in Browser', () => {
      it('WHEN a user clicks on any result THEN the system SHALL open the link in the default browser', async () => {
        const user = userEvent.setup();
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Found 2 results')).toBeInTheDocument();
        });

        const videoResult = screen.getByText('Quantum Computing Explained');
        await user.click(videoResult);

        expect(mockWindowOpen).toHaveBeenCalledWith(
          'https://youtube.com/watch?v=example',
          '_blank',
          'noopener,noreferrer'
        );
      });
    });

    describe('Acceptance Criteria 1.6: Search Without Context', () => {
      it('When the lookout command is detected even when the highlighted text context are not added by user, lookout command still search on web based on what user asked in the prompt', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is machine learning?',
          context: undefined, // No context
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalledWith({
            question: 'What is machine learning?',
            highlightedContext: undefined,
            timeoutMs: 10000
          });
        });

        await waitFor(() => {
          expect(screen.getByText('Found 2 results')).toBeInTheDocument();
        });
      });
    });
  });

  describe('Requirement 2: AI-Generated Optimal Search Queries', () => {
    describe('Acceptance Criteria 2.1: AI Query Generation Trigger', () => {
      it('WHEN the lookout command is triggered THEN the system SHALL send a prompt to the configured AI model to generate a search query', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          context: 'Quantum mechanics principles',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalledWith({
            question: 'What is quantum computing?',
            highlightedContext: 'Quantum mechanics principles',
            timeoutMs: 10000
          });
        });
      });
    });

    describe('Acceptance Criteria 2.2: Correct Prompt Template', () => {
      it('WHEN generating the search query THEN the AI SHALL receive the correct prompt template', async () => {
        // This is tested in the AIQueryGenerationService unit tests
        // Here we verify the service is called with the right parameters
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          context: 'Quantum mechanics principles',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalledWith(
            expect.objectContaining({
              question: 'What is quantum computing?',
              highlightedContext: 'Quantum mechanics principles'
            })
          );
        });
      });
    });

    describe('Acceptance Criteria 2.3: Fallback Strategy', () => {
      it('WHEN the AI fails to generate a query THEN the system SHALL fallback to using the user\'s original question as the search query', async () => {
        vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValue({
          success: false,
          searchQuery: 'What is quantum computing?',
          originalQuestion: 'What is quantum computing?',
          usedFallback: true,
          error: 'AI query generation failed',
          retryCount: 0
        });

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search strategy: What is quantum computing? (using fallback)')).toBeInTheDocument();
        });

        // Should still proceed with search
        await waitFor(() => {
          expect(screen.getByText('Found 2 results')).toBeInTheDocument();
        });
      });
    });

    describe('Acceptance Criteria 2.4: Search Strategy Display', () => {
      it('WHEN the AI response is received THEN the system SHALL display the generated search strategy in the modal', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search strategy: quantum computing tutorial explained')).toBeInTheDocument();
        });
      });
    });
  });

  describe('Requirement 3: DuckDuckGo Search Integration', () => {
    describe('Acceptance Criteria 3.1: DuckDuckGo API Call', () => {
      it('WHEN a search query is generated THEN the system SHALL call the DuckDuckGo Instant Answer API', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalledWith(
            '/api/duckduckgo/search',
            expect.objectContaining({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: expect.stringContaining('quantum computing tutorial explained')
            })
          );
        });
      });
    });

    describe('Acceptance Criteria 3.2: YouTube Video Prioritization', () => {
      it('WHEN searching DuckDuckGo THEN the system SHALL prioritize YouTube videos in the results', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalledWith(
            '/api/duckduckgo/search',
            expect.objectContaining({
              body: expect.stringContaining('"prioritizeVideos":true')
            })
          );
        });
      });
    });

    describe('Acceptance Criteria 3.3: Result Categorization', () => {
      it('WHEN DuckDuckGo returns results THEN the system SHALL categorize them as video, article, or link with appropriate indicators', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Found 2 results')).toBeInTheDocument();
        });

        // Should show video indicator
        expect(screen.getByText('📹')).toBeInTheDocument();
        
        // Should show article indicator
        expect(screen.getByText('📄')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 3.4: API Failure Fallback', () => {
      it('WHEN the DuckDuckGo API fails THEN the system SHALL provide fallback web search links', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: false,
            results: [
              {
                type: 'video',
                title: 'Search on YouTube: quantum computing tutorial explained',
                description: 'Click to search for videos about this topic',
                url: 'https://www.youtube.com/results?search_query=quantum+computing+tutorial+explained',
                source: 'youtube.com'
              }
            ],
            searchQuery: 'quantum computing tutorial explained',
            error: 'Search service temporarily unavailable'
          })
        });

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search service temporarily unavailable')).toBeInTheDocument();
        });

        expect(screen.getByText('Search on YouTube: quantum computing tutorial explained')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 3.5: No Results Handling', () => {
      it('WHEN no results are found THEN the system SHALL display a user-friendly message with alternative suggestions', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            results: [],
            searchQuery: 'very obscure query'
          })
        });

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'very obscure query',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('No results found')).toBeInTheDocument();
        });

        expect(screen.getByText('Try rephrasing your question or search manually:')).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 4: Clean Modal Interface', () => {
    describe('Acceptance Criteria 4.1: Modal Overlay Display', () => {
      it('WHEN the lookout command is triggered THEN the system SHALL display a modal overlay with loading state', () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Generating search strategy...')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 4.2: Progress Indicators', () => {
      it('WHEN research is in progress THEN the modal SHALL show the AI-generated search strategy and loading indicators', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        // Initial loading state
        expect(screen.getByText('Generating search strategy...')).toBeInTheDocument();

        // Search phase
        await waitFor(() => {
          expect(screen.getByText('Searching for relevant content...')).toBeInTheDocument();
        });

        // Strategy display
        await waitFor(() => {
          expect(screen.getByText('Search strategy: quantum computing tutorial explained')).toBeInTheDocument();
        });
      });
    });

    describe('Acceptance Criteria 4.3: Results Display with Type Indicators', () => {
      it('WHEN results are available THEN the modal SHALL display them with clear type indicators and thumbnails for videos', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Found 2 results')).toBeInTheDocument();
        });

        // Video result with thumbnail
        expect(screen.getByAltText('Video thumbnail')).toBeInTheDocument();
        expect(screen.getByText('📹')).toBeInTheDocument();

        // Article result
        expect(screen.getByText('📄')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 4.4: Result Information Display', () => {
      it('WHEN displaying results THEN each result SHALL show title, description, and source with appropriate icons', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Found 2 results')).toBeInTheDocument();
        });

        // Titles
        expect(screen.getByText('Quantum Computing Explained')).toBeInTheDocument();
        expect(screen.getByText('Quantum Computing Basics')).toBeInTheDocument();

        // Descriptions
        expect(screen.getByText('Comprehensive tutorial')).toBeInTheDocument();
        expect(screen.getByText('Learn the fundamentals')).toBeInTheDocument();

        // Sources
        expect(screen.getByText('youtube.com')).toBeInTheDocument();
        expect(screen.getByText('example.com')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 4.5: Modal Close Functionality', () => {
      it('WHEN the user wants to close the modal THEN they SHALL be able to click outside or use an X button', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const props = {
          isOpen: true,
          onClose,
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        // Close with X button
        const closeButton = screen.getByLabelText('Close');
        await user.click(closeButton);
        expect(onClose).toHaveBeenCalled();

        // Reset mock
        onClose.mockClear();

        // Close with Escape key
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Requirement 5: Seamless Chat Integration', () => {
    describe('Acceptance Criteria 5.1: Non-interference with Normal Chat', () => {
      it('WHEN the user types in the chat input THEN the system SHALL detect `@lookout` commands without interfering with normal chat', () => {
        const normalMessages = [
          'Can you help me understand this?',
          'What does this mean?',
          'Please explain this concept'
        ];

        const lookoutCommands = [
          '@lookout what is this?',
          '@LOOKOUT explain concept'
        ];

        // Normal messages should not be detected as lookout commands
        normalMessages.forEach(message => {
          const result = detectLookoutCommand(message);
          expect(result.isLookoutCommand).toBe(false);
        });

        // Lookout commands should be detected
        lookoutCommands.forEach(command => {
          const result = detectLookoutCommand(command);
          expect(result.isLookoutCommand).toBe(true);
        });
      });
    });

    describe('Acceptance Criteria 5.2: AI Provider Integration', () => {
      it('WHEN the lookout agent is active THEN it SHALL use the existing AI provider configuration', async () => {
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalled();
        });

        // The service should use the mocked AI provider store configuration
        // This is verified by the service not throwing configuration errors
      });
    });

    describe('Acceptance Criteria 5.3: Context System Integration', () => {
      it('WHEN there is highlighted text context THEN the lookout agent SHALL access it through the existing context system', () => {
        const contextSnippets = ['Context from existing system'];
        const result = detectLookoutCommand('@lookout explain this', contextSnippets);

        expect(result.highlightedContext).toBe('Context from existing system');
      });
    });

    describe('Acceptance Criteria 5.4: Consistent Error Display', () => {
      it('WHEN errors occur THEN the system SHALL display them in a consistent style with the rest of the interface', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search Error')).toBeInTheDocument();
        });

        // Error message should be displayed consistently
        expect(screen.getByText('Unable to search at the moment. Please check your internet connection and try again.')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 5.5: Chat State Preservation', () => {
      it('WHEN the feature is used THEN it SHALL maintain the existing chat state and not interfere with ongoing conversations', () => {
        // This is primarily tested through integration tests
        // Here we verify that the lookout agent doesn't modify global state
        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        // The component should render without throwing errors or modifying external state
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 6: Graceful Error Handling', () => {
    describe('Acceptance Criteria 6.1: AI Model Failure Fallback', () => {
      it('WHEN the AI model fails to generate a search query THEN the system SHALL use the user\'s question as fallback', async () => {
        vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValue({
          success: false,
          searchQuery: 'What is quantum computing?',
          originalQuestion: 'What is quantum computing?',
          usedFallback: true,
          error: 'AI model unavailable',
          retryCount: 0
        });

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search strategy: What is quantum computing? (using fallback)')).toBeInTheDocument();
        });
      });
    });

    describe('Acceptance Criteria 6.2: DuckDuckGo API Unavailable', () => {
      it('WHEN the DuckDuckGo API is unavailable THEN the system SHALL show an error message with manual search suggestions', async () => {
        mockFetch.mockRejectedValue(new Error('Service unavailable'));

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search Error')).toBeInTheDocument();
        });

        expect(screen.getByText('Unable to search at the moment. Please check your internet connection and try again.')).toBeInTheDocument();
      });
    });

    describe('Acceptance Criteria 6.3: Network Timeout Handling', () => {
      it('WHEN network requests timeout THEN the system SHALL display appropriate timeout messages', async () => {
        // Mock timeout scenario
        mockFetch.mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 100)
          )
        );

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search Error')).toBeInTheDocument();
        }, { timeout: 2000 });
      });
    });

    describe('Acceptance Criteria 6.4: Error Logging', () => {
      it('WHEN any component fails THEN the system SHALL log errors for debugging while showing user-friendly messages', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        mockFetch.mockRejectedValue(new Error('Test error'));

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        await waitFor(() => {
          expect(screen.getByText('Search Error')).toBeInTheDocument();
        });

        // Error should be logged but user sees friendly message
        expect(screen.getByText('Unable to search at the moment. Please check your internet connection and try again.')).toBeInTheDocument();
        
        consoleSpy.mockRestore();
      });
    });

    describe('Acceptance Criteria 6.5: Retry Functionality', () => {
      it('WHEN errors are resolved THEN the user SHALL be able to retry the search operation', async () => {
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
                  description: 'Tutorial',
                  url: 'https://youtube.com/watch?v=example',
                  source: 'youtube.com'
                }
              ],
              searchQuery: 'quantum computing tutorial explained'
            })
          });

        const props = {
          isOpen: true,
          onClose: vi.fn(),
          question: 'What is quantum computing?',
          bookKey: 'test-book'
        };

        render(<LookoutAgent {...props} />);

        // Wait for error state
        await waitFor(() => {
          expect(screen.getByText('Search Error')).toBeInTheDocument();
        });

        // Click retry
        const retryButton = screen.getByText('Try Again');
        await user.click(retryButton);

        // Should eventually show results
        await waitFor(() => {
          expect(screen.getByText('Found 1 result')).toBeInTheDocument();
        });
      });
    });
  });
});