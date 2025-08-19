import { invoke } from '@tauri-apps/api/core';
import { isTauriAppPlatform } from '@/services/environment';

const LAMBDA_API_URL = "https://sclbiwke3f.execute-api.ap-northeast-1.amazonaws.com/default/brightpal_payment";

interface PaymentRequestData {
  userId: string;
  email: string;
  appVersion: string;
  platform: string;
  appDomain?: string; // For checkout session, if needed
  deviceId?: string;
  stripeCustomerId?: string;
}

interface PaymentIntentResponse {
  success: boolean;
  client_secret?: string;
  payment_intent_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  error?: string;
  error_type?: string;
}

interface VerifyPaymentResponse {
  success: boolean;
  verified?: boolean;
  amount?: number;
  currency?: string;
  customer_email?: string;
  metadata?: Record<string, any>;
  status?: string;
  error?: string;
  error_type?: string;
}

interface CheckPaymentStatusResponse {
  success: boolean;
  hasPaid?: boolean;
  amount?: number;
  currency?: string;
  customer_email?: string;
  payment_date?: string;
  device_verified?: boolean;
  error?: string;
  error_type?: string;
}

export function usePaymentService() {
  const callLambda = async <T>(action: string, data: any): Promise<T> => {
    // Convert camelCase to snake_case for Lambda compatibility
    const convertedData = {
      ...data,
      app_version: data.appVersion,
      user_id: data.userId,
      stripe_customer_id: data.stripeCustomerId,
    };
    
    const body = JSON.stringify({ action, data: convertedData });
    let result: unknown;

    if (isTauriAppPlatform()) {
      // Use Tauri's HTTP plugin for desktop apps
      const { fetch } = await import('@tauri-apps/plugin-http');
      const response = await fetch(LAMBDA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });
      if (!(response as any).ok) {
        const status = (response as any).status ?? 'unknown';
        throw new Error(`HTTP error! status: ${status}`);
      }
      // Prefer .json() when available
      if (typeof (response as any).json === 'function') {
        try {
          result = await (response as any).json();
        } catch {
          // Fallback to text
          result = await (response as any).text();
          if (typeof result === 'string') {
            try { result = JSON.parse(result); } catch { /* ignore */ }
          }
        }
      } else {
        // Fallback to data/text
        result = (response as any).data ?? (await (response as any).text?.());
        if (typeof result === 'string') {
          try { result = JSON.parse(result); } catch { /* ignore */ }
        }
      }
    } else {
      // Use standard fetch for web/development
      const response = await fetch(LAMBDA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      } as RequestInit);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      result = await response.json();
    }

    return result as T;
  };

  const createPaymentIntent = async (data: PaymentRequestData): Promise<PaymentIntentResponse> => {
    return callLambda<PaymentIntentResponse>('create_payment_intent', data);
  };

  const verifyPayment = async (paymentIntentId: string): Promise<VerifyPaymentResponse> => {
    return callLambda<VerifyPaymentResponse>('verify_payment', { payment_intent_id: paymentIntentId });
  };

  const checkPaymentStatus = async (data: PaymentRequestData): Promise<CheckPaymentStatusResponse> => {
    return callLambda<CheckPaymentStatusResponse>('check_payment_status', data);
  };

  const recoverAccess = async (data: PaymentRequestData): Promise<CheckPaymentStatusResponse> => {
    return callLambda<CheckPaymentStatusResponse>('check_payment_status', data);
  };

  return {
    createPaymentIntent,
    verifyPayment,
    checkPaymentStatus,
    recoverAccess,
  };
}
