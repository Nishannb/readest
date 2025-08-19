'use client';

import { usePaymentStore } from '@/store/paymentStore';

export default function WelcomeStep() {
  const { setCurrentStep } = usePaymentStore();

  const handleNext = () => {
    setCurrentStep(2);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-6xl font-bold text-gray-900 mb-6">
          Welcome
        </h1>
        <p className="text-xl text-gray-600 mb-12 leading-relaxed">
          Discover the future of intelligent reading and learning. 
          Transform your study sessions with AI-powered insights and 
          seamless PDF analysis that adapts to your learning style.
        </p>
        <button
          onClick={handleNext}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg text-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
        >
          Next
        </button>
      </div>
    </div>
  );
}
