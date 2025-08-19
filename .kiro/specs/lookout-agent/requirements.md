# Requirements Document

## Introduction

The Lookout Agent is a research assistant feature that integrates with Readest's AI chat interface to provide intelligent web search capabilities. When users highlight text and use the `@lookout` command, the agent will generate optimal search queries using AI and fetch relevant materials from DuckDuckGo, prioritizing explainer videos and informative articles.

## Requirements

### Requirement 1

**User Story:** As a reader, I want to quickly research highlighted text by typing `@lookout <question>` so that I can get relevant explainer videos and articles without leaving the reading interface.

#### Acceptance Criteria

1. WHEN a user types `@lookout <question>` in the chat input THEN the system SHALL detect the command and extract the question
2. WHEN the lookout command is detected AND there is highlighted text context THEN the system SHALL combine both the highlighted text and user question for research
3. WHEN the lookout command is processed THEN the system SHALL open a modal interface showing the research process
4. WHEN the research is complete THEN the system SHALL display results prioritizing YouTube videos and informative articles
5. WHEN a user clicks on any result THEN the system SHALL open the link in the default browser
6. When the lookout command is detected even when the highlighted text context are not added by user, lookout command still search on web based on what user asked in the prompt. 

### Requirement 2

**User Story:** As a reader, I want the AI to generate optimal search queries based on my highlighted text and question so that I get more relevant search results.

#### Acceptance Criteria

1. WHEN the lookout command is triggered THEN the system SHALL send a prompt to the configured AI model to generate a search query
2. WHEN generating the search query THEN the AI SHALL receive the prompt: "Given this highlighted text and user question, suggest the best search query to find relevant information. Focus on finding explainer videos from YouTube and informative articles. Highlighted text: '[text]' User question: '[question]' Provide only the search query, nothing else."
3. WHEN the AI fails to generate a query THEN the system SHALL fallback to using the user's original question as the search query
4. WHEN the AI response is received THEN the system SHALL display the generated search strategy in the modal in grey font, just like how LLM chat show content of how LLM is thinking in UI

### Requirement 3

**User Story:** As a reader, I want the system to search DuckDuckGo for relevant content so that I can access free research materials without API keys.

#### Acceptance Criteria

1. WHEN a search query is generated THEN the system SHALL call the DuckDuckGo Instant Answer API
2. WHEN searching DuckDuckGo THEN the system SHALL prioritize YouTube videos in the results
3. WHEN DuckDuckGo returns results THEN the system SHALL categorize them as video, article, or link with appropriate indicators
4. WHEN the DuckDuckGo API fails THEN the system SHALL provide fallback web search links
5. WHEN no results are found THEN the system SHALL display a user-friendly message with alternative suggestions

### Requirement 4

**User Story:** As a reader, I want a clean modal interface to view research results so that I can quickly scan and access relevant materials.

#### Acceptance Criteria

1. WHEN the lookout command is triggered THEN the system SHALL display a modal overlay with loading state within the AI chat panel
2. WHEN research is in progress THEN the modal SHALL show the AI-generated search strategy and loading indicators
3. WHEN results are available THEN the modal SHALL display them with clear type indicators (video/article/link). In case of video, it should also render thumbnail of the video.
4. WHEN displaying results THEN each result SHALL show title, description, and source with appropriate icons
5. WHEN the user wants to close the modal THEN they SHALL be able to click outside or use an X button

### Requirement 5

**User Story:** As a reader, I want the lookout agent to integrate seamlessly with the existing chat interface so that it feels like a natural extension of the AI chat.

#### Acceptance Criteria

1. WHEN the user types in the chat input THEN the system SHALL detect `@lookout` commands without interfering with normal chat
2. WHEN the lookout agent is active THEN it SHALL use the existing AI provider configuration (Ollama/Gemini/Self-hosted)
3. WHEN there is highlighted text context THEN the lookout agent SHALL access it through the existing context system
4. WHEN errors occur THEN the system SHALL display them in a consistent style with the rest of the interface
5. WHEN the feature is used THEN it SHALL maintain the existing chat state and not interfere with ongoing conversations

### Requirement 6

**User Story:** As a reader, I want the system to handle errors gracefully so that failed searches don't break my reading experience.

#### Acceptance Criteria

1. WHEN the AI model fails to generate a search query THEN the system SHALL use the user's question as fallback
2. WHEN the DuckDuckGo API is unavailable THEN the system SHALL show an error message with manual search suggestions
3. WHEN network requests timeout THEN the system SHALL display appropriate timeout messages
4. WHEN any component fails THEN the system SHALL log errors for debugging while showing user-friendly messages
5. WHEN errors are resolved THEN the user SHALL be able to retry the search operation