import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import LookoutAgent, { SearchResult } from '../../app/reader/components/LookoutAgent';

// Mock the services
vi.mock('../../app/reader/services/aiQueryGenerationService', () => ({
  AIQueryGenerationService: {
    generateSearchQuery: vi.fn(),
  },
}));

vi.mock('../../app/reader/services/errorHandlingService', () => ({
  ErrorHandlingService: {
    handleError: vi.fn(),
    createRetryDelay: vi.fn(),
  },
}));

// Mock Dialog component
vi.mock('@/components/Dialog', () => ({
  default: ({ children, isOpen, onClose, title }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="dialog" role="dialog" aria-label={title}>
        <button onClick={onClose} data-testid="dialog-close">Close</button>
        {children}
      </div>
    );
  },
}));

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen,
});

// Mock fetch
global.fetch = vi.fn();

const mockResults: SearchResult[] = [
  {
    id: '1',
    type: 'video',
    title: 'Test Video',
    description: 'A test video description',
    url: 'https://youtube.com/watch?v=test',
    source: 'YouTube',
    thumbnail: 'https://img.youtube.com/vi/test/default.jpg',
    duration: '5:30',
  },
  {
    id: '2',
    type: 'article',
    title: 'Test Article',
    description: 'A test article description',
    url: 'https://example.com/article',
    source: 'Example.com',
  },
  {
    id: '3',
    type: 'link',
    title: 'Test Link',
    description: 'A test link description',
    url: 'https://example.com/link',
    source: 'Example.com',
  },
];

