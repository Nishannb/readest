import clsx from 'clsx';
import i18n from 'i18next';
import React, { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';

import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '../../utils/viewSettingsHelper';
import { TRANSLATED_LANGS } from '@/services/constants';
import { SettingsPanelPanelProp } from './SettingsDialog';
import { useResetViewSettings } from '../../hooks/useResetSettings';
import { saveAndReload } from '@/utils/reload';
import { initDayjs } from '@/utils/time';
import Select from '@/components/Select';

const LangPanel: React.FC<SettingsPanelPanelProp> = ({ bookKey, onRegisterReset }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { getViewSettings, setViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey)!;

  const [uiLanguage, setUILanguage] = useState(viewSettings.uiLanguage!);

  const resetToDefaults = useResetViewSettings();

  const handleReset = () => {
    resetToDefaults({
      uiLanguage: setUILanguage,
    });
  };

  useEffect(() => {
    onRegisterReset(handleReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCurrentUILangOption = () => {
    const uiLanguage = viewSettings.uiLanguage;
    return {
      value: uiLanguage,
      label:
        uiLanguage === ''
          ? _('Auto')
          : TRANSLATED_LANGS[uiLanguage as keyof typeof TRANSLATED_LANGS],
    };
  };

  const getLangOptions = (langs: Record<string, string>) => {
    const options = Object.entries(langs).map(([value, label]) => ({ value, label }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    options.unshift({ value: '', label: _('System Language') });
    return options;
  };

  const handleSelectUILang = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = event.target.value;
    setUILanguage(option);
  };



  useEffect(() => {
    if (uiLanguage === viewSettings.uiLanguage) return;
    saveViewSettings(envConfig, bookKey, 'uiLanguage', uiLanguage, false, false);
    const locale = uiLanguage ? uiLanguage : navigator.language;
    i18n.changeLanguage(locale);
    initDayjs(locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiLanguage]);



  return (
    <div className={clsx('my-4 w-full space-y-6')}>
      <div className='w-full'>
        <h2 className='mb-2 font-medium'>{_('Language')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item'>
              <span className=''>{_('Interface Language')}</span>
              <Select
                value={getCurrentUILangOption().value}
                onChange={handleSelectUILang}
                options={getLangOptions(TRANSLATED_LANGS)}
              />
            </div>
          </div>
        </div>
      </div>


    </div>
  );
};

export default LangPanel;
