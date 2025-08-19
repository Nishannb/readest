import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LookoutAgent, { LookoutAgentProps } from '../../app/reader/components/LookoutAgent';

// Mock the Dialog component
vi.mock('@/components/Dialog', () => ({
  default: ({ isOpen, onClose, title, children }: any) => (
    isOpen ? (
      <div data-testid="dialog">
        <div data-testid="dialog-title">{title}</div>
        <button data-testid="close-button" onClick={onClose}>Close</button>
        <div data-testid="dialog-content">{children}</div>
      </div>
    ) : null
  )
}));

const defaultProps: LookoutAgentProps = {
  isOpen: true,
  onClose: vi.fn(),
  question: 'What is quantum computing?',
  context: 'Some highlighted text about quantum mechanics',
  bookKey: 'test-book-key'
};

describe('LookoutAgent', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });
  it('renders when open', () => {
    render(<LookoutAgent {...defaultProps} />);
    
    expect(screen.getByTestId('dialog')).toBeTruthy();
    expect(screen.getByTestId('dialog-title').textContent).toBe('Lookout Agent');
  });

  it('does not render when closed', () => {
    render(<LookoutAgent {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('displays the user question', () => {
    render(<LookoutAgent {...defaultProps} />);
    
    expect(screen.getByText('What is quantum computing?')).toBeTruthy();
  });

  it('displays context when provided', () => {
    render(<LookoutAgent {...defaultProps} />);
    
    expect(screen.getByText('Some highlighted text about quantum mechanics')).toBeTruthy();
  });

  it('shows generating query stage initially', () => {
    render(<LookoutAgent {...defaultProps} />);
    
    expect(screen.getAllByText('Generating search strategy...')[0]).toBeTruthy();
    expect(screen.getAllByText('AI is analyzing your question to create the best search query')[0]).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<LookoutAgent {...defaultProps} onClose={onClose} />);
    
    fireEvent.click(screen.getAllByTestId('close-button')[0]);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets state when modal opens', () => {
    const { rerender } = render(<LookoutAgent {...defaultProps} isOpen={false} />);
    
    // Open the modal
    rerender(<LookoutAgent {...defaultProps} isOpen={true} />);
    
    // Should show initial generating query stage
    expect(screen.getAllByText('Generating search strategy...')[0]).toBeTruthy();
  });

  it('handles missing context gracefully', () => {
    render(<LookoutAgent {...defaultProps} context={undefined} />);
    
    expect(screen.getAllByText('What is quantum computing?')[0]).toBeTruthy();
    expect(screen.queryByText('Context')).toBeNull();
  });
});