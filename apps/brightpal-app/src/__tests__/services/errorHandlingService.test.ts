import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorHandlingService, ErrorContext, ErrorRecovery } from '../../app/reader/services/errorHandlingService';

describe('ErrorHandlingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('handleError', () => {
    it('should handle AI generation timeout errors', () => {
      const context: ErrorContext = {
        operation: 'ai-query-generation',
        originalError: new Error('AI query generation timeout'),
        userInput: 'test question',
        retryCount: 0,
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);

      expect(recovery.retryable).toBe(true);
      expect(recovery.fallbackAction).toBe('retry-operation');
      expect(recovery.userMessage).toContain('timed out');
      expect(recovery.logLevel).toBe('warn');
    });

    it('should handle AI generation API key errors', () => {
      const context: ErrorContext = {
        operation: 'ai-query-generation',
        originalError: new Error('API key not configured'),
        userInput: 'test question',
        retryCount: 0,
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);

      expect(recovery.retryable).toBe(false);
      expect(recovery.fallbackAction).toBe('use-original-query');
      expect(recovery.userMessage).toContain('authentication failed');
      expect(recovery.suggestedActions).toContain('Check your AI provider settings');
    });

    it('should handle DuckDuckGo search timeout errors', () => {
      const context: ErrorContext = {
        operation: 'duckduckgo-search',
        originalError: new Error('DuckDuckGo API request timeout'),
        userInput: 'test query',
        retryCount: 0,
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);

      expect(recovery.retryable).toBe(true);
      expect(recovery.fallbackAction).toBe('retry-operation');
      expect(recovery.userMessage).toContain('timed out');
    });

    it('should handle DuckDuckGo rate limit errors', () => {
      const context: ErrorContext = {
        operation: 'duckduckgo-search',
        originalError: new Error('DuckDuckGo API rate limit exceeded'),
        userInput: 'test query',
        retryCount: 0,
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);

      expect(recovery.retryable).toBe(false);
      expect(recovery.fallbackAction).toBe('manual-search');
      expect(recovery.userMessage).toContain('rate limit');
    });

    it('should handle network errors', () => {
      const context: ErrorContext = {
        operation: 'network-request',
        originalError: new Error('Network connection failed'),
        userInput: 'test',
        retryCount: 0,
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);

      expect(recovery.retryable).toBe(true);
      expect(recovery.fallbackAction).toBe('retry-operation');
      expect(recovery.userMessage).toContain('Network error');
    });

    it('should handle component errors', () => {
      const context: ErrorContext = {
        operation: 'component-render',
        originalError: new Error('Component render failed'),
        userInput: 'test',
        retryCount: 0,
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);

      expect(recovery.retryable).toBe(false);
      expect(recovery.fallbackAction).toBe('close-modal');
      expect(recovery.userMessage).toContain('search interface');
    });

    it('should not retry after max retries', () => {
      const context: ErrorContext = {
        operation: 'ai-query-generation',
        originalError: new Error('timeout'),
        userInput: 'test',
        retryCount: 5, // Exceeds max retries
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);

      expect(recovery.retryable).toBe(false);
      expect(recovery.fallbackAction).toBe('use-original-query');
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const context = {
        operation: 'ai-query-generation' as const,
        originalError: 'test',
        userInput: 'test'
      };

      const result = await ErrorHandlingService.withRetry(operation, context);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const context = {
        operation: 'duckduckgo-search' as const,
        originalError: 'test',
        userInput: 'test'
      };

      const result = await ErrorHandlingService.withRetry(operation, context, {
        maxRetries: 2,
        retryDelayMs: 10 // Short delay for tests
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      const context = {
        operation: 'duckduckgo-search' as const,
        originalError: 'test',
        userInput: 'test'
      };

      await expect(
        ErrorHandlingService.withRetry(operation, context, {
          maxRetries: 1,
          retryDelayMs: 10
        })
      ).rejects.toThrow('timeout');

      expect(operation).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('createRetryDelay', () => {
    it('should create appropriate delays with exponential backoff', async () => {
      const start = Date.now();
      await ErrorHandlingService.createRetryDelay(0);
      const delay0 = Date.now() - start;

      const start1 = Date.now();
      await ErrorHandlingService.createRetryDelay(1);
      const delay1 = Date.now() - start1;

      // Second retry should take longer (exponential backoff)
      expect(delay1).toBeGreaterThan(delay0);
    });
  });

  describe('error categorization', () => {
    it('should categorize timeout errors correctly', () => {
      const context: ErrorContext = {
        operation: 'ai-query-generation',
        originalError: new Error('Request timed out'),
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);
      expect(recovery.userMessage).toContain('timed out');
    });

    it('should categorize API key errors correctly', () => {
      const context: ErrorContext = {
        operation: 'ai-query-generation',
        originalError: new Error('Unauthorized - invalid API key'),
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);
      expect(recovery.userMessage).toContain('authentication failed');
    });

    it('should categorize service unavailable errors correctly', () => {
      const context: ErrorContext = {
        operation: 'duckduckgo-search',
        originalError: new Error('Service unavailable - 503'),
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(context);
      expect(recovery.userMessage).toContain('unavailable');
    });
  });

  describe('logging', () => {
    it('should log errors with appropriate levels', () => {
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');

      // Timeout should be warning
      ErrorHandlingService.handleError({
        operation: 'ai-query-generation',
        originalError: new Error('timeout'),
        timestamp: Date.now()
      });

      expect(warnSpy).toHaveBeenCalled();

      // Generic error should be error level
      ErrorHandlingService.handleError({
        operation: 'duckduckgo-search',
        originalError: new Error('unknown error'),
        timestamp: Date.now()
      });

      expect(errorSpy).toHaveBeenCalled();
    });
  });
});