import { getAPIBaseUrl } from '@/services/environment';
import { stubTranslation as _ } from '@/utils/misc';
import { TranslationProvider } from '../types';
import { UserPlan } from '@/types/user';
import { normalizeToShortLang } from '@/utils/lang';

const DEEPL_API_ENDPOINT = getAPIBaseUrl() + '/deepl/translate';

export const deeplProvider: TranslationProvider = {
  name: 'deepl',
  label: _('DeepL'),
  authRequired: false,
  quotaExceeded: false,
  translate: async (
    text: string[],
    sourceLang: string,
    targetLang: string,
    token?: string | null,
    useCache: boolean = false,
  ): Promise<string[]> => {


    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // No authentication required - all users get pro plan benefits
    const userPlan: UserPlan = 'pro';

    // Authentication no longer required - all users can access DeepL

    const body = JSON.stringify({
      text: text,
      source_lang: normalizeToShortLang(sourceLang).toUpperCase(),
      target_lang: normalizeToShortLang(targetLang).toUpperCase(),
      use_cache: useCache,
    });

    // No quota enforcement - unlimited translations for all users
    try {
      const response = await fetch(DEEPL_API_ENDPOINT, { method: 'POST', headers, body });

      if (!response.ok) {
        const data = await response.json();
            // No quota enforcement - all errors are treated the same
        throw new Error(`Translation failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.translations) {
        throw new Error('Invalid response from translation service');
      }

      return text.map((line, i) => {
        if (!line?.trim().length) {
          return line;
        }
        const translation = data.translations?.[i];
        // No quota tracking needed
        return translation?.text || line;
      });
    } catch (error) {
      throw error;
    }
  },
};