describe('LookoutAgent Navigation and Interaction', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    question: 'What is quantum computing?',
    context: 'quantum mechanics',
    bookKey: 'test-book',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowOpen.mockClear();
    
    // Mock successful AI query generation
    const { AIQueryGenerationService } = require('../../app/reader/services/aiQueryGenerationService');
    AIQueryGenerationService.generateSearchQuery.mockResolvedValue({
      searchQuery: 'quantum computing explained',
      usedFallback: false,
    });

    // Mock successful search results
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        results: mockResults,
        searchQuery: 'quantum computing explained',
      }),
    });
  });

  describe('Result Click Handling', () => {
    it('should open video results in new tab when clicked', async () => {
      render(<LookoutAgent {...defaultProps} />);

      // Wait for results to load
      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      // Click on video result
      const videoResult = screen.getByText('Test Video').closest('[role="button"]');
      fireEvent.click(videoResult!);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=test',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should open article results in new tab when clicked', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Article')).toBeInTheDocument();
      });

      const articleResult = screen.getByText('Test Article').closest('[role="button"]');
      fireEvent.click(articleResult!);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://example.com/article',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should open link results in new tab when clicked', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Link')).toBeInTheDocument();
      });

      const linkResult = screen.getByText('Test Link').closest('[role="button"]');
      fireEvent.click(linkResult!);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://example.com/link',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should handle window.open errors gracefully', async () => {
      mockWindowOpen.mockImplementation(() => {
        throw new Error('Popup blocked');
      });

      // Mock window.location.href
      delete (window as any).location;
      window.location = { href: '' } as any;

      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const videoResult = screen.getByText('Test Video').closest('[role="button"]');
      fireEvent.click(videoResult!);

      // Should fallback to window.location.href
      expect(window.location.href).toBe('https://youtube.com/watch?v=test');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate through results with arrow keys', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const resultsContainer = screen.getByText('Test Video').closest('[role="button"]')?.parentElement;
      
      // Focus the results container
      resultsContainer?.focus();

      // Press ArrowDown to focus first result
      fireEvent.keyDown(resultsContainer!, { key: 'ArrowDown' });
      
      const firstResult = screen.getByText('Test Video').closest('[role="button"]');
      expect(firstResult).toHaveFocus();

      // Press ArrowDown to focus second result
      fireEvent.keyDown(resultsContainer!, { key: 'ArrowDown' });
      
      const secondResult = screen.getByText('Test Article').closest('[role="button"]');
      expect(secondResult).toHaveFocus();

      // Press ArrowUp to go back to first result
      fireEvent.keyDown(resultsContainer!, { key: 'ArrowUp' });
      expect(firstResult).toHaveFocus();
    });

    it('should open focused result with Enter key', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const resultsContainer = screen.getByText('Test Video').closest('[role="button"]')?.parentElement;
      resultsContainer?.focus();

      // Navigate to first result and press Enter
      fireEvent.keyDown(resultsContainer!, { key: 'ArrowDown' });
      fireEvent.keyDown(resultsContainer!, { key: 'Enter' });

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=test',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should open focused result with Space key', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const firstResult = screen.getByText('Test Video').closest('[role="button"]');
      firstResult?.focus();

      fireEvent.keyDown(firstResult!, { key: ' ' });

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=test',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should close modal with Escape key', async () => {
      const onClose = vi.fn();
      render(<LookoutAgent {...defaultProps} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const resultsContainer = screen.getByText('Test Video').closest('[role="button"]')?.parentElement;
      fireEvent.keyDown(resultsContainer!, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('should navigate to first result with Home key', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const resultsContainer = screen.getByText('Test Video').closest('[role="button"]')?.parentElement;
      resultsContainer?.focus();

      // Navigate to last result first
      fireEvent.keyDown(resultsContainer!, { key: 'End' });
      const lastResult = screen.getByText('Test Link').closest('[role="button"]');
      expect(lastResult).toHaveFocus();

      // Then navigate to first result with Home
      fireEvent.keyDown(resultsContainer!, { key: 'Home' });
      const firstResult = screen.getByText('Test Video').closest('[role="button"]');
      expect(firstResult).toHaveFocus();
    });

    it('should navigate to last result with End key', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const resultsContainer = screen.getByText('Test Video').closest('[role="button"]')?.parentElement;
      resultsContainer?.focus();

      fireEvent.keyDown(resultsContainer!, { key: 'End' });
      const lastResult = screen.getByText('Test Link').closest('[role="button"]');
      expect(lastResult).toHaveFocus();
    });
  });

  describe('Visual Feedback', () => {
    it('should show hover states on results', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const videoResult = screen.getByText('Test Video').closest('[role="button"]');
      
      // Hover over result
      fireEvent.mouseEnter(videoResult!);
      
      // Check if hover classes are applied (this would need to be checked via computed styles in a real browser)
      expect(videoResult).toHaveClass('hover:bg-base-200/50');
    });

    it('should show focus states on results', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const videoResult = screen.getByText('Test Video').closest('[role="button"]');
      videoResult?.focus();

      expect(videoResult).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-primary/50');
    });

    it('should display keyboard navigation hints', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Use ↑↓ to navigate, Enter to open, Esc to close')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on results', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const videoResult = screen.getByLabelText('Open video: Test Video from YouTube');
      expect(videoResult).toBeInTheDocument();

      const articleResult = screen.getByLabelText('Open article: Test Article from Example.com');
      expect(articleResult).toBeInTheDocument();

      const linkResult = screen.getByLabelText('Open link: Test Link from Example.com');
      expect(linkResult).toBeInTheDocument();
    });

    it('should have proper role attributes', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      const results = screen.getAllByRole('button');
      expect(results).toHaveLength(3); // Three search results
    });

    it('should be keyboard accessible', async () => {
      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      // Tab through results
      const firstResult = screen.getByText('Test Video').closest('[role="button"]');
      firstResult?.focus();
      expect(firstResult).toHaveFocus();

      const secondResult = screen.getByText('Test Article').closest('[role="button"]');
      secondResult?.focus();
      expect(secondResult).toHaveFocus();
    });
  });

  describe('Error State Navigation', () => {
    it('should handle keyboard navigation in error state', async () => {
      const onClose = vi.fn();

      // Mock error response
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const { ErrorHandlingService } = require('../../app/reader/services/errorHandlingService');
      ErrorHandlingService.handleError.mockReturnValue({
        userMessage: 'Network error occurred',
        suggestedActions: ['Check your internet connection'],
      });

      render(<LookoutAgent {...defaultProps} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Search Failed')).toBeInTheDocument();
      });

      // Test Escape key in error state
      const errorContainer = screen.getByText('Search Failed').closest('div');
      fireEvent.keyDown(errorContainer!, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('should handle Enter key on retry button in error state', async () => {
      // Mock error response first, then success
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            results: mockResults,
            searchQuery: 'quantum computing explained',
          }),
        });

      const { ErrorHandlingService } = require('../../app/reader/services/errorHandlingService');
      ErrorHandlingService.handleError.mockReturnValue({
        userMessage: 'Network error occurred',
        suggestedActions: ['Check your internet connection'],
      });
      ErrorHandlingService.createRetryDelay.mockResolvedValue(undefined);

      render(<LookoutAgent {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Search Failed')).toBeInTheDocument();
      });

      // Press Enter to retry
      const errorContainer = screen.getByText('Search Failed').closest('div');
      fireEvent.keyDown(errorContainer!, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });
    });
  });
});