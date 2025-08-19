/**
 * Notes command detection utilities
 * Handles detection and parsing of @notes commands in chat input
 */

export interface NotesCommand {
  isNotesCommand: boolean;
  noteText: string;
  highlightedContext?: string;
}

/**
 * Detects if the input contains a notes command and extracts the note text
 * @param input - The chat input string
 * @param contextSnippets - Array of highlighted text context
 * @returns NotesCommand object with detection results
 */
export function detectNotesCommand(input: string, contextSnippets: string[] = []): NotesCommand {
  // Regex pattern to match @notes followed by note text (with dotall flag for multiline)
  const notesPattern = /^@notes\s+([\s\S]+)$/i;
  const trimmedInput = input.trim();
  
  const match = trimmedInput.match(notesPattern);
  
  if (!match) {
    return {
      isNotesCommand: false,
      noteText: '',
    };
  }
  
  const noteText = match[1]?.trim() || '';
  
  // Validate that there's actually note text
  if (!noteText) {
    return {
      isNotesCommand: false,
      noteText: '',
    };
  }
  
  // Combine highlighted context if available
  const highlightedContext = contextSnippets.length > 0 
    ? contextSnippets.join('\n\n') 
    : undefined;
  
  return {
    isNotesCommand: true,
    noteText,
    highlightedContext,
  };
}

/**
 * Validates that a notes command has the correct format
 * @param input - The chat input string
 * @returns boolean indicating if the command format is valid
 */
export function isValidNotesCommand(input: string): boolean {
  const trimmedInput = input.trim();
  const notesPattern = /^@notes\s+([\s\S]+)$/i;
  const match = trimmedInput.match(notesPattern);
  
  if (!match) {
    return false;
  }
  
  const noteText = match[1]?.trim() || '';
  return noteText.length > 0;
}

/**
 * Extracts just the note text part from a valid notes command
 * @param input - The chat input string (should be a valid notes command)
 * @returns The extracted note text string
 */
export function extractNoteTextFromNotesCommand(input: string): string {
  const trimmedInput = input.trim();
  const notesPattern = /^@notes\s+([\s\S]+)$/i;
  const match = trimmedInput.match(notesPattern);
  
  return match?.[1]?.trim() || '';
}



