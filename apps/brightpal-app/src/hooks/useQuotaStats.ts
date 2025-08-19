import { useEffect, useState } from 'react';
import { QuotaType, UserPlan } from '@/types/user';
import { useTranslation } from './useTranslation';

export const useQuotaStats = (briefName = false) => {
  const _ = useTranslation();
  const [quotas, setQuotas] = useState<QuotaType[]>([]);
  const [userPlan, setUserPlan] = useState<UserPlan | undefined>(undefined);

  useEffect(() => {
    // All users get unlimited quotas without authentication
    const userPlan = 'pro';
    const storageQuota: QuotaType = {
      name: briefName ? _('Storage') : _('Cloud Sync Storage'),
      tooltip: _('Unlimited storage available'),
      used: 0,
      total: Number.MAX_SAFE_INTEGER,
      unit: 'GB',
    };
    const translationQuota: QuotaType = {
      name: briefName ? _('Translation') : _('Translation Characters'),
      tooltip: _('Unlimited daily translations'),
      used: 0,
      total: Number.MAX_SAFE_INTEGER,
      unit: 'K',
    };
    setUserPlan(userPlan);
    setQuotas([storageQuota, translationQuota]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    quotas,
    userPlan,
  };
};
