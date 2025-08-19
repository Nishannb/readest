'use client';

import { useState } from 'react';
import { usePaymentStore } from '@/store/paymentStore';

export default function FeaturesStep() {
  const { setCurrentStep, setTermsAccepted, termsAccepted } = usePaymentStore();
  const [localTermsAccepted, setLocalTermsAccepted] = useState(false);

  const handleNext = () => {
    if (localTermsAccepted) {
      setTermsAccepted(true);
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-4xl">
        <h2 className="text-4xl font-bold text-gray-900 mb-8">
          Built for Students, by Students
        </h2>
        
        <div className="text-left space-y-6 mb-8 text-lg text-gray-700">
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-blue-600 rounded-full mt-3 flex-shrink-0"></div>
            <p>
              This is built <strong>strictly for students</strong> to study PDF without paying expensive monthly subscription.
            </p>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-blue-600 rounded-full mt-3 flex-shrink-0"></div>
            <p>
              Here you can use your own API Key from{' '}
              <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                Gemini
              </a>
              ,{' '}
              <a href="https://openai.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                Open AI
              </a>
              ,{' '}
              <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                Open Router
              </a>
              {' '}or a self hosted one.
            </p>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-blue-600 rounded-full mt-3 flex-shrink-0"></div>
            <p>
              We strongly recommend you to download{' '}
              <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                Ollama
              </a>
              {' '}to run model locally, you can use it offline as well for free.{' '}
              <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                Open Router
              </a>
              {' '}free models are also free. Go get Open Router API Key.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center space-x-3 mb-8">
          <input
            type="checkbox"
            id="terms"
            checked={localTermsAccepted}
            onChange={(e) => setLocalTermsAccepted(e.target.checked)}
            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="terms" className="text-lg text-gray-700">
            I accept the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
              Terms & Conditions
            </a>
          </label>
        </div>

        <div className="flex items-center justify-center space-x-4">
          <button
            onClick={handleBack}
            className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-4 px-8 rounded-lg text-lg transition-colors duration-200 shadow-lg"
          >
            Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={!localTermsAccepted}
            className={`font-semibold py-4 px-8 rounded-lg text-lg transition-all duration-200 shadow-lg ${
              localTermsAccepted
                ? 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-xl'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
