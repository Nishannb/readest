import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  FiVideo, 
  FiFileText, 
  FiExternalLink, 
  FiSearch, 
  FiAlertCircle, 
  FiRefreshCw, 
  FiPlay,
  FiClock,
  FiGlobe,
  FiYoutube
} from 'react-icons/fi';
import { 
  MdArticle, 
  MdLink, 
  MdVideoLibrary, 
  MdOndemandVideo,
  MdNewspaper,
  MdLanguage
} from 'react-icons/md';
import { 
  HiOutlinePlay,
  HiOutlineDocument,
  HiOutlineGlobeAlt
} from 'react-icons/hi2';
import Dialog from '@/components/Dialog';
import { AIQueryGenerationService } from '../services/aiQueryGenerationService';
import { ErrorHandlingService, ErrorContext } from '../services/errorHandlingService';
import { PerformanceOptimizationService } from '../services/performanceOptimizationService';

// Types based on design document
export interface SearchResult {
  id: string;
  type: 'video' | 'article' | 'link';
  title: string;
  description: string;
  url: string;
  source: string;
  thumbnail?: string;
  duration?: string;
  publishDate?: string;
  relevanceScore?: number;
}

export interface LookoutAgentProps {
  isOpen: boolean;
  onClose: () => void;
  question: string;
  context?: string;
  bookKey: string;
}

interface LookoutState {
  stage: 'generating-query' | 'searching' | 'results' | 'error';
  searchQuery: string;
  results: SearchResult[];
  error?: string;
  retryCount: number;
  isRetrying: boolean;
  fallbackUsed: boolean;
  userFriendlyError?: string;
  suggestedActions?: string[];
}

