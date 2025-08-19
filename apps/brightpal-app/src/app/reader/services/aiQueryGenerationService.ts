import { useAIProviderStore } from '@/store/aiProviderStore';
import { ErrorHandlingService, ErrorContext } from './errorHandlingService';

export interface QueryGenerationRequest {
  question: string;
  highlightedContext?: string;
  timeoutMs?: number;
}

export interface QueryGenerationResponse {
  success: boolean;
  searchQuery: string;
  originalQuestion: string;
  usedFallback: boolean;
  error?: string;
  retryCount?: number;
}

/**
 * Generates optimal search queries using the configured AI provider
 * Implements the specific prompt template for search query generation
 * Includes fallback logic and timeout handling
 */
export class AIQueryGenerationService {
  private static readonly DEFAULT_TIMEOUT_MS = 10000; // 10 seconds
  private static readonly PROMPT_TEMPLATE = `Given this highlighted text and user question, suggest the best search query to find relevant information. Focus on finding explainer videos from YouTube and informative articles.

Highlighted text: '[CONTEXT]'
User question: '[QUESTION]'

Provide only the search query, nothing else.`;

  /**
   * Generate an optimal search query using AI with comprehensive error handling
   */
  static async generateSearchQuery(request: QueryGenerationRequest): Promise<QueryGenerationResponse> {
    const { question, highlightedContext, timeoutMs = this.DEFAULT_TIMEOUT_MS } = request;
    
    try {
      // Use error handling service with retry logic
      const searchQuery = await ErrorHandlingService.withRetry(
        async () => {
          // Create timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AI query generation timeout')), timeoutMs);
          });

          // Create AI generation promise
          const generationPromise = this.performAIGeneration(question, highlightedContext);

          // Race between generation and timeout
          const result = await Promise.race([generationPromise, timeoutPromise]);
          
          if (!result || typeof result !== 'string' || result.trim().length === 0) {
            throw new Error('Empty response from AI provider');
          }

          return result.trim();
        },
        {
          operation: 'ai-query-generation',
          originalError: 'Initial attempt',
          userInput: question
        },
        {
          maxRetries: 2, // Fewer retries for AI generation to avoid long delays
          retryDelayMs: 500,
          backoffMultiplier: 1.5
        }
      );

