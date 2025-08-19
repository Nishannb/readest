import { create } from 'zustand';
import { SystemSettings } from '@/types/settings';
import { EnvConfigType } from '@/services/environment';

interface SettingsState {
  settings: SystemSettings;
  isFontLayoutSettingsDialogOpen: boolean;
  isFontLayoutSettingsGlobal: boolean;
  setSettings: (settings: SystemSettings) => void;
  saveSettings: (envConfig: EnvConfigType, settings: SystemSettings) => void;
  setFontLayoutSettingsDialogOpen: (open: boolean) => void;
  setFontLayoutSettingsGlobal: (global: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {} as SystemSettings,
  isFontLayoutSettingsDialogOpen: false,
  isFontLayoutSettingsGlobal: true,
  setSettings: (settings) => set({ settings }),
  saveSettings: async (envConfig: EnvConfigType, settings: SystemSettings) => {
    const appService = await envConfig.getAppService();
    await appService.saveSettings(settings);
  },
  setFontLayoutSettingsDialogOpen: (open) => set({ isFontLayoutSettingsDialogOpen: open }),
  setFontLayoutSettingsGlobal: (global) => set({ isFontLayoutSettingsGlobal: global }),
}));
