import { getAPIBaseUrl } from '@/services/environment';
import { fetchWithAuth } from '@/utils/fetch';

const API_ENDPOINT = getAPIBaseUrl() + '/user/delete';

export const deleteUser = async () => {
  try {
    // Local-only app: noop user id
    const userIdForDeletion = 'local-user-id';

    await fetchWithAuth(API_ENDPOINT, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('User deletion failed:', error);
    throw new Error('User deletion failed');
  }
};
