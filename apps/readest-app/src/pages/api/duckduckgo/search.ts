import { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { ErrorHandlingService, ErrorContext } from '../../../app/reader/services/errorHandlingService';
import { PerformanceOptimizationService } from '../../../app/reader/services/performanceOptimizationService';

// TypeScript interfaces for the API
interface SearchRequest {
  query: string;
  prioritizeVideos?: boolean;
}

interface SearchResult {
  type: 'video' | 'article' | 'link';
  title: string;
  description: string;
  url: string;
  source: string;
  thumbnail?: string;
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  searchQuery: string;
  error?: string;
  retryCount?: number;
  fallbackUsed?: boolean;
}

interface DuckDuckGoInstantAnswer {
  Abstract?: string;
  AbstractText?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Image?: string;
  Heading?: string;
  Answer?: string;
  AnswerType?: string;
  Definition?: string;
  DefinitionSource?: string;
  DefinitionURL?: string;
  RelatedTopics?: Array<{
    FirstURL?: string;
    Text?: string;
    Icon?: {
      URL?: string;
    };
  }>;
  Results?: Array<{
    FirstURL?: string;
    Text?: string;
  }>;
}

// Helper function to detect if URL is a video
const isVideoUrl = (url: string): boolean => {
  const videoPatterns = [
    /youtube\.com\/watch/i,
    /youtu\.be\//i,
    /vimeo\.com\//i,
    /dailymotion\.com\//i,
    /twitch\.tv\//i,
  ];
  return videoPatterns.some(pattern => pattern.test(url));
};

// Helper function to extract YouTube thumbnail
const getYouTubeThumbnail = (url: string): string | undefined => {
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(youtubeRegex);
  if (match && match[1]) {
    return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
  }
  return undefined;
};

// Helper function to determine result type
const getResultType = (url: string, text: string): 'video' | 'article' | 'link' => {
  if (isVideoUrl(url)) {
    return 'video';
  }
  
  // Check for article indicators
  const articlePatterns = [
    /wikipedia\.org/i,
    /\.edu/i,
    /blog/i,
    /article/i,
    /news/i,
    /medium\.com/i,
    /stackoverflow\.com/i,
  ];
  
  if (articlePatterns.some(pattern => pattern.test(url)) || 
      text.toLowerCase().includes('article') || 
      text.toLowerCase().includes('explanation')) {
    return 'article';
  }
  
  return 'link';
};

// Helper function to extract domain name
const getDomainName = (url: string): string => {
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch {
    return 'Unknown';
  }
};

// Helper function to clean and format text
const cleanText = (text: string): string => {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 200); // Limit length
};

// Main function to call DuckDuckGo Instant Answer API with comprehensive error handling
const searchDuckDuckGo = async (query: string): Promise<{ results: SearchResult[]; success: boolean; error?: string }> => {
  const results: SearchResult[] = [];
  
  try {
    // Use error handling service with retry logic
    const data = await ErrorHandlingService.withRetry(
      async () => {
        // Call DuckDuckGo Instant Answer API
        const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Readest-LookoutAgent/1.0',
            },
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error('DuckDuckGo API rate limit exceeded');
            }
            if (response.status >= 500) {
              throw new Error('DuckDuckGo service temporarily unavailable');
            }
            throw new Error(`DuckDuckGo API error: ${response.status} ${response.statusText}`);
          }

          const data: DuckDuckGoInstantAnswer = await response.json();
          return data;
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('DuckDuckGo API request timeout');
          }
          throw error;
        }
      },
      {
        operation: 'duckduckgo-search',
        originalError: 'Initial search attempt',
        userInput: query
      },
      {
        maxRetries: 2,
        retryDelayMs: 1000,
        backoffMultiplier: 2
      }
    );

    // Process the data

    // Process Abstract/Definition results
    if (data.AbstractURL && data.AbstractText) {
      results.push({
        type: getResultType(data.AbstractURL, data.AbstractText),
        title: data.Heading || 'Information',
        description: cleanText(data.AbstractText),
        url: data.AbstractURL,
        source: getDomainName(data.AbstractURL),
        thumbnail: data.Image || (isVideoUrl(data.AbstractURL) ? getYouTubeThumbnail(data.AbstractURL) : undefined),
      });
    }

    if (data.DefinitionURL && data.Definition) {
      results.push({
        type: getResultType(data.DefinitionURL, data.Definition),
        title: 'Definition',
        description: cleanText(data.Definition),
        url: data.DefinitionURL,
        source: getDomainName(data.DefinitionURL),
      });
    }

    // Process Related Topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.slice(0, 8).forEach(topic => {
        if (topic.FirstURL && topic.Text) {
          const cleanedText = cleanText(topic.Text);
          const title = cleanedText.split(' - ')[0] || cleanedText.substring(0, 60);
          const description = cleanedText.length > 60 ? cleanedText : cleanedText.split(' - ').slice(1).join(' - ') || cleanedText;
          
          results.push({
            type: getResultType(topic.FirstURL, topic.Text),
            title,
            description,
            url: topic.FirstURL,
            source: getDomainName(topic.FirstURL),
            thumbnail: topic.Icon?.URL || (isVideoUrl(topic.FirstURL) ? getYouTubeThumbnail(topic.FirstURL) : undefined),
          });
        }
      });
    }

    // Process Results
    if (data.Results && Array.isArray(data.Results)) {
      data.Results.slice(0, 5).forEach(result => {
        if (result.FirstURL && result.Text) {
          const cleanedText = cleanText(result.Text);
          const title = cleanedText.split(' - ')[0] || cleanedText.substring(0, 60);
          const description = cleanedText.length > 60 ? cleanedText : cleanedText.split(' - ').slice(1).join(' - ') || cleanedText;
          
          results.push({
            type: getResultType(result.FirstURL, result.Text),
            title,
            description,
            url: result.FirstURL,
            source: getDomainName(result.FirstURL),
            thumbnail: isVideoUrl(result.FirstURL) ? getYouTubeThumbnail(result.FirstURL) : undefined,
          });
        }
      });
    }

    return { results, success: true };

  } catch (error) {
    // Handle error with error handling service
    const errorContext: ErrorContext = {
      operation: 'duckduckgo-search',
      originalError: error instanceof Error ? error : String(error),
      userInput: query,
      timestamp: Date.now()
    };

    const recovery = ErrorHandlingService.handleError(errorContext);
    
    return { 
      results: [], 
      success: false, 
      error: recovery.userMessage 
    };
  }
};

