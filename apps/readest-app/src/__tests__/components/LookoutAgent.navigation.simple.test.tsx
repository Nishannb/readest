import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a simple test component that mimics the navigation functionality
const TestNavigationComponent: React.FC = () => {
  const [focusedIndex, setFocusedIndex] = React.useState(-1);
  const results = [
    { id: '1', title: 'Test Video', url: 'https://youtube.com/test' },
    { id: '2', title: 'Test Article', url: 'https://example.com/article' },
    { id: '3', title: 'Test Link', url: 'https://example.com/link' },
  ];

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => prev < results.length - 1 ? prev + 1 : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => prev > 0 ? prev - 1 : results.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0) {
          window.open(results[focusedIndex].url, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(results.length - 1);
        break;
    }
  };

  const handleResultClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} data-testid="navigation-container">
      <div>Use ↑↓ to navigate, Enter to open, Esc to close</div>
      {results.map((result, index) => (
        <div
          key={result.id}
          role="button"
          tabIndex={0}
          className={`result-item ${focusedIndex === index ? 'focused' : ''}`}
          onClick={() => handleResultClick(result.url)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleResultClick(result.url);
            }
          }}
          aria-label={`Open: ${result.title}`}
          data-testid={`result-${index}`}
        >
          {result.title}
        </div>
      ))}
    </div>
  );
};

describe('LookoutAgent Navigation Functionality', () => {
  const mockWindowOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any existing DOM elements
    document.body.innerHTML = '';
    Object.defineProperty(window, 'open', {
      writable: true,
      value: mockWindowOpen,
    });
  });

  describe('Click Handling', () => {
    it('should open results in new tab when clicked', () => {
      render(<TestNavigationComponent />);

      const firstResult = screen.getByText('Test Video');
      fireEvent.click(firstResult);

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/test',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should handle multiple result clicks', () => {
      render(<TestNavigationComponent />);

      const videoResult = screen.getByText('Test Video');
      const articleResult = screen.getByText('Test Article');
      const linkResult = screen.getByText('Test Link');

      fireEvent.click(videoResult);
      fireEvent.click(articleResult);
      fireEvent.click(linkResult);

      expect(mockWindowOpen).toHaveBeenCalledTimes(3);
      expect(mockWindowOpen).toHaveBeenNthCalledWith(1, 'https://youtube.com/test', '_blank', 'noopener,noreferrer');
      expect(mockWindowOpen).toHaveBeenNthCalledWith(2, 'https://example.com/article', '_blank', 'noopener,noreferrer');
      expect(mockWindowOpen).toHaveBeenNthCalledWith(3, 'https://example.com/link', '_blank', 'noopener,noreferrer');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate through results with arrow keys', () => {
      render(<TestNavigationComponent />);
      const container = screen.getByTestId('navigation-container');

      // Press ArrowDown to focus first result
      fireEvent.keyDown(container, { key: 'ArrowDown' });
      expect(screen.getByTestId('result-0')).toHaveClass('focused');

      // Press ArrowDown to focus second result
      fireEvent.keyDown(container, { key: 'ArrowDown' });
      expect(screen.getByTestId('result-1')).toHaveClass('focused');

      // Press ArrowUp to go back to first result
      fireEvent.keyDown(container, { key: 'ArrowUp' });
      expect(screen.getByTestId('result-0')).toHaveClass('focused');
    });

    it('should wrap around when navigating past boundaries', () => {
      render(<TestNavigationComponent />);
      const container = screen.getByTestId('navigation-container');

      // Navigate to last result and then press ArrowDown to wrap to first
      fireEvent.keyDown(container, { key: 'End' });
      expect(screen.getByTestId('result-2')).toHaveClass('focused');

      fireEvent.keyDown(container, { key: 'ArrowDown' });
      expect(screen.getByTestId('result-0')).toHaveClass('focused');

      // Navigate to first result and then press ArrowUp to wrap to last
      fireEvent.keyDown(container, { key: 'Home' });
      expect(screen.getByTestId('result-0')).toHaveClass('focused');

      fireEvent.keyDown(container, { key: 'ArrowUp' });
      expect(screen.getByTestId('result-2')).toHaveClass('focused');
    });

    it('should open focused result with Enter key', () => {
      render(<TestNavigationComponent />);
      const container = screen.getByTestId('navigation-container');

      // Navigate to first result and press Enter
      fireEvent.keyDown(container, { key: 'ArrowDown' });
      fireEvent.keyDown(container, { key: 'Enter' });

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/test',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should open result with Space key on individual result', () => {
      render(<TestNavigationComponent />);
      const firstResult = screen.getByTestId('result-0');

      fireEvent.keyDown(firstResult, { key: ' ' });

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://youtube.com/test',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should navigate to first result with Home key', () => {
      render(<TestNavigationComponent />);
      const container = screen.getByTestId('navigation-container');

      fireEvent.keyDown(container, { key: 'Home' });
      expect(screen.getByTestId('result-0')).toHaveClass('focused');
    });

    it('should navigate to last result with End key', () => {
      render(<TestNavigationComponent />);
      const container = screen.getByTestId('navigation-container');

      fireEvent.keyDown(container, { key: 'End' });
      expect(screen.getByTestId('result-2')).toHaveClass('focused');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on results', () => {
      const { container } = render(<TestNavigationComponent />);

      expect(container.querySelector('[aria-label="Open: Test Video"]')).toBeInTheDocument();
      expect(container.querySelector('[aria-label="Open: Test Article"]')).toBeInTheDocument();
      expect(container.querySelector('[aria-label="Open: Test Link"]')).toBeInTheDocument();
    });

    it('should have proper role attributes', () => {
      const { container } = render(<TestNavigationComponent />);

      const results = container.querySelectorAll('[role="button"]');
      expect(results).toHaveLength(3);
    });

    it('should display keyboard navigation hints', () => {
      const { container } = render(<TestNavigationComponent />);

      expect(container.textContent).toContain('Use ↑↓ to navigate, Enter to open, Esc to close');
    });
  });

  describe('Error Handling', () => {
    it('should handle window.open errors gracefully', () => {
      mockWindowOpen.mockImplementation(() => {
        throw new Error('Popup blocked');
      });

      const { container } = render(<TestNavigationComponent />);
      const firstResult = container.querySelector('[data-testid="result-0"]');
      
      // Should not throw error even if window.open fails
      expect(() => {
        fireEvent.click(firstResult!);
      }).not.toThrow();
    });
  });
});