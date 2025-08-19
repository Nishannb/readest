import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceOptimizationService } from '../../app/reader/services/performanceOptimizationService';

// Mock the debounce utility
vi.mock('@/utils/debounce', () => ({
  debounce: vi.fn((fn, delay, options) => {
    const debouncedFn = (...args: any[]) => fn(...args);
    debouncedFn.flush = vi.fn();
    debouncedFn.cancel = vi.fn();
    return debouncedFn;
  }),
}));

// Mock the lookout command detection
vi.mock('../../app/reader/utils/lookoutCommandDetection', () => ({
  detectLookoutCommand: vi.fn((input: string) => ({
    isLookoutCommand: input.startsWith('@lookout'),
    question: input.replace('@lookout ', ''),
    highlightedContext: undefined,
  })),
}));

describe('PerformanceOptimizationService', () => {
  beforeEach(() => {
    // Clear any existing cache and requests
    PerformanceOptimizationService.clearCache();
    PerformanceOptimizationService.cancelAllRequests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup after each test
    PerformanceOptimizationService.cleanup();
  });

  describe('Caching', () => {
    it('should cache and retrieve search results', () => {
      const query = 'test query';
      const testData = { results: ['result1', 'result2'] };

      // Cache should be empty initially
      expect(PerformanceOptimizationService.getCachedSearchResults(query)).toBeNull();

      // Set cache
      PerformanceOptimizationService.setCachedSearchResults(query, testData);

      // Should retrieve cached data
      const cached = PerformanceOptimizationService.getCachedSearchResults(query);
      expect(cached).toEqual(testData);
    });

    it('should handle cache expiration', async () => {
      const query = 'test query';
      const testData = { results: ['result1', 'result2'] };

      // Set cache with very short expiration
      PerformanceOptimizationService.setCachedSearchResults(query, testData, {
        cacheExpirationMs: 1, // 1ms expiration
        debounceDelayMs: 300,
        maxCacheSize: 50,
        requestTimeoutMs: 15000,
      });

      // Should be available immediately
      expect(PerformanceOptimizationService.getCachedSearchResults(query)).toEqual(testData);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be expired and return null
      expect(PerformanceOptimizationService.getCachedSearchResults(query)).toBeNull();
    });

    it('should normalize cache keys', () => {
      const testData = { results: ['result1'] };

      // Set with one format
      PerformanceOptimizationService.setCachedSearchResults('  Test Query  ', testData);

      // Should retrieve with normalized format
      expect(PerformanceOptimizationService.getCachedSearchResults('test query')).toEqual(testData);
      expect(PerformanceOptimizationService.getCachedSearchResults('TEST QUERY')).toEqual(testData);
      expect(PerformanceOptimizationService.getCachedSearchResults('  test   query  ')).toEqual(testData);
    });

    it('should implement LRU eviction when cache is full', () => {
      const maxCacheSize = 3;
      
      // Fill cache to capacity
      for (let i = 0; i < maxCacheSize; i++) {
        PerformanceOptimizationService.setCachedSearchResults(
          `query${i}`, 
          { results: [`result${i}`] },
          { maxCacheSize, cacheExpirationMs: 60000, debounceDelayMs: 300, requestTimeoutMs: 15000 }
        );
      }

      // All should be cached
      for (let i = 0; i < maxCacheSize; i++) {
        expect(PerformanceOptimizationService.getCachedSearchResults(`query${i}`)).toBeTruthy();
      }

      // Add one more (should evict oldest)
      PerformanceOptimizationService.setCachedSearchResults(
        'newquery', 
        { results: ['newresult'] },
        { maxCacheSize, cacheExpirationMs: 60000, debounceDelayMs: 300, requestTimeoutMs: 15000 }
      );

      // First entry should be evicted
      expect(PerformanceOptimizationService.getCachedSearchResults('query0')).toBeNull();
      
      // Others should still be there
      expect(PerformanceOptimizationService.getCachedSearchResults('query1')).toBeTruthy();
      expect(PerformanceOptimizationService.getCachedSearchResults('query2')).toBeTruthy();
      expect(PerformanceOptimizationService.getCachedSearchResults('newquery')).toBeTruthy();
    });

    it('should provide cache statistics', () => {
      const testData1 = { results: ['result1'] };
      const testData2 = { results: ['result2'] };

      PerformanceOptimizationService.setCachedSearchResults('query1', testData1);
      PerformanceOptimizationService.setCachedSearchResults('query2', testData2);

      const stats = PerformanceOptimizationService.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries.some(entry => entry.key === 'query1')).toBe(true);
      expect(stats.entries.some(entry => entry.key === 'query2')).toBe(true);
    });
  });

  describe('Request Cancellation', () => {
    it('should create cancellable requests', () => {
      const requestId = 'test-request';
      const cancellation = PerformanceOptimizationService.createCancellableRequest(requestId);

      expect(cancellation.controller).toBeInstanceOf(AbortController);
      expect(typeof cancellation.cleanup).toBe('function');
      expect(cancellation.controller.signal.aborted).toBe(false);
    });

    it('should cancel specific requests', () => {
      const requestId = 'test-request';
      const cancellation = PerformanceOptimizationService.createCancellableRequest(requestId);

      expect(cancellation.controller.signal.aborted).toBe(false);

      PerformanceOptimizationService.cancelRequest(requestId);

      expect(cancellation.controller.signal.aborted).toBe(true);
    });

    it('should cancel all active requests', () => {
      const request1 = PerformanceOptimizationService.createCancellableRequest('request1');
      const request2 = PerformanceOptimizationService.createCancellableRequest('request2');

      expect(request1.controller.signal.aborted).toBe(false);
      expect(request2.controller.signal.aborted).toBe(false);

      PerformanceOptimizationService.cancelAllRequests();

      expect(request1.controller.signal.aborted).toBe(true);
      expect(request2.controller.signal.aborted).toBe(true);
    });

    it('should handle cancelling non-existent requests gracefully', () => {
      expect(() => {
        PerformanceOptimizationService.cancelRequest('non-existent');
      }).not.toThrow();
    });

    it('should replace existing requests with same ID', () => {
      const requestId = 'test-request';
      const firstRequest = PerformanceOptimizationService.createCancellableRequest(requestId);
      
      expect(firstRequest.controller.signal.aborted).toBe(false);

      // Create another request with same ID
      const secondRequest = PerformanceOptimizationService.createCancellableRequest(requestId);

      // First request should be cancelled
      expect(firstRequest.controller.signal.aborted).toBe(true);
      expect(secondRequest.controller.signal.aborted).toBe(false);
    });
  });

  describe('Optimized Fetch', () => {
    beforeEach(() => {
      // Mock fetch
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return cached results when available', async () => {
      const cacheKey = 'test-cache-key';
      const cachedData = { results: ['cached-result'] };
      
      // Set cache
      PerformanceOptimizationService.setCachedSearchResults(cacheKey, cachedData);

      const { fetch: optimizedFetch } = PerformanceOptimizationService.createOptimizedFetch(
        'test-request',
        cacheKey
      );

      const result = await optimizedFetch('http://example.com');
      
      expect(result).toEqual(cachedData);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should make network request when cache is empty', async () => {
      const responseData = { results: ['network-result'] };
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const { fetch: optimizedFetch } = PerformanceOptimizationService.createOptimizedFetch(
        'test-request'
      );

      const result = await optimizedFetch('http://example.com');
      
      expect(result).toEqual(responseData);
      expect(global.fetch).toHaveBeenCalledWith('http://example.com', expect.objectContaining({
        signal: expect.any(AbortSignal),
      }));
    });

    it('should cache network responses', async () => {
      const cacheKey = 'test-cache-key';
      const responseData = { results: ['network-result'] };
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const { fetch: optimizedFetch } = PerformanceOptimizationService.createOptimizedFetch(
        'test-request',
        cacheKey
      );

      await optimizedFetch('http://example.com');
      
      // Should be cached now
      const cached = PerformanceOptimizationService.getCachedSearchResults(cacheKey);
      expect(cached).toEqual(responseData);
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { fetch: optimizedFetch } = PerformanceOptimizationService.createOptimizedFetch(
        'test-request'
      );

      await expect(optimizedFetch('http://example.com')).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

  describe('Debounced Command Detection', () => {
    it('should call debounced command detection', async () => {
      const callback = vi.fn();
      const input = '@lookout test question';

      PerformanceOptimizationService.detectLookoutCommandDebounced(input, callback);

      // Wait for the async import and callback
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should call the callback (mocked debounce doesn't actually debounce in tests)
      expect(callback).toHaveBeenCalledWith({
        isLookoutCommand: true,
        question: 'test question',
        highlightedContext: undefined,
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up all resources', () => {
      // Create some requests and cache
      PerformanceOptimizationService.createCancellableRequest('request1');
      PerformanceOptimizationService.setCachedSearchResults('query1', { results: [] });

      // Verify they exist
      expect(PerformanceOptimizationService.getCacheStats().size).toBe(1);

      // Cleanup
      PerformanceOptimizationService.cleanup();

      // Should be cleaned up
      expect(PerformanceOptimizationService.getCacheStats().size).toBe(0);
    });
  });
});