import { useState, useCallback } from 'react';
import { AIQueryGenerationService, QueryGenerationRequest, QueryGenerationResponse } from '../services/aiQueryGenerationService';

export interface UseAIQueryGenerationState {
  isGenerating: boolean;
  lastResponse: QueryGenerationResponse | null;
  error: string | null;
}

export interface UseAIQueryGenerationReturn extends UseAIQueryGenerationState {
  generateQuery: (request: QueryGenerationRequest) => Promise<QueryGenerationResponse>;
  reset: () => void;
}

/**
 * React hook for AI query generation
 * Provides state management and easy integration with React components
 */
export function useAIQueryGeneration(): UseAIQueryGenerationReturn {
  const [state, setState] = useState<UseAIQueryGenerationState>({
    isGenerating: false,
    lastResponse: null,
    error: null
  });

  const generateQuery = useCallback(async (request: QueryGenerationRequest): Promise<QueryGenerationResponse> => {
    setState(prev => ({
      ...prev,
      isGenerating: true,
      error: null
    }));

    try {
      const response = await AIQueryGenerationService.generateSearchQuery(request);
      
      setState(prev => ({
        ...prev,
        isGenerating: false,
        lastResponse: response,
        error: response.error || null
      }));

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: errorMessage
      }));

      // Return fallback response even on unexpected errors
      const fallbackResponse: QueryGenerationResponse = {
        success: true,
        searchQuery: request.question.trim(),
        originalQuestion: request.question,
        usedFallback: true,
        error: errorMessage
      };

      return fallbackResponse;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isGenerating: false,
      lastResponse: null,
      error: null
    });
  }, []);

  return {
    ...state,
    generateQuery,
    reset
  };
}