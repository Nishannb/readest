import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIQueryGeneration } from '@/app/reader/hooks/useAIQueryGeneration';
import { AIQueryGenerationService } from '@/app/reader/services/aiQueryGenerationService';

// Mock the AI query generation service
vi.mock('@/app/reader/services/aiQueryGenerationService', () => ({
  AIQueryGenerationService: {
    generateSearchQuery: vi.fn()
  }
}));

describe('useAIQueryGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useAIQueryGeneration());

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.lastResponse).toBe(null);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.generateQuery).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('should handle successful query generation', async () => {
    const mockResponse = {
      success: true,
      searchQuery: 'quantum computing explained',
      originalQuestion: 'What is quantum computing?',
      usedFallback: false
    };

    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAIQueryGeneration());

    let response;
    await act(async () => {
      response = await result.current.generateQuery({
        question: 'What is quantum computing?',
        highlightedContext: 'quantum mechanics'
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.lastResponse).toEqual(mockResponse);
    expect(result.current.error).toBe(null);
    expect(response).toEqual(mockResponse);

    expect(AIQueryGenerationService.generateSearchQuery).toHaveBeenCalledWith({
      question: 'What is quantum computing?',
      highlightedContext: 'quantum mechanics'
    });
  });

  it('should handle query generation with error in response', async () => {
    const mockResponse = {
      success: true,
      searchQuery: 'What is AI?',
      originalQuestion: 'What is AI?',
      usedFallback: true,
      error: 'API timeout'
    };

    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAIQueryGeneration());

    let response;
    await act(async () => {
      response = await result.current.generateQuery({
        question: 'What is AI?'
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.lastResponse).toEqual(mockResponse);
    expect(result.current.error).toBe('API timeout');
    expect(response).toEqual(mockResponse);
  });

  it('should handle service throwing an error', async () => {
    const error = new Error('Network failure');
    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAIQueryGeneration());

    let response;
    await act(async () => {
      response = await result.current.generateQuery({
        question: 'What is machine learning?'
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBe('Network failure');
    
    // Should return fallback response
    expect(response).toEqual({
      success: true,
      searchQuery: 'What is machine learning?',
      originalQuestion: 'What is machine learning?',
      usedFallback: true,
      error: 'Network failure'
    });
  });

  it('should handle unknown error types', async () => {
    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockRejectedValueOnce('string error');

    const { result } = renderHook(() => useAIQueryGeneration());

    let response;
    await act(async () => {
      response = await result.current.generateQuery({
        question: 'What is blockchain?'
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBe('Unknown error occurred');
    
    // Should return fallback response
    expect(response).toEqual({
      success: true,
      searchQuery: 'What is blockchain?',
      originalQuestion: 'What is blockchain?',
      usedFallback: true,
      error: 'Unknown error occurred'
    });
  });

  it('should set isGenerating to true during generation', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockReturnValueOnce(promise);

    const { result } = renderHook(() => useAIQueryGeneration());

    // Start generation
    act(() => {
      result.current.generateQuery({
        question: 'What is AI?'
      });
    });

    // Should be generating
    expect(result.current.isGenerating).toBe(true);
    expect(result.current.error).toBe(null);

    // Resolve the promise
    await act(async () => {
      resolvePromise!({
        success: true,
        searchQuery: 'AI explained',
        originalQuestion: 'What is AI?',
        usedFallback: false
      });
    });

    // Should no longer be generating
    expect(result.current.isGenerating).toBe(false);
  });

  it('should reset state correctly', async () => {
    const mockResponse = {
      success: true,
      searchQuery: 'test query',
      originalQuestion: 'test question',
      usedFallback: false
    };

    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAIQueryGeneration());

    // Generate a query first
    await act(async () => {
      await result.current.generateQuery({
        question: 'test question'
      });
    });

    // Verify state is set
    expect(result.current.lastResponse).toEqual(mockResponse);

    // Reset
    act(() => {
      result.current.reset();
    });

    // Verify state is reset
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.lastResponse).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should clear error when starting new generation', async () => {
    // First, cause an error
    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockRejectedValueOnce(new Error('First error'));

    const { result } = renderHook(() => useAIQueryGeneration());

    await act(async () => {
      await result.current.generateQuery({
        question: 'first question'
      });
    });

    expect(result.current.error).toBe('First error');

    // Now make a successful call
    const mockResponse = {
      success: true,
      searchQuery: 'second query',
      originalQuestion: 'second question',
      usedFallback: false
    };

    vi.mocked(AIQueryGenerationService.generateSearchQuery).mockResolvedValueOnce(mockResponse);

    await act(async () => {
      await result.current.generateQuery({
        question: 'second question'
      });
    });

    // Error should be cleared
    expect(result.current.error).toBe(null);
    expect(result.current.lastResponse).toEqual(mockResponse);
  });

  it('should handle multiple concurrent generations correctly', async () => {
    const { result } = renderHook(() => useAIQueryGeneration());

    const mockResponse1 = {
      success: true,
      searchQuery: 'query 1',
      originalQuestion: 'question 1',
      usedFallback: false
    };

    const mockResponse2 = {
      success: true,
      searchQuery: 'query 2',
      originalQuestion: 'question 2',
      usedFallback: false
    };

    vi.mocked(AIQueryGenerationService.generateSearchQuery)
      .mockResolvedValueOnce(mockResponse1)
      .mockResolvedValueOnce(mockResponse2);

    let response1, response2;

    await act(async () => {
      // Start both generations
      const promise1 = result.current.generateQuery({ question: 'question 1' });
      const promise2 = result.current.generateQuery({ question: 'question 2' });

      [response1, response2] = await Promise.all([promise1, promise2]);
    });

    expect(response1).toEqual(mockResponse1);
    expect(response2).toEqual(mockResponse2);
    expect(result.current.isGenerating).toBe(false);
    // Last response should be the second one
    expect(result.current.lastResponse).toEqual(mockResponse2);
  });
});