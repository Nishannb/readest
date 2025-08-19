/**
 * Comprehensive error handling service for the Lookout Agent
 * Provides centralized error management, logging, and user-friendly error messages
 */

export interface ErrorContext {
  operation: 'ai-query-generation' | 'duckduckgo-search' | 'network-request' | 'component-render';
  originalError: Error | string;
  userInput?: string;
  retryCount?: number;
  timestamp: number;
}

export interface ErrorRecovery {
  retryable: boolean;
  fallbackAction: 'use-original-query' | 'manual-search' | 'close-modal' | 'retry-operation';
  userMessage: string;
  logLevel: 'info' | 'warn' | 'error';
  suggestedActions?: string[];
}

export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Centralized error handling service for Lookout Agent
 */
export class ErrorHandlingService {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: [
      'timeout',
      'network',
      'fetch',
      'connection',
      'temporary',
      'rate limit',
      'service unavailable',
      '503',
      '502',
      '504'
    ]
  };

  /**
   * Handles errors and provides recovery strategies
   */
  static handleError(context: ErrorContext): ErrorRecovery {
    const { operation, originalError, retryCount = 0 } = context;
    const errorMessage = this.extractErrorMessage(originalError);
    const errorType = this.categorizeError(errorMessage);

    // Log error for debugging
    this.logError(context, errorType);

    switch (operation) {
      case 'ai-query-generation':
        return this.handleAIGenerationError(errorMessage, errorType, retryCount);
      
      case 'duckduckgo-search':
        return this.handleSearchError(errorMessage, errorType, retryCount);
      
      case 'network-request':
        return this.handleNetworkError(errorMessage, errorType, retryCount);
      
      case 'component-render':
        return this.handleComponentError(errorMessage, errorType, retryCount);
      
      default:
        return this.handleGenericError(errorMessage, errorType, retryCount);
    }
  }

  /**
   * Handles AI query generation errors with appropriate fallbacks
   */
  private static handleAIGenerationError(errorMessage: string, errorType: string, retryCount: number): ErrorRecovery {
    const isRetryable = this.isRetryableError(errorMessage) && retryCount < this.DEFAULT_RETRY_CONFIG.maxRetries;

    if (errorType === 'timeout') {
      return {
        retryable: isRetryable,
        fallbackAction: isRetryable ? 'retry-operation' : 'use-original-query',
        userMessage: isRetryable 
          ? 'AI query generation timed out. Retrying...' 
          : 'AI query generation timed out. Using your original question instead.',
        logLevel: 'warn',
        suggestedActions: isRetryable ? [] : ['Try rephrasing your question', 'Check your internet connection']
      };
    }

    if (errorType === 'api-key' || errorType === 'authentication') {
      return {
        retryable: false,
        fallbackAction: 'use-original-query',
        userMessage: 'AI service authentication failed. Using your original question for search.',
        logLevel: 'warn',
        suggestedActions: ['Check your AI provider settings', 'Verify your API key is correct']
      };
    }

    if (errorType === 'model-unavailable') {
      return {
        retryable: false,
        fallbackAction: 'use-original-query',
        userMessage: 'AI model is currently unavailable. Using your original question for search.',
        logLevel: 'warn',
        suggestedActions: ['Try a different AI model', 'Check if the model is running (for local models)']
      };
    }

    // Generic AI error
    return {
      retryable: isRetryable,
      fallbackAction: isRetryable ? 'retry-operation' : 'use-original-query',
      userMessage: isRetryable 
        ? 'AI query generation failed. Retrying...' 
        : 'AI query generation failed. Using your original question for search.',
      logLevel: 'warn',
      suggestedActions: isRetryable ? [] : ['Check your AI provider settings', 'Try again with a simpler question']
    };
  }

  /**
   * Handles DuckDuckGo search errors with fallback options
   */
  private static handleSearchError(errorMessage: string, errorType: string, retryCount: number): ErrorRecovery {
    const isRetryable = this.isRetryableError(errorMessage) && retryCount < this.DEFAULT_RETRY_CONFIG.maxRetries;

    if (errorType === 'timeout') {
      return {
        retryable: isRetryable,
        fallbackAction: isRetryable ? 'retry-operation' : 'manual-search',
        userMessage: isRetryable 
          ? 'Search request timed out. Retrying...' 
          : 'Search service is taking too long. Here are some manual search options.',
        logLevel: 'warn',
        suggestedActions: isRetryable ? [] : ['Try the manual search links below', 'Check your internet connection']
      };
    }

    if (errorType === 'rate-limit') {
      return {
        retryable: false,
        fallbackAction: 'manual-search',
        userMessage: 'Search service rate limit reached. Here are some manual search options.',
        logLevel: 'warn',
        suggestedActions: ['Use the manual search links below', 'Try again in a few minutes']
      };
    }

    if (errorType === 'service-unavailable') {
      return {
        retryable: isRetryable,
        fallbackAction: isRetryable ? 'retry-operation' : 'manual-search',
        userMessage: isRetryable 
          ? 'Search service temporarily unavailable. Retrying...' 
          : 'Search service is currently unavailable. Here are some manual search options.',
        logLevel: 'warn',
        suggestedActions: isRetryable ? [] : ['Use the manual search links below', 'Try again later']
      };
    }

    // Generic search error
    return {
      retryable: isRetryable,
      fallbackAction: isRetryable ? 'retry-operation' : 'manual-search',
      userMessage: isRetryable 
        ? 'Search failed. Retrying...' 
        : 'Search service temporarily unavailable. Here are some manual search options.',
      logLevel: 'error',
      suggestedActions: isRetryable ? [] : ['Use the manual search links below', 'Check your internet connection']
    };
  }

  /**
   * Handles network-related errors
   */
  private static handleNetworkError(errorMessage: string, errorType: string, retryCount: number): ErrorRecovery {
    const isRetryable = this.isRetryableError(errorMessage) && retryCount < this.DEFAULT_RETRY_CONFIG.maxRetries;

    return {
      retryable: isRetryable,
      fallbackAction: isRetryable ? 'retry-operation' : 'manual-search',
      userMessage: isRetryable 
        ? 'Network error occurred. Retrying...' 
        : 'Network connection failed. Here are some manual search options.',
      logLevel: 'warn',
      suggestedActions: isRetryable ? [] : ['Check your internet connection', 'Try again later']
    };
  }

  /**
   * Handles component rendering errors
   */
  private static handleComponentError(errorMessage: string, errorType: string, retryCount: number): ErrorRecovery {
    return {
      retryable: false,
      fallbackAction: 'close-modal',
      userMessage: 'Something went wrong with the search interface. Please try again.',
      logLevel: 'error',
      suggestedActions: ['Try the @lookout command again', 'Refresh the page if the problem persists']
    };
  }

  /**
   * Handles generic errors
   */
  private static handleGenericError(errorMessage: string, errorType: string, retryCount: number): ErrorRecovery {
    const isRetryable = this.isRetryableError(errorMessage) && retryCount < this.DEFAULT_RETRY_CONFIG.maxRetries;

    return {
      retryable: isRetryable,
      fallbackAction: isRetryable ? 'retry-operation' : 'manual-search',
      userMessage: isRetryable 
        ? 'An error occurred. Retrying...' 
        : 'Something went wrong. Here are some manual search options.',
      logLevel: 'error',
      suggestedActions: isRetryable ? [] : ['Try again later', 'Check your internet connection']
    };
  }

  /**
   * Extracts a clean error message from various error types
   */
  private static extractErrorMessage(error: Error | string): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message || error.toString();
    }

    return 'Unknown error occurred';
  }

  /**
   * Categorizes errors into types for better handling
   */
  private static categorizeError(errorMessage: string): string {
    const message = errorMessage.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }

    if (message.includes('api key') || message.includes('unauthorized') || message.includes('authentication')) {
      return 'api-key';
    }

    if (message.includes('model') && (message.includes('not found') || message.includes('unavailable'))) {
      return 'model-unavailable';
    }

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate-limit';
    }

    if (message.includes('service unavailable') || message.includes('503') || message.includes('502') || message.includes('504')) {
      return 'service-unavailable';
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'network';
    }

    return 'generic';
  }

  /**
   * Determines if an error is retryable based on the error message
   */
  private static isRetryableError(errorMessage: string): boolean {
    const message = errorMessage.toLowerCase();
    
    return this.DEFAULT_RETRY_CONFIG.retryableErrors.some(retryableError => 
      message.includes(retryableError)
    );
  }

  /**
   * Logs errors with appropriate level and context
   */
  private static logError(context: ErrorContext, errorType: string): void {
    const logData = {
      operation: context.operation,
      errorType,
      errorMessage: this.extractErrorMessage(context.originalError),
      userInput: context.userInput,
      retryCount: context.retryCount,
      timestamp: context.timestamp
    };

    // Log to console for debugging (in production, this could be sent to a logging service)
    if (errorType === 'timeout' || errorType === 'network') {
      console.warn('Lookout Agent Warning:', logData);
    } else if (errorType === 'api-key' || errorType === 'model-unavailable') {
      console.warn('Lookout Agent Configuration Issue:', logData);
    } else {
      console.error('Lookout Agent Error:', logData);
    }
  }

  /**
   * Creates a delay for retry operations with exponential backoff
   */
  static async createRetryDelay(retryCount: number): Promise<void> {
    const delay = this.DEFAULT_RETRY_CONFIG.retryDelayMs * 
      Math.pow(this.DEFAULT_RETRY_CONFIG.backoffMultiplier, retryCount);
    
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Wraps an async operation with retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    context: Omit<ErrorContext, 'timestamp' | 'retryCount'>,
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<T> {
    const config = { ...this.DEFAULT_RETRY_CONFIG, ...retryConfig };
    let lastError: Error | string = 'Unknown error';

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : String(error);
        
        const errorContext: ErrorContext = {
          ...context,
          originalError: lastError,
          retryCount: attempt,
          timestamp: Date.now()
        };

        const recovery = this.handleError(errorContext);
        
        // If not retryable or max retries reached, throw the error
        if (!recovery.retryable || attempt >= config.maxRetries) {
          throw lastError;
        }

        // Wait before retrying
        await this.createRetryDelay(attempt);
      }
    }

    throw lastError;
  }
}