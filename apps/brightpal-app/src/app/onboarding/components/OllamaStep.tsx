'use client';

import { useState, useEffect } from 'react';
import { usePaymentStore } from '@/store/paymentStore';

interface OllamaModel {
  name: string;
  size: string;
  modified_at: string;
}

export default function OllamaStep() {
  const { 
    setCurrentStep, 
    setOllamaInstalled, 
    setSelectedOllamaModel,
    selectedOllamaModel,
    currentStep 
  } = usePaymentStore();
  const [ollamaDetected, setOllamaDetected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [useWithoutOllama, setUseWithoutOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState('');
  const [installedModels, setInstalledModels] = useState<OllamaModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    checkOllamaInstallation();
  }, []);

  const checkOllamaInstallation = async () => {
    try {
      setIsChecking(true);
      setOllamaStatus('Checking Ollama installation...');
      
      // Check if Ollama is installed and running
      const { invoke } = await import('@tauri-apps/api/core');
      
      try {
        // Try to run 'ollama --version' to check if it's installed
        const result = await invoke('execute_command', {
          command: 'ollama',
          args: ['--version']
        });
        
        if (result && typeof result === 'string' && result.includes('ollama')) {
          setOllamaDetected(true);
          setOllamaStatus('Ollama is installed and working!');
          // Load installed models
          await loadInstalledModels();
        } else {
          setOllamaDetected(false);
          setOllamaStatus('Ollama not found in PATH');
        }
      } catch (error) {
        // If command fails, Ollama is not installed or not in PATH
        setOllamaDetected(false);
        setOllamaStatus('Ollama command not found');
      }
      
      setIsChecking(false);
    } catch (error) {
      console.error('Error checking Ollama:', error);
      setOllamaDetected(false);
      setOllamaStatus('Error checking Ollama installation');
      setIsChecking(false);
    }
  };

  const loadInstalledModels = async () => {
    try {
      setIsLoadingModels(true);
      const { invoke } = await import('@tauri-apps/api/core');
      
      // Get list of installed models
      const result = await invoke('execute_command', {
        command: 'ollama',
        args: ['list']
      });
      
      if (result && typeof result === 'string') {
        // Parse the output to extract model information
        const lines = result.trim().split('\n');
        const models: OllamaModel[] = [];
        
        // Skip header line and parse each model line
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
              models.push({
                name: parts[0],
                size: parts[1],
                modified_at: parts.slice(2).join(' ')
              });
            }
          }
        }
        
        setInstalledModels(models);
        
        // Auto-select first model if available and no model is currently selected
        if (models.length > 0 && !selectedOllamaModel) {
          setSelectedOllamaModel(models[0].name);
        }
      }
    } catch (error) {
      console.error('Error loading models:', error);
      setInstalledModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleNext = () => {
    if (ollamaDetected || useWithoutOllama) {
      setOllamaInstalled(ollamaDetected);
      setCurrentStep(4);
    }
  };

  const handleBack = () => {
    setCurrentStep(2);
  };

  const handleRetry = () => {
    checkOllamaInstallation();
  };

  const canProceed = (ollamaDetected && selectedOllamaModel) || useWithoutOllama;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-4xl">
        <h2 className="text-4xl font-bold text-gray-900 mb-8">
          Did you download Ollama?
        </h2>
        <p className="text-lg text-gray-700 mb-8">We recommend everyone download Ollama as alternative, it's free and easy to use. Works offline too!</p>
        <p className="text-lg text-gray-700 mb-8">
          Download Ollama app & visit{' '}
          <a href="https://ollama.ai/library" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
            Ollama Library
          </a>
          {' '}to download a model. <br/>Easy to download, just run <strong>ollama pull &lt;model_name&gt; </strong>from command prompt.
        </p>
        
        <div className="text-center space-y-6 mb-8 text-lg text-gray-700">
          {isChecking ? (
            <div className="flex items-center justify-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>{ollamaStatus}</span>
            </div>
          ) : ollamaDetected ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-green-800 font-semibold">Ollama detected! You're all set.</span>
                </div>
                
                {/* Model Selection */}
                {installedModels.length > 0 ? (
                  <div className="text-left">
                    <p className="text-green-800 font-medium mb-3">Select your default model:</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {installedModels.map((model) => (
                        <label key={model.name} className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="radio"
                            name="defaultModel"
                            value={model.name}
                            checked={selectedOllamaModel === model.name}
                            onChange={(e) => setSelectedOllamaModel(e.target.value)}
                            className="w-4 h-4 text-green-600 border-green-300 focus:ring-green-500"
                          />
                          <div>
                            <span className="font-medium text-green-800">{model.name}</span>
                            <span className="text-sm text-green-600 ml-2">({model.size})</span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-sm text-green-700 mt-2">
                      This will be your default model until you change it in settings.
                    </p>
                  </div>
                ) : (
                  <div className="text-left">
                    <p className="text-green-800 font-medium mb-3">No models installed yet.</p>
                    <p className="text-sm text-green-700">
                      Run <code className="bg-green-100 px-2 py-1 rounded">ollama pull &lt;model_name&gt;</code> from command prompt to download a model.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <div className="space-y-4">
                <p className="text-yellow-800">
                  <strong>Ollama not detected.</strong> Here's how to get started:
                </p>
                <div className="text-left space-y-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-yellow-600 rounded-full mt-3 flex-shrink-0"></div>
                    <p>
                      Download any of the local models from{' '}
                      <a href="https://ollama.ai/library" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                        Ollama Library
                      </a>
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-yellow-600 rounded-full mt-3 flex-shrink-0"></div>
                    <p>
                      Run <code className="bg-gray-100 px-2 py-1 rounded">ollama run &lt;model_name&gt;</code> from command prompt
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-yellow-600 rounded-full mt-3 flex-shrink-0"></div>
                    <p>
                      Run <code className="bg-gray-100 px-2 py-1 rounded">ollama pull &lt;model_name&gt;</code> from command prompt to download a model
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-yellow-200">
                  <p className="text-sm text-yellow-700 mb-2">Status: {ollamaStatus}</p>
                  <button
                    onClick={handleRetry}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition-colors"
                  >
                    Retry Detection
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!ollamaDetected && !isChecking && (
          <div className="flex items-center justify-center space-x-3 mb-8">
            <input
              type="checkbox"
              id="useWithoutOllama"
              checked={useWithoutOllama}
              onChange={(e) => setUseWithoutOllama(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="useWithoutOllama" className="text-lg text-gray-700">
              I will use it without Ollama
            </label>
          </div>
        )}

        <div className="flex items-center justify-center space-x-4">
          <button
            onClick={handleBack}
            className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-4 px-8 rounded-lg text-lg transition-colors duration-200 shadow-lg"
          >
            Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className={`font-semibold py-4 px-8 rounded-lg text-lg transition-all duration-200 shadow-lg ${
              canProceed
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