// Fallback function to provide manual search links
const getFallbackResults = (query: string): SearchResult[] => {
  const encodedQuery = encodeURIComponent(query);
  
  return [
    {
      type: 'video',
      title: `Search "${query}" on YouTube`,
      description: 'Find explainer videos and tutorials on YouTube',
      url: `https://www.youtube.com/results?search_query=${encodedQuery}`,
      source: 'youtube.com',
      thumbnail: 'https://www.youtube.com/favicon.ico',
    },
    {
      type: 'article',
      title: `Search "${query}" on Wikipedia`,
      description: 'Find comprehensive articles and explanations',
      url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodedQuery}`,
      source: 'wikipedia.org',
    },
    {
      type: 'link',
      title: `Search "${query}" on DuckDuckGo`,
      description: 'General web search results',
      url: `https://duckduckgo.com/?q=${encodedQuery}`,
      source: 'duckduckgo.com',
    },
    {
      type: 'article',
      title: `Search "${query}" on Stack Overflow`,
      description: 'Find technical discussions and solutions',
      url: `https://stackoverflow.com/search?q=${encodedQuery}`,
      source: 'stackoverflow.com',
    },
  ];
};

// Request validation function
const validateRequest = (body: any): { isValid: boolean; error?: string; data?: SearchRequest } => {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Request body is required' };
  }

  const { query, prioritizeVideos } = body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { isValid: false, error: 'Query parameter is required and must be a non-empty string' };
  }

  if (query.length > 500) {
    return { isValid: false, error: 'Query parameter is too long (max 500 characters)' };
  }

  if (prioritizeVideos !== undefined && typeof prioritizeVideos !== 'boolean') {
    return { isValid: false, error: 'prioritizeVideos parameter must be a boolean' };
  }

  return {
    isValid: true,
    data: {
      query: query.trim(),
      prioritizeVideos: prioritizeVideos || false,
    },
  };
};

// Main API handler
const handler = async (req: NextApiRequest, res: NextApiResponse<SearchResponse>) => {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      results: [],
      searchQuery: '',
      error: 'Method not allowed. Use POST.',
    });
  }

  // Validate request
  const validation = validateRequest(req.body);
  if (!validation.isValid || !validation.data) {
    return res.status(400).json({
      success: false,
      results: [],
      searchQuery: '',
      error: validation.error || 'Invalid request',
    });
  }

  const { query, prioritizeVideos } = validation.data;

  try {
    // Check cache first for performance optimization
    const cacheKey = `${query}-${prioritizeVideos ? 'videos' : 'all'}`;
    const cachedResult = PerformanceOptimizationService.getCachedSearchResults<SearchResponse>(cacheKey);
    
    if (cachedResult) {
      return res.status(200).json(cachedResult);
    }

    // Search DuckDuckGo with comprehensive error handling
    const searchResult = await searchDuckDuckGo(query);
    let results = searchResult.results;
    const apiSuccess = searchResult.success;
    const searchError = searchResult.error;

    // If prioritizeVideos is true, sort videos first
    if (prioritizeVideos) {
      results.sort((a, b) => {
        if (a.type === 'video' && b.type !== 'video') return -1;
        if (a.type !== 'video' && b.type === 'video') return 1;
        return 0;
      });
    }

    // If no results from API or API failed, provide fallback
    if (results.length === 0 || !apiSuccess) {
      const fallbackResults = getFallbackResults(query);
      
      return res.status(200).json({
        success: false,
        results: fallbackResults,
        searchQuery: query,
        error: searchError || 'Search service temporarily unavailable. Here are some manual search options.',
        fallbackUsed: true
      });
    }

    // Limit results to 10
    results = results.slice(0, 10);

    const response: SearchResponse = {
      success: true,
      results,
      searchQuery: query,
    };

    // Cache the successful response
    PerformanceOptimizationService.setCachedSearchResults(cacheKey, response);

    return res.status(200).json(response);

  } catch (error) {
    // Handle unexpected errors with error handling service
    const errorContext: ErrorContext = {
      operation: 'duckduckgo-search',
      originalError: error instanceof Error ? error : String(error),
      userInput: query,
      timestamp: Date.now()
    };

    const recovery = ErrorHandlingService.handleError(errorContext);
    
    // Provide fallback results even on error
    const fallbackResults = getFallbackResults(query);
    
    return res.status(200).json({
      success: false,
      results: fallbackResults,
      searchQuery: query,
      error: recovery.userMessage,
      fallbackUsed: true
    });
  }
};

export default handler;