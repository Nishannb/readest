'use client';

import { usePaymentGuard } from '@/hooks/usePaymentGuard';
import { ReactNode } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthorized, isHydrated, isVerifying } = usePaymentGuard();

  // Show loading state while hydrating
  if (!isHydrated) {
    return <LoadingSpinner message="Loading..." />;
  }

  // Show loading state while verifying with server
  if (isVerifying) {
    return <LoadingSpinner message="Verifying access..." />;
  }

  // Show fallback or default loading state if not authorized
  if (!isAuthorized) {
    return fallback || (
      <LoadingSpinner message="Checking access..." />
    );
  }

  return <>{children}</>;
}
