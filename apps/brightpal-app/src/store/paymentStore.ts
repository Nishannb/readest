import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PaymentState {
  hasCompletedOnboarding: boolean;
  hasPaid: boolean;
  currentStep: number;
  ollamaInstalled: boolean;
  termsAccepted: boolean;
  selectedOllamaModel: string;
  _hasHydrated: boolean; // Internal hydration flag
  userId: string; // Add user identifier for server verification
  email: string; // Add email for server verification
  deviceId: string; // Hardware-tied fingerprint
  stripeCustomerId?: string; // Stripe customer id if available
  setHasCompletedOnboarding: (completed: boolean) => void;
  setHasPaid: (paid: boolean) => void;
  setCurrentStep: (step: number) => void;
  setOllamaInstalled: (installed: boolean) => void;
  setTermsAccepted: (accepted: boolean) => void;
  setSelectedOllamaModel: (model: string) => void;
  setUserInfo: (userId: string, email: string, stripeCustomerId?: string) => void;
  setDeviceId: (deviceId: string) => void;
  resetOnboarding: () => void;
  setHasHydrated: (hydrated: boolean) => void;
  verifyPaymentWithServer: () => Promise<boolean>; // New method for server verification
  nuclearReset: () => void;
}

export const usePaymentStore = create<PaymentState>()(
  persist(
    (set, get) => ({
      hasCompletedOnboarding: false,
      hasPaid: false,
      currentStep: 1,
      ollamaInstalled: false,
      termsAccepted: false,
      selectedOllamaModel: '',
      _hasHydrated: false,
      userId: '',
      email: '',
      deviceId: '',
      stripeCustomerId: undefined,
      setHasCompletedOnboarding: (completed) => set({ hasCompletedOnboarding: completed }),
      setHasPaid: (paid) => set({ hasPaid: paid }),
      setCurrentStep: (step) => set({ currentStep: step }),
      setOllamaInstalled: (installed) => set({ ollamaInstalled: installed }),
      setTermsAccepted: (accepted) => set({ termsAccepted: accepted }),
      setSelectedOllamaModel: (model) => set({ selectedOllamaModel: model }),
      setUserInfo: (userId, email, stripeCustomerId) => set({ userId, email, stripeCustomerId }),
      setDeviceId: (deviceId) => set({ deviceId }),
      resetOnboarding: () => set({ 
        hasCompletedOnboarding: false, 
        hasPaid: false, 
        currentStep: 1,
        ollamaInstalled: false,
        termsAccepted: false,
        selectedOllamaModel: '',
        userId: '',
        email: '',
        deviceId: '',
        stripeCustomerId: undefined
      }),
      nuclearReset: () => {
        // Clear everything including localStorage
        localStorage.removeItem('payment-storage');
        set({ 
          hasCompletedOnboarding: false, 
          hasPaid: false, 
          currentStep: 1,
          ollamaInstalled: false,
          termsAccepted: false,
          selectedOllamaModel: '',
          userId: '',
          email: '',
          deviceId: '',
          stripeCustomerId: undefined,
          _hasHydrated: false
        });
        // Force reload to ensure clean state
        window.location.reload();
      },
      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
      verifyPaymentWithServer: async () => {
        const state = get();
        if (!state.userId || !state.email) {
          return false; // Can't verify without user info
        }

        try {
          // Import the payment service dynamically to avoid circular dependencies
          const { usePaymentService } = await import('@/services/payment');
          const paymentService = usePaymentService();
          
          // Call your Lambda to check if this user has paid
          // You'll need to add a new endpoint to your Lambda for this
          const response = await paymentService.checkPaymentStatus({
            userId: state.userId,
            email: state.email,
            deviceId: state.deviceId,
            stripeCustomerId: state.stripeCustomerId,
            appVersion: '0.9.71', // Get this from your app config
            platform: 'desktop',
          });

          if (response.success && response.hasPaid) {
            // User has paid, restore their access
            set({ 
              hasPaid: true, 
              hasCompletedOnboarding: true 
            });
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('Failed to verify payment with server:', error);
          return false; // Fail safely - don't grant access if verification fails
        }
      },
    }),
    {
      name: 'payment-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // Set hydration flag when store is rehydrated
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// Helper hook to check if store is hydrated
export const usePaymentStoreHydrated = () => {
  const { _hasHydrated } = usePaymentStore();
  return _hasHydrated;
};

// Helper hook to get user info
export const useUserInfo = () => {
  const { userId, email } = usePaymentStore();
  return { userId, email };
};
