/**
 * Example usage of the AI Query Generation Service
 * 
 * This file demonstrates how to use the AIQueryGenerationService
 * in different scenarios within the Lookout Agent workflow.
 */

import { AIQueryGenerationService } from './aiQueryGenerationService';
import { useAIQueryGeneration } from '../hooks/useAIQueryGeneration';

// Example 1: Basic usage with just a question
export async function basicQueryGeneration() {
  const result = await AIQueryGenerationService.generateSearchQuery({
    question: 'What is quantum computing?'
  });

  console.log('Generated query:', result.searchQuery);
  console.log('Used fallback:', result.usedFallback);
  
  if (result.error) {
    console.warn('Error occurred:', result.error);
  }
}

// Example 2: Usage with highlighted context
export async function contextualQueryGeneration() {
  const highlightedText = `
    Quantum computing is a type of computation that harnesses the collective 
    properties of quantum states, such as superposition, interference, and 
    entanglement, to perform calculations.
  `;

  const result = await AIQueryGenerationService.generateSearchQuery({
    question: 'How does superposition work in quantum computing?',
    highlightedContext: highlightedText,
    timeoutMs: 15000 // Custom timeout
  });

  console.log('Original question:', result.originalQuestion);
  console.log('Generated search query:', result.searchQuery);
  console.log('Used AI fallback:', result.usedFallback);
}

// Example 3: Using the React hook in a component
export function ExampleLookoutComponent() {
  const { generateQuery, isGenerating, lastResponse, error, reset } = useAIQueryGeneration();

  const handleLookoutCommand = async (question: string, context?: string) => {
    // Reset previous state
    reset();

    // Generate the query
    const result = await generateQuery({
      question,
      highlightedContext: context,
      timeoutMs: 10000
    });

    // The result is automatically stored in lastResponse
    console.log('Query generation complete:', result);
    
    // Now you can use result.searchQuery to search DuckDuckGo
    // This would typically be passed to the DuckDuckGo search API
  };

  return {
    handleLookoutCommand,
    isGenerating,
    lastResponse,
    error
  };
}

// Example 4: Error handling patterns
export async function robustQueryGeneration(question: string, context?: string) {
  try {
    const result = await AIQueryGenerationService.generateSearchQuery({
      question,
      highlightedContext: context,
      timeoutMs: 8000
    });

    if (result.usedFallback) {
      console.warn('AI generation failed, using fallback query:', result.searchQuery);
      console.warn('Reason:', result.error);
    } else {
      console.log('AI generated optimal query:', result.searchQuery);
    }

    // Always proceed with the search - the service guarantees a usable query
    return result.searchQuery;
    
  } catch (error) {
    // This should rarely happen due to built-in fallback logic
    console.error('Unexpected error in query generation:', error);
    
    // Ultimate fallback - use the original question
    return question.trim();
  }
}

// Example 5: Integration with different AI providers
export async function demonstrateProviderIntegration() {
  // The service automatically uses the configured provider from useAIProviderStore
  // No need to specify which provider - it reads from the store
  
  const examples = [
    {
      question: 'Explain machine learning',
      context: 'Neural networks and deep learning algorithms'
    },
    {
      question: 'What is blockchain?',
      context: 'Distributed ledger technology and cryptocurrency'
    },
    {
      question: 'How does photosynthesis work?',
      context: 'Plants convert sunlight into chemical energy'
    }
  ];

  for (const example of examples) {
    console.log(`\n--- Processing: ${example.question} ---`);
    
    const result = await AIQueryGenerationService.generateSearchQuery({
      question: example.question,
      highlightedContext: example.context
    });

    console.log(`Generated query: "${result.searchQuery}"`);
    console.log(`Used fallback: ${result.usedFallback}`);
    
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  }
}

// Example 6: Timeout handling
export async function timeoutExample() {
  console.log('Testing with very short timeout...');
  
  const result = await AIQueryGenerationService.generateSearchQuery({
    question: 'Explain artificial intelligence',
    timeoutMs: 1 // Very short timeout to trigger fallback
  });

  console.log('Result with short timeout:');
  console.log('- Query:', result.searchQuery);
  console.log('- Used fallback:', result.usedFallback);
  console.log('- Error:', result.error);
}

// Example 7: Batch processing
export async function batchQueryGeneration(questions: string[]) {
  const results = await Promise.all(
    questions.map(question => 
      AIQueryGenerationService.generateSearchQuery({ question })
    )
  );

  results.forEach((result, index) => {
    console.log(`Question ${index + 1}: ${questions[index]}`);
    console.log(`Generated: ${result.searchQuery}`);
    console.log(`Fallback: ${result.usedFallback}`);
    console.log('---');
  });

  return results;
}

// Example usage in a real component scenario
export const lookoutWorkflowExample = {
  // Step 1: User highlights text and types @lookout command
  userInput: '@lookout How does this quantum algorithm work?',
  highlightedText: 'Shor\'s algorithm can factor large integers exponentially faster than classical algorithms',

  // Step 2: Extract question from command (already implemented in previous tasks)
  extractedQuestion: 'How does this quantum algorithm work?',

  // Step 3: Generate optimal search query using AI
  generateSearchQuery: async function() {
    return await AIQueryGenerationService.generateSearchQuery({
      question: this.extractedQuestion,
      highlightedContext: this.highlightedText
    });
  },

  // Step 4: Use the generated query for DuckDuckGo search (next task)
  searchWithGeneratedQuery: async function(searchQuery: string) {
    // This would call the DuckDuckGo API with the generated query
    console.log(`Searching DuckDuckGo for: "${searchQuery}"`);
    // Implementation would be in the next task
  }
};