const LookoutAgent: React.FC<LookoutAgentProps> = ({
  isOpen,
  onClose,
  question,
  context,
}) => {
  const [state, setState] = useState<LookoutState>({
    stage: 'generating-query',
    searchQuery: '',
    results: [],
    error: undefined,
    retryCount: 0,
    isRetrying: false,
    fallbackUsed: false,
    userFriendlyError: undefined,
    suggestedActions: undefined,
  });

  // Refs for keyboard navigation and focus management
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number>(-1);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  
  // Performance optimization refs
  const currentRequestIdRef = useRef<string | null>(null);
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);

  // Reset state when modal opens and start the search process
  useEffect(() => {
    if (isOpen) {
      setState({
        stage: 'generating-query',
        searchQuery: '',
        results: [],
        error: undefined,
        retryCount: 0,
        isRetrying: false,
        fallbackUsed: false,
        userFriendlyError: undefined,
        suggestedActions: undefined,
      });
      
      // Reset focus state
      setFocusedResultIndex(-1);
      resultRefs.current = [];
      
      // Start the search process
      performSearch();
    }
  }, [isOpen, question, context]);

  // Cleanup effect for performance optimizations
  useEffect(() => {
    return () => {
      // Cancel any active requests when component unmounts or modal closes
      if (currentRequestIdRef.current) {
        PerformanceOptimizationService.cancelRequest(currentRequestIdRef.current);
      }
      
      // Run all cleanup functions
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [isOpen]);

  // Focus management when results change
  useEffect(() => {
    if (state.stage === 'results' && state.results.length > 0) {
      // Initialize result refs array
      resultRefs.current = new Array(state.results.length).fill(null);
    }
  }, [state.stage, state.results.length]);

  // Perform the complete search process with error handling and performance optimizations
  const performSearch = async () => {
    try {
      // Generate unique request ID for this search
      const requestId = `lookout-search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      currentRequestIdRef.current = requestId;
      
      // Stage 1: Generate search query using AI
      setState(prev => ({ ...prev, stage: 'generating-query', error: undefined }));
      
      const queryResponse = await AIQueryGenerationService.generateSearchQuery({
        question,
        highlightedContext: context,
        timeoutMs: 10000
      });

      const searchQuery = queryResponse.searchQuery;
      const fallbackUsed = queryResponse.usedFallback;

      setState(prev => ({ 
        ...prev, 
        searchQuery, 
        stage: 'searching',
        fallbackUsed: fallbackUsed || prev.fallbackUsed
      }));

      // Stage 2: Search DuckDuckGo with caching and request cancellation
      const cacheKey = `${searchQuery}-${context ? 'with-context' : 'no-context'}`;
      
      // Check cache first
      const cachedResults = PerformanceOptimizationService.getCachedSearchResults(cacheKey);
      if (cachedResults && currentRequestIdRef.current === requestId) {
        // Use cached results
        const resultsWithIds = cachedResults.results.map((result: any, index: number) => ({
          ...result,
          id: `${Date.now()}-${index}`,
        }));

        setState(prev => ({
          ...prev,
          stage: 'results',
          results: resultsWithIds,
          fallbackUsed: prev.fallbackUsed || cachedResults.fallbackUsed || false,
          error: cachedResults.error || undefined,
        }));
        return;
      }

      // Create optimized fetch with cancellation
      const { fetch: optimizedFetch, cancel } = PerformanceOptimizationService.createOptimizedFetch(
        requestId,
        cacheKey
      );
      
      // Add cleanup function
      cleanupFunctionsRef.current.push(cancel);

      const searchData = await optimizedFetch('/api/duckduckgo/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          prioritizeVideos: true,
        }),
      });

      // Only update state if this is still the current request
      if (currentRequestIdRef.current === requestId) {
        // Add unique IDs to results
        const resultsWithIds = searchData.results.map((result: any, index: number) => ({
          ...result,
          id: `${Date.now()}-${index}`,
        }));

        setState(prev => ({
          ...prev,
          stage: 'results',
          results: resultsWithIds,
          fallbackUsed: prev.fallbackUsed || searchData.fallbackUsed || false,
          error: searchData.error || undefined,
        }));
      }

    } catch (error) {
      // Only handle error if this is still the current request
      if (currentRequestIdRef.current) {
        handleSearchError(error);
      }
    }
  };

  // Handle search errors with comprehensive error handling
  const handleSearchError = (error: unknown) => {
    const errorContext: ErrorContext = {
      operation: 'component-render',
      originalError: error instanceof Error ? error : String(error),
      userInput: question,
      retryCount: state.retryCount,
      timestamp: Date.now()
    };

    const recovery = ErrorHandlingService.handleError(errorContext);

    setState(prev => ({
      ...prev,
      stage: 'error',
      error: recovery.userMessage,
      userFriendlyError: recovery.userMessage,
      suggestedActions: recovery.suggestedActions,
      retryCount: prev.retryCount + 1,
      isRetrying: false
    }));
  };

  // Retry the search operation
  const retrySearch = async () => {
    setState(prev => ({ ...prev, isRetrying: true }));
    
    // Add a small delay before retrying
    await ErrorHandlingService.createRetryDelay(state.retryCount);
    
    performSearch();
  };

  // Enhanced result click handler with proper link handling for different result types
  const handleResultClick = useCallback((result: SearchResult, event?: React.MouseEvent) => {
    // Prevent default if this is a click event
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Handle different result types appropriately
    const { url, type } = result;
    
    if (typeof window !== 'undefined') {
      try {
        // For videos, articles, and links - open in new tab with security measures
        window.open(url, '_blank', 'noopener,noreferrer');
        
        // Optional: Add analytics or tracking here if needed
        console.log(`Opened ${type} result:`, result.title);
      } catch (error) {
        console.error('Failed to open result:', error);
        // Fallback: try to navigate in same window
        window.location.href = url;
      }
    }
  }, []);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (state.stage !== 'results' || state.results.length === 0) {
      // Handle keyboard navigation in error state
      if (state.stage === 'error') {
        if (event.key === 'Enter' && retryButtonRef.current) {
          event.preventDefault();
          retryButtonRef.current.click();
        } else if (event.key === 'Escape' && closeButtonRef.current) {
          event.preventDefault();
          closeButtonRef.current.click();
        }
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedResultIndex(prev => {
          const nextIndex = prev < state.results.length - 1 ? prev + 1 : 0;
          // Focus the result element
          setTimeout(() => {
            resultRefs.current[nextIndex]?.focus();
          }, 0);
          return nextIndex;
        });
        break;

      case 'ArrowUp':
        event.preventDefault();
        setFocusedResultIndex(prev => {
          const nextIndex = prev > 0 ? prev - 1 : state.results.length - 1;
          // Focus the result element
          setTimeout(() => {
            resultRefs.current[nextIndex]?.focus();
          }, 0);
          return nextIndex;
        });
        break;

      case 'Enter':
        event.preventDefault();
        if (focusedResultIndex >= 0 && focusedResultIndex < state.results.length) {
          handleResultClick(state.results[focusedResultIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        onClose();
        break;

      case 'Home':
        event.preventDefault();
        setFocusedResultIndex(0);
        setTimeout(() => {
          resultRefs.current[0]?.focus();
        }, 0);
        break;

      case 'End':
        event.preventDefault();
        const lastIndex = state.results.length - 1;
        setFocusedResultIndex(lastIndex);
        setTimeout(() => {
          resultRefs.current[lastIndex]?.focus();
        }, 0);
        break;
    }
  }, [state.stage, state.results, focusedResultIndex, handleResultClick, onClose]);

  // Handle result focus
  const handleResultFocus = useCallback((index: number) => {
    setFocusedResultIndex(index);
  }, []);

  // Handle result blur
  const handleResultBlur = useCallback(() => {
    // Small delay to check if focus moved to another result
    setTimeout(() => {
      const activeElement = document.activeElement;
      const isResultFocused = resultRefs.current.some(ref => ref === activeElement);
      if (!isResultFocused) {
        setFocusedResultIndex(-1);
      }
    }, 0);
  }, []);

  const getResultIcon = (type: SearchResult['type'], size: number = 16) => {
    switch (type) {
      case 'video':
        return <HiOutlinePlay className="text-red-500 drop-shadow-sm" size={size} />;
      case 'article':
        return <HiOutlineDocument className="text-blue-500 drop-shadow-sm" size={size} />;
      case 'link':
      default:
        return <HiOutlineGlobeAlt className="text-emerald-500 drop-shadow-sm" size={size} />;
    }
  };

  const getResultTypeLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'video':
        return 'Video';
      case 'article':
        return 'Article';
      case 'link':
      default:
        return 'Link';
    }
  };

  const renderContent = () => {
    switch (state.stage) {
      case 'generating-query':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <FiSearch size={28} className="text-primary animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary/20 rounded-full animate-ping"></div>
            </div>
            <div className="text-center space-y-3 max-w-sm">
              <h3 className="font-semibold text-lg text-base-content">Generating search strategy...</h3>
              <p className="text-sm text-base-content/70 leading-relaxed">
                AI is analyzing your question to create the best search query
              </p>
              {state.retryCount > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-warning/10 border border-warning/20 rounded-full">
                  <FiRefreshCw size={12} className="text-warning" />
                  <span className="text-xs text-warning font-medium">
                    Retry attempt {state.retryCount}
                  </span>
                </div>
              )}
            </div>
            <div className="w-full max-w-xs">
              <div className="h-1.5 bg-base-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full animate-pulse w-1/3 transition-all duration-1000"></div>
              </div>
            </div>
          </div>
        );

      case 'searching':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-success/20 rounded-full flex items-center justify-center">
                <FiGlobe size={12} className="text-success animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-3 max-w-md">
              <h3 className="font-semibold text-lg text-base-content">Searching the web...</h3>
              {state.searchQuery && (
                <div className="text-sm text-base-content/80 bg-base-200/60 border border-base-300/50 px-4 py-3 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <FiSearch size={14} className="text-primary flex-shrink-0" />
                    <span className="font-medium text-primary">Search strategy:</span>
                  </div>
                  <p className="text-left leading-relaxed">{state.searchQuery}</p>
                  {state.fallbackUsed && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-warning/20">
                      <FiAlertCircle size={12} className="text-warning flex-shrink-0" />
                      <span className="text-xs text-warning font-medium">
                        Using fallback search query
                      </span>
                    </div>
                  )}
                </div>
              )}
              {state.retryCount > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-warning/10 border border-warning/20 rounded-full">
                  <FiRefreshCw size={12} className="text-warning" />
                  <span className="text-xs text-warning font-medium">
                    Retry attempt {state.retryCount}
                  </span>
                </div>
              )}
            </div>
            <div className="w-full max-w-xs">
              <div className="h-1.5 bg-base-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary via-primary/80 to-success rounded-full animate-pulse w-2/3 transition-all duration-1000"></div>
              </div>
            </div>
          </div>
        );

      case 'results':
        return (
          <div className="space-y-4">
            {state.searchQuery && (
              <div className="text-sm text-base-content/80 bg-base-200/60 border border-base-300/50 px-4 py-3 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <FiSearch size={14} className="text-primary flex-shrink-0" />
                  <span className="font-medium text-primary">Search strategy:</span>
                </div>
                <p className="leading-relaxed">{state.searchQuery}</p>
                {state.fallbackUsed && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-warning/20">
                    <FiAlertCircle size={12} className="text-warning flex-shrink-0" />
                    <span className="text-xs text-warning font-medium">
                      AI query generation failed - using your original question
                    </span>
                  </div>
                )}
              </div>
            )}

            {state.error && !state.fallbackUsed && (
              <div className="text-sm text-warning bg-warning/10 border border-warning/20 px-4 py-3 rounded-xl flex items-start gap-3 shadow-sm">
                <FiAlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{state.error}</span>
              </div>
            )}
            
            {state.results.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 bg-base-200/50 rounded-full flex items-center justify-center mx-auto">
                  <FiSearch size={24} className="text-base-content/40" />
                </div>
                <div className="space-y-2">
                  <p className="text-base-content/70 font-medium">No results found for your query</p>
                  <p className="text-sm text-base-content/50 max-w-sm mx-auto leading-relaxed">
                    Try rephrasing your question or search manually on your preferred search engine.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    className="btn btn-ghost btn-sm gap-2 hover:scale-105 active:scale-95 transition-all duration-200"
                    onClick={retrySearch}
                  >
                    <FiRefreshCw size={14} />
                    <span>Try Different Query</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-success/10 rounded-full flex items-center justify-center">
                      <FiSearch size={16} className="text-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-base-content">
                        Found {state.results.length} result{state.results.length !== 1 ? 's' : ''}
                      </h3>
                      <p className="text-xs text-base-content/60">
                        Click any result to open in your browser
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-base-content/50 hidden lg:block bg-base-200/50 px-3 py-1.5 rounded-full border border-base-300/50">
                    Use ↑↓ to navigate, Enter to open, Esc to close
                  </div>
                </div>
                <div 
                  className="space-y-2 sm:space-y-3 max-h-80 sm:max-h-96 overflow-y-auto pr-1"
                  ref={resultsContainerRef}
                  onKeyDown={handleKeyDown}
                >
                  {state.results.map((result, index) => (
                    <div
                      key={result.id}
                      ref={el => resultRefs.current[index] = el}
                      className={`
                        group relative border border-base-300/60 rounded-lg sm:rounded-xl p-3 sm:p-4 cursor-pointer 
                        transition-all duration-300 ease-out
                        hover:bg-base-200/40 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5
                        sm:hover:scale-[1.02] sm:hover:-translate-y-0.5
                        focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                        active:scale-[0.98] active:transition-transform active:duration-75
                        ${focusedResultIndex === index ? 'bg-base-200/30 border-primary/50 shadow-md shadow-primary/5' : ''}
                        ${result.type === 'video' ? 'hover:border-red-400/40' : ''}
                        ${result.type === 'article' ? 'hover:border-blue-400/40' : ''}
                        ${result.type === 'link' ? 'hover:border-emerald-400/40' : ''}
                      `}
                      onClick={(e) => handleResultClick(result, e)}
                      onFocus={() => handleResultFocus(index)}
                      onBlur={handleResultBlur}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${getResultTypeLabel(result.type)}: ${result.title} from ${result.source}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleResultClick(result);
                        }
                      }}
                    >
                      {/* Result type indicator */}
                      <div className="absolute top-2 sm:top-3 right-2 sm:right-3 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
                        <div className={`
                          inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium
                          ${result.type === 'video' ? 'bg-red-50 text-red-600 border border-red-200' : ''}
                          ${result.type === 'article' ? 'bg-blue-50 text-blue-600 border border-blue-200' : ''}
                          ${result.type === 'link' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : ''}
                        `}>
                          {getResultIcon(result.type, 10)}
                          <span className="hidden sm:inline">{getResultTypeLabel(result.type)}</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 sm:space-x-4">
                        {result.thumbnail && result.type === 'video' ? (
                          <div className="flex-shrink-0 relative group/thumbnail">
                            <img
                              src={result.thumbnail}
                              alt={`Thumbnail for ${result.title}`}
                              className="w-20 h-14 sm:w-24 sm:h-16 object-cover rounded-lg border border-base-300/60 transition-all duration-200 group-hover:border-red-300/60 shadow-sm"
                              onError={(e) => {
                                // Hide image if it fails to load and show icon instead
                                const img = e.target as HTMLImageElement;
                                img.style.display = 'none';
                                const iconContainer = img.parentElement?.querySelector('.fallback-icon');
                                if (iconContainer) {
                                  (iconContainer as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                            <div 
                              className="fallback-icon absolute inset-0 items-center justify-center bg-red-50 rounded-lg border border-red-200 hidden"
                            >
                              {getResultIcon(result.type, 20)}
                            </div>
                            {/* Play button overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg opacity-0 group-hover/thumbnail:opacity-100 transition-opacity duration-200">
                              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                                <HiOutlinePlay size={14} className="text-red-500 ml-0.5 sm:w-4 sm:h-4" />
                              </div>
                            </div>
                            {result.duration && (
                              <div className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 bg-black/80 text-white text-xs px-1 sm:px-1.5 py-0.5 rounded font-medium">
                                {result.duration}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex-shrink-0 mt-1">
                            <div className={`
                              w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center transition-colors duration-200
                              ${result.type === 'article' ? 'bg-blue-50 group-hover:bg-blue-100' : ''}
                              ${result.type === 'link' ? 'bg-emerald-50 group-hover:bg-emerald-100' : ''}
                            `}>
                              {getResultIcon(result.type, 18)}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0 pr-12 sm:pr-16">
                          <div className="mb-2">
                            <h4 className="font-semibold text-sm sm:text-base leading-tight text-base-content group-hover:text-primary transition-colors duration-200">
                              <span className="block overflow-hidden" style={{ 
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical'
                              }}>
                                {result.title}
                              </span>
                            </h4>
                          </div>
                          
                          {result.description && (
                            <p className="text-xs sm:text-sm text-base-content/70 mb-3 leading-relaxed overflow-hidden" style={{ 
                              display: '-webkit-box',
                              WebkitLineClamp: window.innerWidth < 640 ? 1 : 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {result.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-2 sm:gap-3 text-xs">
                            <div className="flex items-center gap-1.5 text-base-content/60 min-w-0">
                              <FiGlobe size={12} className="flex-shrink-0" />
                              <span className="truncate font-medium">{result.source}</span>
                            </div>
                            {result.duration && !result.thumbnail && (
                              <div className="flex items-center gap-1 text-base-content/50 flex-shrink-0">
                                <FiClock size={12} className="flex-shrink-0" />
                                <span className="font-medium">{result.duration}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                            <FiExternalLink 
                              size={12} 
                              className="text-primary sm:w-3.5 sm:h-3.5" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center border-2 border-error/20">
                <FiAlertCircle size={28} className="text-error" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-error/20 rounded-full animate-pulse"></div>
            </div>
            <div className="text-center space-y-4 max-w-md">
              <div>
                <h3 className="font-semibold text-xl text-error mb-2">Search Failed</h3>
                <p className="text-sm text-base-content/70 leading-relaxed">
                  {state.userFriendlyError || state.error || 'Something went wrong while searching. Please try again.'}
                </p>
              </div>
              {state.suggestedActions && state.suggestedActions.length > 0 && (
                <div className="bg-base-200/50 border border-base-300/50 rounded-xl p-4 text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <FiAlertCircle size={14} className="text-info flex-shrink-0" />
                    <p className="font-semibold text-sm text-info">Suggestions:</p>
                  </div>
                  <ul className="space-y-2 text-xs text-base-content/70">
                    {state.suggestedActions.map((action, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 bg-info/60 rounded-full flex-shrink-0 mt-1.5"></span>
                        <span className="leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                ref={retryButtonRef}
                className={`
                  btn btn-primary btn-sm gap-2 min-w-24 transition-all duration-200
                  ${state.isRetrying ? 'loading' : 'hover:scale-105 active:scale-95'}
                `}
                onClick={retrySearch}
                disabled={state.isRetrying}
                aria-label={state.isRetrying ? 'Retrying search...' : 'Retry search'}
              >
                {state.isRetrying ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>Retrying...</span>
                  </>
                ) : (
                  <>
                    <FiRefreshCw size={14} />
                    <span>Try Again</span>
                  </>
                )}
              </button>
              <button
                ref={closeButtonRef}
                className="btn btn-ghost btn-sm gap-2 hover:scale-105 active:scale-95 transition-all duration-200"
                onClick={onClose}
                aria-label="Close lookout agent"
              >
                <span>Close</span>
              </button>
            </div>
            {state.retryCount > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-base-200/50 border border-base-300/50 rounded-full">
                <FiRefreshCw size={12} className="text-base-content/50" />
                <span className="text-xs text-base-content/60 font-medium">
                  Retry attempts: {state.retryCount}
                </span>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Lookout Agent"
      className="lookout-agent-modal"
      contentClassName="space-y-0"
      boxClassName="lookout-agent-box"
    >
      <div 
        className="min-h-[400px] max-h-[80vh] overflow-hidden"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Question display */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <FiSearch size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Your Question
                </span>
                <div className="h-px bg-primary/20 flex-1"></div>
              </div>
              <div className="text-sm font-medium text-base-content leading-relaxed mb-3">
                {question}
              </div>
              {context && (
                <div className="pt-3 border-t border-primary/15">
                  <div className="flex items-center gap-2 mb-2">
                    <HiOutlineDocument size={12} className="text-primary/70 flex-shrink-0" />
                    <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider">
                      Context from Selection
                    </span>
                  </div>
                  <div className="text-xs text-base-content/70 leading-relaxed bg-white/30 rounded-lg p-3 border border-primary/10 overflow-hidden" style={{ 
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {context}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main content area */}
        {renderContent()}
      </div>
    </Dialog>
  );
};

export default LookoutAgent;