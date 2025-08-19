import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('AI Query Generation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Integration with existing AI providers', () => {
    it('should integrate correctly with Gemini provider configuration', async () => {
      // Mock provider store with Gemini configuration
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-gemini-key',
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
              parts: [{ text: 'quantum computing fundamentals YouTube tutorial' }]
            }
          }]
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'How does quantum computing work?',
        highlightedContext: 'quantum bits and superposition'
      });

      expect(result.success).toBe(true);
      expect(result.searchQuery).toBe('quantum computing fundamentals YouTube tutorial');
      expect(result.usedFallback).toBe(false);

      // Verify correct API call
      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': 'test-gemini-key'
          }
        })
      );

      // Verify prompt contains the expected template elements
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const prompt = requestBody.contents[0].parts[0].text;
      expect(prompt).toContain('quantum bits and superposition');
      expect(prompt).toContain('How does quantum computing work?');
      expect(prompt).toContain('Focus on finding explainer videos from YouTube');
    });

    it('should integrate correctly with Ollama provider configuration', async () => {
      // Mock provider store with Ollama configuration
      const mockProviderState = {
        defaultProvider: 'ollama',
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'llama3.2:7b'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock successful Ollama response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'machine learning basics explained video'
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is machine learning?',
        highlightedContext: 'neural networks and algorithms'
      });

      expect(result.success).toBe(true);
      expect(result.searchQuery).toBe('machine learning basics explained video');
      expect(result.usedFallback).toBe(false);

      // Verify correct API call through proxy
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ollama/generate?endpoint=http%3A%2F%2Flocalhost%3A11434',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      // Verify request body
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('llama3.2:7b');
      expect(requestBody.stream).toBe(false);
      expect(requestBody.prompt).toContain('neural networks and algorithms');
      expect(requestBody.prompt).toContain('What is machine learning?');
    });

    it('should handle provider switching correctly', async () => {
      // Start with Gemini
      let mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'gemini-key',
          model: 'gemini-2.0-flash'
        },
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'llama3.2'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'gemini response' }]
            }
          }]
        })
      });

      const result1 = await AIQueryGenerationService.generateSearchQuery({
        question: 'First question'
      });

      expect(result1.searchQuery).toBe('gemini response');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.any(Object)
      );

      // Switch to Ollama
      mockProviderState = {
        ...mockProviderState,
        defaultProvider: 'ollama'
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'ollama response'
        })
      });

      const result2 = await AIQueryGenerationService.generateSearchQuery({
        question: 'Second question'
      });

      expect(result2.searchQuery).toBe('ollama response');
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/ollama/generate'),
        expect.any(Object)
      );
    });
  });

  describe('Lookout Agent workflow integration', () => {
    it('should work with typical lookout agent workflow', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-key',
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
              parts: [{ text: 'blockchain technology explained YouTube' }]
            }
          }]
        })
      });

      // Simulate the workflow: user highlights text and asks a question
      const highlightedText = 'Blockchain is a distributed ledger technology that maintains a continuously growing list of records, called blocks, which are linked and secured using cryptography.';
      const userQuestion = 'How does blockchain ensure security?';

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: userQuestion,
        highlightedContext: highlightedText,
        timeoutMs: 10000
      });

      expect(result.success).toBe(true);
      expect(result.searchQuery).toBe('blockchain technology explained YouTube');
      expect(result.originalQuestion).toBe(userQuestion);
      expect(result.usedFallback).toBe(false);

      // Verify the prompt was built correctly for the workflow
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const prompt = requestBody.contents[0].parts[0].text;
      
      expect(prompt).toContain(highlightedText);
      expect(prompt).toContain(userQuestion);
      expect(prompt).toContain('Focus on finding explainer videos from YouTube');
      expect(prompt).toContain('Provide only the search query, nothing else');
    });

    it('should handle fallback gracefully in lookout workflow', async () => {
      // Mock provider store with missing API key
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: '', // Missing API key
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      const userQuestion = 'What is artificial intelligence?';
      const highlightedText = 'AI systems can perform tasks that typically require human intelligence.';

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: userQuestion,
        highlightedContext: highlightedText
      });

      expect(result.success).toBe(false);
      expect(result.searchQuery).toBe(userQuestion); // Should fallback to original question
      expect(result.originalQuestion).toBe(userQuestion);
      expect(result.usedFallback).toBe(true);
      expect(result.error).toContain('AI service authentication failed');
    });

    it('should handle timeout in lookout workflow', async () => {
      // Mock provider store
      const mockProviderState = {
        defaultProvider: 'ollama',
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'llama3.2'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock slow response
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      const userQuestion = 'Explain quantum mechanics';
      
      const result = await AIQueryGenerationService.generateSearchQuery({
        question: userQuestion,
        timeoutMs: 100 // Very short timeout
      });

      expect(result.success).toBe(false);
      expect(result.searchQuery).toBe(userQuestion);
      expect(result.usedFallback).toBe(true);
      expect(result.error).toContain('AI query generation failed');
    });
  });

  describe('Requirements validation', () => {
    it('should satisfy requirement 2.1: Send prompt to configured AI model', async () => {
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'test response' }]
            }
          }]
        })
      });

      await AIQueryGenerationService.generateSearchQuery({
        question: 'test question',
        highlightedContext: 'test context'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-goog-api-key': 'test-key'
          })
        })
      );
    });

    it('should satisfy requirement 2.2: Use specific prompt template', async () => {
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'test response' }]
            }
          }]
        })
      });

      await AIQueryGenerationService.generateSearchQuery({
        question: 'What is quantum computing?',
        highlightedContext: 'quantum mechanics principles'
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const prompt = requestBody.contents[0].parts[0].text;

      // Verify the exact prompt template is used
      expect(prompt).toContain('Given this highlighted text and user question');
      expect(prompt).toContain('suggest the best search query');
      expect(prompt).toContain('Focus on finding explainer videos from YouTube');
      expect(prompt).toContain('Highlighted text: \'quantum mechanics principles\'');
      expect(prompt).toContain('User question: \'What is quantum computing?\'');
      expect(prompt).toContain('Provide only the search query, nothing else');
    });

    it('should satisfy requirement 2.3: Fallback when AI fails', async () => {
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      // Mock API failure
      mockFetch.mockRejectedValueOnce(new Error('API failure'));

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is machine learning?'
      });

      expect(result.success).toBe(false);
      expect(result.searchQuery).toBe('What is machine learning?');
      expect(result.usedFallback).toBe(true);
      expect(result.error).toContain('AI query generation failed');
    });

    it('should satisfy requirement 2.4: Display generated search strategy', async () => {
      const mockProviderState = {
        defaultProvider: 'gemini',
        gemini: {
          apiKey: 'test-key',
          model: 'gemini-2.0-flash'
        }
      };
      vi.mocked(useAIProviderStore.getState).mockReturnValue(mockProviderState);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'AI fundamentals tutorial video' }]
            }
          }]
        })
      });

      const result = await AIQueryGenerationService.generateSearchQuery({
        question: 'What is AI?'
      });

      // The service should return the generated query that can be displayed
      expect(result.searchQuery).toBe('AI fundamentals tutorial video');
      expect(result.originalQuestion).toBe('What is AI?');
      expect(result.usedFallback).toBe(false);
      
      // This satisfies the requirement - the UI can display the searchQuery
      // as the "generated search strategy" in grey font
    });

    it('should satisfy requirement 5.2: Use existing AI provider configuration', async () => {
      // Test with different providers to ensure it uses existing configuration
      const providers = [
        {
          name: 'gemini',
          config: {
            defaultProvider: 'gemini',
            gemini: { apiKey: 'gemini-key', model: 'gemini-2.0-flash' }
          },
          mockResponse: {
            ok: true,
            json: async () => ({
              candidates: [{ content: { parts: [{ text: 'gemini result' }] } }]
            })
          }
        },
        {
          name: 'ollama',
          config: {
            defaultProvider: 'ollama',
            ollama: { endpoint: 'http://localhost:11434', model: 'llama3.2' }
          },
          mockResponse: {
            ok: true,
            json: async () => ({ response: 'ollama result' })
          }
        }
      ];

      for (const provider of providers) {
        vi.mocked(useAIProviderStore.getState).mockReturnValue(provider.config);
        mockFetch.mockResolvedValueOnce(provider.mockResponse);

        const result = await AIQueryGenerationService.generateSearchQuery({
          question: `Test question for ${provider.name}`
        });

        expect(result.success).toBe(true);
        expect(result.searchQuery).toBe(`${provider.name} result`);
        expect(result.usedFallback).toBe(false);

        mockFetch.mockReset();
      }
    });
  });
});