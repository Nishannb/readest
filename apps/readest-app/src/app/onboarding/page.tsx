'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePaymentStore, usePaymentStoreHydrated } from '@/store/paymentStore';
import LoadingSpinner from '@/components/LoadingSpinner';
import WelcomeStep from './components/WelcomeStep';
import FeaturesStep from './components/FeaturesStep';
import OllamaStep from './components/OllamaStep';
import PaymentStep from './components/PaymentStep';

export default function OnboardingPage() {
  const router = useRouter();
  const { hasCompletedOnboarding, hasPaid, currentStep, setCurrentStep, resetOnboarding } = usePaymentStore();
  const isHydrated = usePaymentStoreHydrated();

  useEffect(() => {
    if (!isHydrated) return; // Don't redirect until hydrated

    // If user has already completed onboarding and paid, redirect to main app
    if (hasCompletedOnboarding && hasPaid) {
      router.replace('/library');
    }
  }, [hasCompletedOnboarding, hasPaid, router, isHydrated]);

  // Show loading state while checking payment status
  if (!isHydrated) {
    return <LoadingSpinner message="Checking access..." />;
  }

  // If user has already paid, don't render onboarding content
  if (hasCompletedOnboarding && hasPaid) {
    return null;
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <WelcomeStep />;
      case 2:
        return <FeaturesStep />;
      case 3:
        return <OllamaStep />;
      case 4:
        return <PaymentStep />;
      default:
        return <WelcomeStep />;
    }
  };

  const steps = [
    { number: 1, title: 'Welcome', description: 'Get started' },
    { number: 2, title: 'Features', description: 'Learn about the app' },
    { number: 3, title: 'Ollama', description: 'Check installation' },
    { number: 4, title: 'Payment', description: 'Complete purchase' },
  ];

  const handleStepClick = (stepNumber: number) => {
    if (stepNumber < currentStep) {
      setCurrentStep(stepNumber);
    }
  };

  const handleReset = () => {
    resetOnboarding();
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Step Indicator */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              {steps.map((step) => (
                <button
                  key={step.number}
                  onClick={() => handleStepClick(step.number)}
                  disabled={step.number > currentStep}
                  className={`flex items-center space-x-3 transition-colors ${
                    step.number < currentStep
                      ? 'text-green-600 cursor-pointer hover:text-green-700'
                      : step.number === currentStep
                      ? 'text-blue-600'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      step.number < currentStep
                        ? 'bg-green-100 text-green-600'
                        : step.number === currentStep
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {step.number < currentStep ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      step.number
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-sm font-medium">{step.title}</div>
                    <div className="text-xs text-gray-500">{step.description}</div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Progress Text */}
              <div className="text-sm text-gray-600">
                Step {currentStep} of {steps.length}
              </div>
              
              {/* Reset Button */}
              <button
                onClick={handleReset}
                className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                title="Reset onboarding (for testing)"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1">
        {renderCurrentStep()}
      </div>
    </div>
  );
}
