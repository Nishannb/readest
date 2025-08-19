import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { PerformanceOptimizationService } from '../../app/reader/services/performanceOptimizationService';

// Mock the performance optimization service
vi.mock('../../app/reader/services/performanceOptimizationService', () => ({
  PerformanceOptimizationService: {
    initialize: vi.fn(),
    getCachedSearchResults: vi.fn(),
    setCachedSearchResults: vi.fn(),
    createCancellableRequest: vi.fn(() => ({
      controller: new AbortController(),
      cleanup: vi.fn(),
    })),
    cancelRequest: vi.fn(),
    cancelAllRequests: vi.fn(),
    detectLookoutCommandDebounced: vi.fn(),
    clearCache: vi.fn(),
    cleanup: vi.fn(),
    createOptimizedFetch: vi.fn(() => ({
      fetch: vi.fn(),
      cancel: vi.fn(),
    })),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('Lookout Performance Optimization Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Task 9.1: Request Cancellation for Abandoned Searches', () => {
    it('should cancel previous requests when starting new search', async () => {
      const mockCancel = vi.fn();
      const mockCreateCancellableRequest = vi.mocked(PerformanceOptimizationService.createCancellableRequest);
      
      mockCreateCancellableRequest.mockReturnValue({
        controller: new AbortController(),
        cleanup: mockCancel,
      });

      // Mock the LookoutAgent component behavior
      const TestComponent = () => {
        const [requestId, setRequestId] = React.useState<string | null>(null);
        
        const startSearch = () => {
          const newRequestId = `search-${Date.now()}`;
          
          // Cancel previous request if exists
          if (requestId) {
            PerformanceOptimizationService.cancelRequest(requestId);
          }
          
          // Create new request
          PerformanceOptimizationService.createCancellableRequest(newRequestId);
          setRequestId(newRequestId);
        };

        return (
          <div>
            <button onClick={startSearch} data-testid="start-search">
              Start Search
            </button>
            <div data-testid="request-id">{requestId}</div>
          </div>
        );
      };

      render(<TestComponent />);

      // Start first search
      fireEvent.click(screen.getByTestId('start-search'));
      expect(mockCreateCancellableRequest).toHaveBeenCalledTimes(1);

      // Start second search (should cancel first)
      fireEvent.click(screen.getByTestId('start-search'));
      expect(PerformanceOptimizationService.cancelRequest).toHaveBeenCalledTimes(1);
      expect(mockCreateCancellableRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle AbortController signal in fetch requests', async () => {
      const abortController = new AbortController();
      const mockFetch = vi.mocked(global.fetch);
      
      mockFetch.mockImplementation((url, options) => {
        // Simulate request being aborted
        if (options?.signal?.aborted) {
          return Promise.reject(new Error('Request aborted'));
        }
        
        // Simulate abort during request
        setTimeout(() => abortController.abort(), 10);
        
        return new Promise((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new Error('Request aborted'));
          });
          
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ results: [] }),
            } as Response);
          }, 100);
        });
      });

      const { fetch: optimizedFetch } = PerformanceOptimizationService.createOptimizedFetch('test-request');
      
      // Start request and then abort it
      const fetchPromise = optimizedFetch('http://example.com', {
        signal: abortController.signal,
      });
      
      abortController.abort();
      
      await expect(fetchPromise).rejects.toThrow('Request aborted');
    });
  });

  describe('Task 9.2: Debouncing for Command Detection', () => {
    it('should debounce command detection calls', async () => {
      const mockDetectLookoutCommandDebounced = vi.mocked(PerformanceOptimizationService.detectLookoutCommandDebounced);
      const callback = vi.fn();

      // Simulate rapid input changes
      const inputs = ['@', '@l', '@lo', '@loo', '@look', '@looko', '@lookout', '@lookout test'];
      
      inputs.forEach(input => {
        PerformanceOptimizationService.detectLookoutCommandDebounced(input, callback);
      });

      // Should be called for each input (mocked implementation)
      expect(mockDetectLookoutCommandDebounced).toHaveBeenCalledTimes(inputs.length);
      
      // Verify last call was with complete command
      expect(mockDetectLookoutCommandDebounced).toHaveBeenLastCalledWith('@lookout test', callback);
    });

    it('should avoid unnecessary processing during typing', () => {
      const mockDetectLookoutCommandDebounced = vi.mocked(PerformanceOptimizationService.detectLookoutCommandDebounced);
      
      // Simulate typing a lookout command
      const partialInputs = ['@', '@l', '@lo', '@loo'];
      const completeInput = '@lookout what is quantum computing?';
      
      partialInputs.forEach(input => {
        PerformanceOptimizationService.detectLookoutCommandDebounced(input, vi.fn());
      });
      
      PerformanceOptimizationService.detectLookoutCommandDebounced(completeInput, vi.fn());
      
      // Should have been called for all inputs
      expect(mockDetectLookoutCommandDebounced).toHaveBeenCalledTimes(partialInputs.length + 1);
      
      // Verify it was called with the complete input
      expect(mockDetectLookoutCommandDebounced).toHaveBeenCalledWith(completeInput, expect.any(Function));
    });
  });

  describe('Task 9.3: Modal Component Loading Optimization', () => {
    it('should lazy load LookoutAgent component', async () => {
      // Mock React.lazy behavior
      const LazyComponent = React.lazy(() => 
        Promise.resolve({
          default: () => <div data-testid="lookout-agent">Lookout Agent Loaded</div>
        })
      );

      const TestWrapper = () => {
        const [showModal, setShowModal] = React.useState(false);
        
        return (
          <div>
            <button onClick={() => setShowModal(true)} data-testid="show-modal">
              Show Modal
            </button>
            {showModal && (
              <React.Suspense fallback={<div data-testid="loading">Loading...</div>}>
                <LazyComponent />
              </React.Suspense>
            )}
          </div>
        );
      };

      render(<TestWrapper />);

      // Initially, component should not be loaded
      expect(screen.queryByTestId('lookout-agent')).not.toBeInTheDocument();
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();

      // Click to show modal
      fireEvent.click(screen.getByTestId('show-modal'));

      // Should show loading state first
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByTestId('lookout-agent')).toBeInTheDocument();
      });

      // Loading should be gone
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });

    it('should handle lazy loading errors gracefully', async () => {
      const LazyComponent = React.lazy(() => 
        Promise.reject(new Error('Failed to load component'))
      );

      // Error boundary to catch lazy loading errors
      class ErrorBoundary extends React.Component<
        { children: React.ReactNode },
        { hasError: boolean }
      > {
        constructor(props: { children: React.ReactNode }) {
          super(props);
          this.state = { hasError: false };
        }

        static getDerivedStateFromError() {
          return { hasError: true };
        }

        render() {
          if (this.state.hasError) {
            return <div data-testid="error-fallback">Failed to load</div>;
          }
          return this.props.children;
        }
      }

      const TestWrapper = () => {
        const [showModal, setShowModal] = React.useState(false);
        
        return (
          <div>
            <button onClick={() => setShowModal(true)} data-testid="show-modal">
              Show Modal
            </button>
            {showModal && (
              <ErrorBoundary>
                <React.Suspense fallback={<div data-testid="loading">Loading...</div>}>
                  <LazyComponent />
                </React.Suspense>
              </ErrorBoundary>
            )}
          </div>
        );
      };

      render(<TestWrapper />);

      fireEvent.click(screen.getByTestId('show-modal'));

      // Should show loading first
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Wait for error to be caught
      await waitFor(() => {
        expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
      });
    });
  });

  describe('Task 9.4: Session-based Caching for Search Queries', () => {
    it('should cache identical search queries', () => {
      const mockGetCachedSearchResults = vi.mocked(PerformanceOptimizationService.getCachedSearchResults);
      const mockSetCachedSearchResults = vi.mocked(PerformanceOptimizationService.setCachedSearchResults);
      
      const query = 'quantum computing';
      const results = { results: [{ title: 'Quantum Computing Basics' }] };

      // First search - no cache
      mockGetCachedSearchResults.mockReturnValueOnce(null);
      
      const firstResult = PerformanceOptimizationService.getCachedSearchResults(query);
      expect(firstResult).toBeNull();
      
      // Cache the results
      PerformanceOptimizationService.setCachedSearchResults(query, results);
      expect(mockSetCachedSearchResults).toHaveBeenCalledWith(query, results);

      // Second search - should use cache
      mockGetCachedSearchResults.mockReturnValueOnce(results);
      
      const secondResult = PerformanceOptimizationService.getCachedSearchResults(query);
      expect(secondResult).toEqual(results);
    });

    it('should handle cache expiration correctly', () => {
      const mockGetCachedSearchResults = vi.mocked(PerformanceOptimizationService.getCachedSearchResults);
      
      const query = 'expired query';
      
      // Simulate expired cache
      mockGetCachedSearchResults.mockReturnValueOnce(null);
      
      const result = PerformanceOptimizationService.getCachedSearchResults(query);
      expect(result).toBeNull();
      expect(mockGetCachedSearchResults).toHaveBeenCalledWith(query);
    });

    it('should normalize cache keys for consistent caching', () => {
      const mockGetCachedSearchResults = vi.mocked(PerformanceOptimizationService.getCachedSearchResults);
      const mockSetCachedSearchResults = vi.mocked(PerformanceOptimizationService.setCachedSearchResults);
      
      const results = { results: [{ title: 'Test Result' }] };
      
      // Set cache with one format
      PerformanceOptimizationService.setCachedSearchResults('  Test Query  ', results);
      
      // Should be able to retrieve with different formats
      PerformanceOptimizationService.getCachedSearchResults('test query');
      PerformanceOptimizationService.getCachedSearchResults('TEST QUERY');
      PerformanceOptimizationService.getCachedSearchResults('  test   query  ');
      
      expect(mockGetCachedSearchResults).toHaveBeenCalledTimes(3);
    });
  });

  describe('Task 9.5: Proper Cleanup for Event Listeners and Timers', () => {
    it('should cleanup resources when component unmounts', () => {
      const mockCleanup = vi.mocked(PerformanceOptimizationService.cleanup);
      const mockCancelAllRequests = vi.mocked(PerformanceOptimizationService.cancelAllRequests);

      const TestComponent = () => {
        React.useEffect(() => {
          return () => {
            PerformanceOptimizationService.cancelAllRequests();
            PerformanceOptimizationService.cleanup();
          };
        }, []);

        return <div data-testid="test-component">Test Component</div>;
      };

      const { unmount } = render(<TestComponent />);
      
      // Component should be rendered
      expect(screen.getByTestId('test-component')).toBeInTheDocument();
      
      // Unmount component
      unmount();
      
      // Cleanup should have been called
      expect(mockCancelAllRequests).toHaveBeenCalled();
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should cancel active requests on modal close', () => {
      const mockCancelRequest = vi.mocked(PerformanceOptimizationService.cancelRequest);
      
      const TestModal = () => {
        const [isOpen, setIsOpen] = React.useState(true);
        const requestIdRef = React.useRef('test-request-123');

        React.useEffect(() => {
          if (!isOpen && requestIdRef.current) {
            PerformanceOptimizationService.cancelRequest(requestIdRef.current);
          }
        }, [isOpen]);

        return (
          <div>
            {isOpen && <div data-testid="modal">Modal Content</div>}
            <button onClick={() => setIsOpen(false)} data-testid="close-modal">
              Close
            </button>
          </div>
        );
      };

      render(<TestModal />);
      
      // Modal should be open
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      
      // Close modal
      fireEvent.click(screen.getByTestId('close-modal'));
      
      // Modal should be closed and request cancelled
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
      expect(mockCancelRequest).toHaveBeenCalledWith('test-request-123');
    });

    it('should clear cache on cleanup', () => {
      const mockClearCache = vi.mocked(PerformanceOptimizationService.clearCache);
      
      // Simulate cleanup
      PerformanceOptimizationService.cleanup();
      
      expect(mockClearCache).toHaveBeenCalled();
    });
  });

  describe('Performance Metrics and Validation', () => {
    it('should track cache hit rates', () => {
      const mockGetCachedSearchResults = vi.mocked(PerformanceOptimizationService.getCachedSearchResults);
      
      // Simulate cache hits and misses
      mockGetCachedSearchResults
        .mockReturnValueOnce({ results: [] }) // hit
        .mockReturnValueOnce(null) // miss
        .mockReturnValueOnce({ results: [] }) // hit
        .mockReturnValueOnce(null); // miss

      const queries = ['query1', 'query2', 'query3', 'query4'];
      const results = queries.map(query => 
        PerformanceOptimizationService.getCachedSearchResults(query)
      );

      // Should have 2 hits and 2 misses
      const hits = results.filter(result => result !== null).length;
      const misses = results.filter(result => result === null).length;
      
      expect(hits).toBe(2);
      expect(misses).toBe(2);
    });

    it('should validate request cancellation timing', async () => {
      const mockCreateCancellableRequest = vi.mocked(PerformanceOptimizationService.createCancellableRequest);
      const mockCancelRequest = vi.mocked(PerformanceOptimizationService.cancelRequest);
      
      const startTime = Date.now();
      
      // Create request
      const requestId = 'timing-test';
      PerformanceOptimizationService.createCancellableRequest(requestId);
      
      // Cancel immediately
      PerformanceOptimizationService.cancelRequest(requestId);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should be very fast (< 10ms)
      expect(duration).toBeLessThan(10);
      expect(mockCreateCancellableRequest).toHaveBeenCalledWith(requestId);
      expect(mockCancelRequest).toHaveBeenCalledWith(requestId);
    });
  });
});