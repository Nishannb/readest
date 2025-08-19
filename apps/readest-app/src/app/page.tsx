'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePaymentStore, usePaymentStoreHydrated } from '@/store/paymentStore';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function HomePage() {
  const router = useRouter();
  const { hasCompletedOnboarding, hasPaid } = usePaymentStore();
  const isHydrated = usePaymentStoreHydrated();

  useEffect(() => {
    if (!isHydrated) return; // Don't redirect until hydrated

    // If user hasn't completed onboarding or hasn't paid, redirect to onboarding
    if (!hasCompletedOnboarding || !hasPaid) {
      router.replace('/onboarding');
    } else {
      // User has completed onboarding and paid, redirect to main app
      router.replace('/library');
    }
  }, [hasCompletedOnboarding, hasPaid, router, isHydrated]);

  // Show loading state while hydrating
  if (!isHydrated) {
    return <LoadingSpinner message="Loading..." />;
  }

  return null;
}
