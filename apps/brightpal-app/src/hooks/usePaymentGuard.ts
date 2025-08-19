import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePaymentStore, usePaymentStoreHydrated } from '@/store/paymentStore';

export function usePaymentGuard() {
  const router = useRouter();
  const { hasCompletedOnboarding, hasPaid, verifyPaymentWithServer } = usePaymentStore();
  const isHydrated = usePaymentStoreHydrated();
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!isHydrated) return; // Don't redirect until hydrated

    // If user hasn't completed onboarding or hasn't paid, try server verification
    if (!hasCompletedOnboarding || !hasPaid) {
      // Attempt server verification if we have user info
      const attemptServerVerification = async () => {
        setIsVerifying(true);
        try {
          const verified = await verifyPaymentWithServer();
          if (verified) {
            // User was verified by server, no need to redirect
            return;
          }
        } catch (error) {
          console.error('Server verification failed:', error);
        } finally {
          setIsVerifying(false);
        }
        
        // If server verification failed, redirect to onboarding
        router.replace('/onboarding');
      };

      attemptServerVerification();
    }
  }, [hasCompletedOnboarding, hasPaid, router, isHydrated, verifyPaymentWithServer]);

  return {
    hasCompletedOnboarding,
    hasPaid,
    isAuthorized: isHydrated && hasCompletedOnboarding && hasPaid,
    isHydrated,
    isVerifying,
  };
}
