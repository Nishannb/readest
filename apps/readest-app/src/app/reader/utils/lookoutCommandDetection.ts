/**
 * Lookout command detection utilities
 * Handles detection and parsing of @lookout commands in chat input
 */

export interface LookoutCommand {
  isLookoutCommand: boolean;
  question: string;
  highlightedContext?: string;
}

/**
 * Detects if the input contains a lookout command and extracts the question
 * @param input - The chat input string
 * @param contextSnippets - Array of highlighted text context
 * @returns LookoutCommand object with detection results
 */
export function detectLookoutCommand(input: string, contextSnippets: string[] = []): LookoutCommand {
  // Regex pattern to match @lookout followed by a question (with dotall flag for multiline)
  const lookoutPattern = /^@lookout\s+([\s\S]+)$/i;
  const trimmedInput = input.trim();
  
  const match = trimmedInput.match(lookoutPattern);
  
  if (!match) {
    return {
      isLookoutCommand: false,
      question: '',
    };
  }
  
  const question = match[1]?.trim() || '';
  
  // Validate that there's actually a question
  if (!question) {
    return {
      isLookoutCommand: false,
      question: '',
    };
  }
  
  // Combine highlighted context if available
  const highlightedContext = contextSnippets.length > 0 
    ? contextSnippets.join('\n\n') 
    : undefined;
  
  return {
    isLookoutCommand: true,
    question,
    highlightedContext,
  };
}

/**
 * Validates that a lookout command has the correct format
 * @param input - The chat input string
 * @returns boolean indicating if the command format is valid
 */
export function isValidLookoutCommand(input: string): boolean {
  const trimmedInput = input.trim();
  const lookoutPattern = /^@lookout\s+([\s\S]+)$/i;
  const match = trimmedInput.match(lookoutPattern);
  
  if (!match) {
    return false;
  }
  
  const question = match[1]?.trim() || '';
  return question.length > 0;
}

/**
 * Extracts just the question part from a valid lookout command
 * @param input - The chat input string (should be a valid lookout command)
 * @returns The extracted question string
 */
export function extractQuestionFromLookoutCommand(input: string): string {
  const trimmedInput = input.trim();
  const lookoutPattern = /^@lookout\s+([\s\S]+)$/i;
  const match = trimmedInput.match(lookoutPattern);
  
  return match?.[1]?.trim() || '';
}