/**
 * Lazy-loaded LookoutAgent component for performance optimization
 * This component is loaded only when needed to reduce initial bundle size
 */

import React, { Suspense } from 'react';
import { LookoutAgentProps } from './LookoutAgent';

// Lazy load the LookoutAgent component
const LookoutAgentComponent = React.lazy(() => import('./LookoutAgent'));

// Loading fallback component
const LookoutAgentLoading: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-base-100 rounded-xl p-8 shadow-2xl max-w-md w-full mx-4">
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <div className="text-center">
          <h3 className="font-semibold text-lg text-base-content">Loading Lookout Agent...</h3>
          <p className="text-sm text-base-content/70 mt-1">
            Preparing your research assistant
          </p>
        </div>
      </div>
    </div>
  </div>
);

// Error boundary for lazy loading
class LookoutAgentErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LookoutAgent lazy loading error:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-base-100 rounded-xl p-8 shadow-2xl max-w-md w-full mx-4">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg text-error">Failed to Load</h3>
                <p className="text-sm text-base-content/70 mt-1">
                  Could not load the Lookout Agent. Please try again.
                </p>
                <button 
                  className="btn btn-primary btn-sm mt-3"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main lazy-loaded component wrapper
const LookoutAgentLazy: React.FC<LookoutAgentProps & { onLoadError?: () => void }> = ({ 
  onLoadError, 
  ...props 
}) => {
  return (
    <LookoutAgentErrorBoundary onError={onLoadError}>
      <Suspense fallback={<LookoutAgentLoading />}>
        <LookoutAgentComponent {...props} />
      </Suspense>
    </LookoutAgentErrorBoundary>
  );
};

export default LookoutAgentLazy;