import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIQueryGenerationService } from '@/app/reader/services/aiQueryGenerationService';
import { useAIProviderStore } from '@/store/aiProviderStore';

// Mock the AI provider store
vi.mock('@/store/aiProviderStore', () => ({
  useAIProviderStore: {
    getState: vi.fn()
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AIQueryGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateSearchQuery', () => {
    it('should generate search query successfully with Gemini', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-api-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock successful Gemini response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'quantum computing basics explained' }]
            }
          }]
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is quantum computing?',
        highlightedContext: 'quantum mechanics principles'
      });

      expect(result).toEqual({
        success: true,
        searchQuery: 'quantum computing basics explained',
        originalQuestion: 'What is quantum computing?',
        usedFallback: false
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': 'test-api-key'
          }
        })
      );
    });

    it('should generate search query successfully with Ollama', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'ollama',
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'llama3.2'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock successful Ollama response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'machine learning fundamentals tutorial'
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'How does machine learning work?'
      });

      expect(result).toEqual({
        success: true,
        searchQuery: 'machine learning fundamentals tutorial',
        originalQuestion: 'How does machine learning work?',
        usedFallback: false
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ollama/generate?endpoint=http%3A%2F%2Flocalhost%3A11434',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: expect.stringContaining('"model":"llama3.2"')
        })
      );
    });

    it('should generate search query successfully with OpenAI', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'openai',
        openai: {
          apiKey: 'sk-test-key',
          model: 'gpt-4o'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock successful OpenAI response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'artificial intelligence introduction video'
            }
          }]
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is AI?',
        highlightedContext: 'artificial intelligence concepts'
      });

      expect(result).toEqual({
        success: true,
        searchQuery: 'artificial intelligence introduction video',
        originalQuestion: 'What is AI?',
        usedFallback: false
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sk-test-key'
          }
        })
      );
    });

    it('should generate search query successfully with self-hosted', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'selfHosted',
        selfHosted: {
          endpoint: 'http://localhost:8080/api/generate',
          model: 'mistral:7b',
          apiKey: 'test-key'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock successful self-hosted response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'blockchain technology explained simply'
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'How does blockchain work?'
      });

      expect(result).toEqual({
        success: true,
        searchQuery: 'blockchain technology explained simply',
        originalQuestion: 'How does blockchain work?',
        usedFallback: false
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          }
        })
      );
    });

    it('should use fallback when AI generation fails', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-api-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock failed API response
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is quantum computing?',
        highlightedContext: 'quantum mechanics principles'
      });

      expect(result).toEqual({
        success: false,
        searchQuery: 'What is quantum computing?',
        originalQuestion: 'What is quantum computing?',
        usedFallback: true,
        error: 'AI query generation failed. Using your original question for search.',
        retryCount: 0
      });
    });

    it('should use fallback when API returns empty response', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-api-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock empty response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: '' }]
            }
          }]
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is machine learning?'
      });

      expect(result).toEqual({
        success: false,
        searchQuery: 'What is machine learning?',
        originalQuestion: 'What is machine learning?',
        usedFallback: true,
        error: 'AI query generation failed. Using your original question for search.',
        retryCount: 0
      });
    });

    it('should handle timeout correctly', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-api-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock slow response that will timeout
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is AI?',
        timeoutMs: 100 // Very short timeout
      });

      expect(result).toEqual({
        success: false,
        searchQuery: 'What is AI?',
        originalQuestion: 'What is AI?',
        usedFallback: true,
        error: 'AI query generation failed. Using your original question for search.',
        retryCount: 0
      });
    });

    it('should handle missing API keys gracefully', async () => {
      // Mock provider store with missing API key
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: '',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is quantum computing?'
      });

      expect(result).toEqual({
        success: false,
        searchQuery: 'What is quantum computing?',
        originalQuestion: 'What is quantum computing?',
        usedFallback: true,
        error: 'AI service authentication failed. Using your original question for search.',
        retryCount: 0
      });
    });

    it('should handle missing Ollama model gracefully', async () => {
      // Mock provider store with missing model
      const mockProviderState = {
        defaultProvider: 'ollama',
        ollama: {
          endpoint: 'http://localhost:11434',
          model: ''
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is machine learning?'
      });

      expect(result).toEqual({
        success: false,
        searchQuery: 'What is machine learning?',
        originalQuestion: 'What is machine learning?',
        usedFallback: true,
        error: 'AI query generation failed. Using your original question for search.',
        retryCount: 0
      });
    });

    it('should build correct prompt with context', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-api-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'test query' }]
            }
          }]
        })
      });

      await AIQueryGenerationService.generateSearchQuery({
        question: 'What is this?',
        highlightedContext: 'quantum mechanics'
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const prompt = requestBody.contents[0].parts[0].text;

      expect(prompt).toContain('quantum mechanics');
      expect(prompt).toContain('What is this?');
      expect(prompt).toContain('Focus on finding explainer videos from YouTube');
    });

    it('should build correct prompt without context', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-api-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'test query' }]
            }
          }]
        })
      });

      await AIQueryGenerationService.generateSearchQuery({
        question: 'What is AI?'
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const prompt = requestBody.contents[0].parts[0].text;

      expect(prompt).toContain('None');
      expect(prompt).toContain('What is AI?');
      expect(prompt).toContain('Focus on finding explainer videos from YouTube');
    });

    it('should trim whitespace from generated queries', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-api-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock response with whitespace
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: '  quantum computing tutorial  \n' }]
            }
          }]
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is quantum computing?'
      });

      expect(result.searchQuery).toBe('quantum computing tutorial');
    });
  });
});