      return {
        success: true,
        searchQuery,
        originalQuestion: question,
        usedFallback: false
      };
    } catch (error) {
      // Handle error with error handling service
      const errorContext: ErrorContext = {
        operation: 'ai-query-generation',
        originalError: error instanceof Error ? error : String(error),
        userInput: question,
        timestamp: Date.now()
      };

      const recovery = ErrorHandlingService.handleError(errorContext);
      
      // Always fallback to original question for AI generation failures
      return {
        success: false,
        searchQuery: question.trim(),
        originalQuestion: question,
        usedFallback: true,
        error: recovery.userMessage,
        retryCount: 0
      };
    }
  }

  /**
   * Perform the actual AI generation using the configured provider
   */
  private static async performAIGeneration(question: string, highlightedContext?: string): Promise<string> {
    const providerStore = useAIProviderStore.getState();
    const provider = providerStore.defaultProvider;

    // Build the prompt
    const prompt = this.buildPrompt(question, highlightedContext);

    switch (provider) {
      case 'gemini':
        return await this.generateWithGemini(prompt, providerStore);
      case 'ollama':
        return await this.generateWithOllama(prompt, providerStore);
      case 'openai':
        return await this.generateWithOpenAI(prompt, providerStore);
      case 'selfHosted':
      default:
        return await this.generateWithSelfHosted(prompt, providerStore);
    }
  }

  /**
   * Build the prompt using the template
   */
  private static buildPrompt(question: string, highlightedContext?: string): string {
    return this.PROMPT_TEMPLATE
      .replace('[CONTEXT]', highlightedContext || 'None')
      .replace('[QUESTION]', question);
  }

  /**
   * Generate query using Gemini with enhanced error handling
   */
  private static async generateWithGemini(prompt: string, providerStore: any): Promise<string> {
    const apiKey = providerStore.gemini.apiKey || '';
    const model = providerStore.gemini.model || 'gemini-2.0-flash';

    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Gemini API authentication failed - check your API key');
        }
        if (response.status === 429) {
          throw new Error('Gemini API rate limit exceeded');
        }
        if (response.status >= 500) {
          throw new Error('Gemini service temporarily unavailable');
        }
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API-level errors in response
      if (data.error) {
        throw new Error(`Gemini API error: ${data.error.message || 'Unknown error'}`);
      }

      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
      
      if (!text.trim()) {
        throw new Error('Empty response from Gemini');
      }

      return text;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network connection failed - check your internet connection');
      }
      throw error;
    }
  }

  /**
   * Generate query using Ollama with enhanced error handling
   */
  private static async generateWithOllama(prompt: string, providerStore: any): Promise<string> {
    const endpoint = providerStore.ollama.endpoint || 'http://127.0.0.1:11434';
    const model = providerStore.ollama.model || '';

    if (!model) {
      throw new Error('No Ollama model selected');
    }

    try {
      const response = await fetch(`/api/ollama/generate?endpoint=${encodeURIComponent(endpoint)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false
        })
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Ollama model "${model}" not found - check if the model is installed`);
        }
        if (response.status === 503) {
          throw new Error('Ollama service unavailable - check if Ollama is running');
        }
        if (response.status >= 500) {
          throw new Error('Ollama service temporarily unavailable');
        }
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for Ollama-specific errors
      if (data.error) {
        throw new Error(`Ollama error: ${data.error}`);
      }

      const text = data?.response || '';
      
      if (!text.trim()) {
        throw new Error('Empty response from Ollama');
      }

      return text;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to Ollama - check if Ollama is running and endpoint is correct');
      }
      throw error;
    }
  }

  /**
   * Generate query using OpenAI with enhanced error handling
   */
  private static async generateWithOpenAI(prompt: string, providerStore: any): Promise<string> {
    const apiKey = providerStore.openai.apiKey || '';
    const model = providerStore.openai.model || 'gpt-4o';

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 100,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('OpenAI API authentication failed - check your API key');
        }
        if (response.status === 429) {
          throw new Error('OpenAI API rate limit exceeded');
        }
        if (response.status === 404) {
          throw new Error(`OpenAI model "${model}" not found - check if the model exists`);
        }
        if (response.status >= 500) {
          throw new Error('OpenAI service temporarily unavailable');
        }
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API-level errors
      if (data.error) {
        throw new Error(`OpenAI API error: ${data.error.message || 'Unknown error'}`);
      }

      const text = data?.choices?.[0]?.message?.content || '';
      
      if (!text.trim()) {
        throw new Error('Empty response from OpenAI');
      }

      return text;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network connection failed - check your internet connection');
      }
      throw error;
    }
  }

  /**
   * Generate query using self-hosted endpoint with enhanced error handling
   */
  private static async generateWithSelfHosted(prompt: string, providerStore: any): Promise<string> {
    const endpoint = providerStore.selfHosted.endpoint;
    const model = providerStore.selfHosted.model || 'mistral:7b';
    const apiKey = providerStore.selfHosted.apiKey;

    if (!endpoint) {
      throw new Error('Self-hosted endpoint not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false
        })
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Self-hosted API authentication failed - check your API key');
        }
        if (response.status === 404) {
          throw new Error(`Self-hosted model "${model}" not found`);
        }
        if (response.status === 429) {
          throw new Error('Self-hosted API rate limit exceeded');
        }
        if (response.status >= 500) {
          throw new Error('Self-hosted service temporarily unavailable');
        }
        throw new Error(`Self-hosted API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API-level errors
      if (data.error) {
        throw new Error(`Self-hosted API error: ${data.error.message || data.error}`);
      }

      const text = data?.response || '';
      
      if (!text.trim()) {
        throw new Error('Empty response from self-hosted endpoint');
      }

      return text;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to self-hosted endpoint - check if the service is running');
      }
      throw error;
    }
  }
}