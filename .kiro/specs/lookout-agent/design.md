# Design Document

## Overview

The Lookout Agent is a research assistant feature that extends Readest's AI chat interface with intelligent web search capabilities. The system follows a three-stage process: command detection, AI-powered search query generation, and DuckDuckGo content retrieval. The feature integrates seamlessly with existing chat infrastructure while providing a dedicated modal interface for research results.

## Architecture

### High-Level Flow
```
User Input (@lookout command) → Command Detection → AI Query Generation → DuckDuckGo Search → Results Display
```

### Component Architecture
```
AIChatPanel (modified)
├── Command Detection Logic
├── LookoutAgent Modal
│   ├── Search Strategy Display
│   ├── Loading States
│   ├── Results List
│   └── Error Handling
└── Integration with existing AI providers
```

### API Architecture
```
Frontend → /api/duckduckgo/search → DuckDuckGo Instant Answer API
                                 → Fallback Web Search
```

## Components and Interfaces

### 1. Command Detection System

**Location:** `AIChatPanel.tsx` (modification)

**Interface:**
```typescript
interface LookoutCommand {
  isLookoutCommand: boolean;
  question: string;
  highlightedContext?: string;
}

function detectLookoutCommand(input: string, context: string[]): LookoutCommand
```

**Implementation Details:**
- Regex pattern: `/^@lookout\s+(.+)$/i`
- Extract question from command
- Combine with existing highlighted context from chat store
- Prevent normal chat submission when lookout command detected

### 2. LookoutAgent Component

**Location:** `src/app/reader/components/LookoutAgent.tsx` (new)

**Props Interface:**
```typescript
interface LookoutAgentProps {
  isOpen: boolean;
  onClose: () => void;
  question: string;
  context?: string;
  bookKey: string;
}
```

**State Management:**
```typescript
interface LookoutState {
  stage: 'generating-query' | 'searching' | 'results' | 'error';
  searchQuery: string;
  results: SearchResult[];
  error?: string;
}

interface SearchResult {
  type: 'video' | 'article' | 'link';
  title: string;
  description: string;
  url: string;
  source: string;
  thumbnail?: string;
}
```

### 3. DuckDuckGo API Endpoint

**Location:** `src/pages/api/duckduckgo/search.ts` (new)

**Request Interface:**
```typescript
interface SearchRequest {
  query: string;
  prioritizeVideos?: boolean;
}
```

**Response Interface:**
```typescript
interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  searchQuery: string;
  error?: string;
}
```

**API Integration:**
- Primary: DuckDuckGo Instant Answer API (`https://api.duckduckgo.com/`)
- Fallback: DuckDuckGo search links for manual browsing
- YouTube detection via URL patterns and site-specific searches

### 4. AI Query Generation Service

**Integration:** Uses existing `useAIProviderStore` and provider logic

**Prompt Template:**
```
Given this highlighted text and user question, suggest the best search query to find relevant information. Focus on finding explainer videos from YouTube and informative articles.

Highlighted text: '[context]'
User question: '[question]'

Provide only the search query, nothing else.
```

**Fallback Strategy:**
- If AI fails: Use original user question
- If no context: Use question directly
- If both fail: Provide generic search suggestions

## Data Models

### Search Result Types

```typescript
enum ResultType {
  VIDEO = 'video',
  ARTICLE = 'article', 
  LINK = 'link'
}

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  description: string;
  url: string;
  source: string;
  thumbnail?: string;
  duration?: string; // for videos
  publishDate?: string;
  relevanceScore?: number;
}
```

### Modal State Management

```typescript
interface LookoutModalState {
  isOpen: boolean;
  stage: 'idle' | 'generating' | 'searching' | 'results' | 'error';
  searchQuery: string;
  results: SearchResult[];
  error: string | null;
  retryCount: number;
}
```

## Error Handling

### Error Categories

1. **AI Generation Errors**
   - Network timeout
   - Model unavailable
   - Invalid response format
   - Fallback: Use original question

2. **Search API Errors**
   - DuckDuckGo API unavailable
   - Rate limiting
   - Network connectivity
   - Fallback: Manual search links

3. **UI Errors**
   - Component rendering issues
   - State management errors
   - Fallback: Close modal with error message

### Error Recovery Strategy

```typescript
interface ErrorRecovery {
  retryable: boolean;
  fallbackAction: 'use-original-query' | 'manual-search' | 'close-modal';
  userMessage: string;
  logLevel: 'info' | 'warn' | 'error';
}
```

## Testing Strategy

### Unit Tests
- Command detection regex patterns
- AI query generation with various inputs
- DuckDuckGo API response parsing
- Error handling scenarios

### Integration Tests
- End-to-end lookout command flow
- AI provider integration
- Modal state management
- Context integration with existing chat

### Manual Testing Scenarios
1. Highlight text → `@lookout explain this concept`
2. No highlighted text → `@lookout what is quantum computing`
3. AI model unavailable → fallback behavior
4. DuckDuckGo API down → error handling
5. Network timeout → retry mechanism

## Performance Considerations

### Optimization Strategies
- Debounce command detection to avoid unnecessary processing
- Cache search results for identical queries (session-based)
- Lazy load modal component to reduce initial bundle size
- Implement request cancellation for abandoned searches

### Resource Management
- Limit concurrent API requests
- Implement timeout for AI query generation (10s)
- Implement timeout for DuckDuckGo searches (15s)
- Clean up event listeners and timers on component unmount

## Security Considerations

### Input Sanitization
- Sanitize user input before sending to AI models
- Validate search queries before API calls
- Escape HTML in search results display

### API Security
- No API keys required (DuckDuckGo is free)
- Rate limiting on backend endpoint
- CORS configuration for API endpoints
- Input validation on all API endpoints

## Accessibility

### Keyboard Navigation
- Modal accessible via keyboard
- Tab navigation through results
- Escape key to close modal
- Enter key to open selected result

### Screen Reader Support
- ARIA labels for all interactive elements
- Semantic HTML structure
- Loading state announcements
- Error message accessibility

### Visual Accessibility
- High contrast mode support
- Scalable text and icons
- Clear visual hierarchy
- Loading indicators with text alternatives