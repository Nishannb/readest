'use client';

import { useState, useEffect } from 'react';
import { usePaymentStore } from '@/store/paymentStore';

interface OllamaModel {
  name: string;
  size: string;
  modified_at: string;
}

export default function OllamaSettings() {
  const { 
    ollamaInstalled, 
    selectedOllamaModel, 
    setSelectedOllamaModel 
  } = usePaymentStore();
  
  const [installedModels, setInstalledModels] = useState<OllamaModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState('');

  useEffect(() => {
    if (ollamaInstalled) {
      loadInstalledModels();
    }
  }, [ollamaInstalled]);

  const loadInstalledModels = async () => {
    try {
      setIsLoadingModels(true);
      setOllamaStatus('Loading models...');
      
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
        setOllamaStatus(`Found ${models.length} model(s)`);
        
        // Auto-select first model if no model is currently selected
        if (models.length > 0 && !selectedOllamaModel) {
          setSelectedOllamaModel(models[0].name);
        }
      }
    } catch (error) {
      console.error('Error loading models:', error);
      setInstalledModels([]);
      setOllamaStatus('Error loading models');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleRefresh = () => {
    loadInstalledModels();
  };

  if (!ollamaInstalled) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          Ollama is not installed. You can install it from{' '}
          <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            ollama.ai
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Ollama Settings</h3>
        <button
          onClick={handleRefresh}
          disabled={isLoadingModels}
          className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
        >
          {isLoadingModels ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-2">Status: {ollamaStatus}</p>
        </div>

        {installedModels.length > 0 ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Default Model:
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {installedModels.map((model) => (
                <label key={model.name} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="defaultModel"
                    value={model.name}
                    checked={selectedOllamaModel === model.name}
                    onChange={(e) => setSelectedOllamaModel(e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-gray-900">{model.name}</span>
                    <span className="text-sm text-gray-500 ml-2">({model.size})</span>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              This model will be used as the default for AI interactions.
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500 mb-2">No models installed</p>
            <p className="text-sm text-gray-400">
              Run <code className="bg-gray-100 px-2 py-1 rounded">ollama pull &lt;model_name&gt;</code> to download a model
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Commands:</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center space-x-2">
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">ollama list</code>
              <span className="text-gray-600">- List installed models</span>
            </div>
            <div className="flex items-center space-x-2">
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">ollama pull &lt;model&gt;</code>
              <span className="text-gray-600">- Download a model</span>
            </div>
            <div className="flex items-center space-x-2">
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">ollama run &lt;model&gt;</code>
              <span className="text-gray-600">- Run a model</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
