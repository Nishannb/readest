/**
 * Performance optimization service for Lookout Agent
 * Provides request cancellation, caching, and cleanup utilities
 */

import { debounce } from '@/utils/debounce';

// Types for performance optimization
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface RequestCancellation {
  controller: AbortController;
  cleanup: () => void;
}

export interface PerformanceConfig {
  cacheExpirationMs: number;
  debounceDelayMs: number;
  maxCacheSize: number;
  requestTimeoutMs: number;
}

/**
 * Performance optimization service for Lookout Agent
 */
export class PerformanceOptimizationService {
  private static readonly DEFAULT_CONFIG: PerformanceConfig = {
    cacheExpirationMs: 5 * 60 * 1000, // 5 minutes
    debounceDelayMs: 300, // 300ms debounce
    maxCacheSize: 50, // Maximum 50 cached queries
    requestTimeoutMs: 15000, // 15 second timeout
  };

  // Session-based cache for search queries
  private static searchCache = new Map<string, CacheEntry<any>>();
  
  // Active request controllers for cancellation
  private static activeRequests = new Map<string, RequestCancellation>();
  
  // Debounced command detection function
  private static debouncedCommandDetection: ((input: string, callback: (result: any) => void) => void) | null = null;

  /**
   * Initialize the performance optimization service
   */
  static initialize(config: Partial<PerformanceConfig> = {}) {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    // Create debounced command detection
    this.debouncedCommandDetection = debounce(
      (input: string, callback: (result: any) => void) => {
        // Import here to avoid circular dependencies
        import('../utils/lookoutCommandDetection').then(({ detectLookoutCommand }) => {
          const result = detectLookoutCommand(input);
          callback(result);
        });
      },
      finalConfig.debounceDelayMs,
      { emitLast: true }
    );

    // Set up cache cleanup interval
    this.setupCacheCleanup(finalConfig.cacheExpirationMs);
    
    // Set up cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.cleanup);
    }
  }

  /**
   * Get cached search results if available and not expired
   */
  static getCachedSearchResults<T>(query: string): T | null {
    const cacheKey = this.generateCacheKey(query);
    const entry = this.searchCache.get(cacheKey);
    
    if (!entry) {
      return null;
    }
    
    // Check if cache entry is expired
    if (Date.now() > entry.expiresAt) {
      this.searchCache.delete(cacheKey);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Cache search results with expiration
   */
  static setCachedSearchResults<T>(query: string, data: T, config: Partial<PerformanceConfig> = {}): void {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const cacheKey = this.generateCacheKey(query);
    const now = Date.now();
    
    // Implement LRU eviction if cache is full
    if (this.searchCache.size >= finalConfig.maxCacheSize) {
      this.evictOldestCacheEntry();
    }
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + finalConfig.cacheExpirationMs,
    };
    
    this.searchCache.set(cacheKey, entry);
  }

  /**
   * Create a cancellable request with timeout and cleanup
   */
  static createCancellableRequest(
    requestId: string,
    config: Partial<PerformanceConfig> = {}
  ): RequestCancellation {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    // Cancel any existing request with the same ID
    this.cancelRequest(requestId);
    
    const controller = new AbortController();
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort('Request timeout');
    }, finalConfig.requestTimeoutMs);
    
    const cleanup = () => {
      clearTimeout(timeoutId);
      this.activeRequests.delete(requestId);
    };
    
    const cancellation: RequestCancellation = {
      controller,
      cleanup,
    };
    
    this.activeRequests.set(requestId, cancellation);
    
    return cancellation;
  }

  /**
   * Cancel a specific request by ID
   */
  static cancelRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.controller.abort('Request cancelled');
      request.cleanup();
    }
  }

  /**
   * Cancel all active requests
   */
  static cancelAllRequests(): void {
    for (const [requestId] of this.activeRequests) {
      this.cancelRequest(requestId);
    }
  }

  /**
   * Debounced command detection to avoid unnecessary processing
   */
  static detectLookoutCommandDebounced(
    input: string,
    callback: (result: any) => void
  ): void {
    if (!this.debouncedCommandDetection) {
      this.initialize();
    }
    
    this.debouncedCommandDetection!(input, callback);
  }

  /**
   * Clear the search cache
   */
  static clearCache(): void {
    this.searchCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  static getCacheStats(): {
    size: number;
    entries: Array<{ key: string; timestamp: number; expiresAt: number }>;
  } {
    const entries = Array.from(this.searchCache.entries()).map(([key, entry]) => ({
      key,
      timestamp: entry.timestamp,
      expiresAt: entry.expiresAt,
    }));
    
    return {
      size: this.searchCache.size,
      entries,
    };
  }

  /**
   * Generate a cache key for a search query
   */
  private static generateCacheKey(query: string): string {
    // Normalize the query for consistent caching
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Evict the oldest cache entry (LRU)
   */
  private static evictOldestCacheEntry(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();
    
    for (const [key, entry] of this.searchCache) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.searchCache.delete(oldestKey);
    }
  }

  /**
   * Set up periodic cache cleanup
   */
  private static setupCacheCleanup(expirationMs: number): void {
    // Clean up expired entries every 2 minutes
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];
      
      for (const [key, entry] of this.searchCache) {
        if (now > entry.expiresAt) {
          expiredKeys.push(key);
        }
      }
      
      expiredKeys.forEach(key => this.searchCache.delete(key));
    }, 2 * 60 * 1000);
    
    // Store cleanup interval for later cleanup
    if (typeof window !== 'undefined') {
      (window as any).__lookoutCacheCleanupInterval = cleanupInterval;
    }
  }

  /**
   * Clean up all resources
   */
  static cleanup(): void {
    // Cancel all active requests
    this.cancelAllRequests();
    
    // Clear cache
    this.clearCache();
    
    // Clear cleanup interval
    if (typeof window !== 'undefined') {
      const cleanupInterval = (window as any).__lookoutCacheCleanupInterval;
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        delete (window as any).__lookoutCacheCleanupInterval;
      }
      
      // Remove event listener
      window.removeEventListener('beforeunload', this.cleanup);
    }
    
    // Reset debounced function
    this.debouncedCommandDetection = null;
  }

  /**
   * Optimize modal component loading with lazy loading
   */
  static createLazyModalLoader() {
    // Dynamic import to avoid React dependency in service
    return import('react').then(React => 
      React.lazy(() => import('../components/LookoutAgent'))
    );
  }

  /**
   * Create optimized fetch function with caching and cancellation
   */
  static createOptimizedFetch<T>(
    requestId: string,
    cacheKey?: string
  ): {
    fetch: (url: string, options?: RequestInit) => Promise<T>;
    cancel: () => void;
  } {
    // Check cache first if cache key is provided
    if (cacheKey) {
      const cached = this.getCachedSearchResults<T>(cacheKey);
      if (cached) {
        return {
          fetch: async () => cached,
          cancel: () => {},
        };
      }
    }
    
    const cancellation = this.createCancellableRequest(requestId);
    
    return {
      fetch: async (url: string, options: RequestInit = {}) => {
        const response = await fetch(url, {
          ...options,
          signal: cancellation.controller.signal,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Cache the result if cache key is provided
        if (cacheKey) {
          this.setCachedSearchResults(cacheKey, data);
        }
        
        return data;
      },
      cancel: () => this.cancelRequest(requestId),
    };
  }
}

// Initialize the service when the module is loaded
if (typeof window !== 'undefined') {
  PerformanceOptimizationService.initialize();
}