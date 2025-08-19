'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePaymentStore } from '@/store/paymentStore';
import { getHardwareFingerprint } from '@/utils/hardware';
import { usePaymentService } from '@/services/payment';
import StripeElementsModal from '@/components/StripeElementsModal';

export default function PaymentStep() {
  const router = useRouter();
  const { setHasPaid, setHasCompletedOnboarding, setCurrentStep, setUserInfo } = usePaymentStore();
  const paymentService = usePaymentService();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  const handlePaymentSuccess = async () => {
    if (!paymentIntentId) {
      setPaymentError('Payment verification failed: No Payment Intent ID.');
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

    try {
      const verificationResult = await paymentService.verifyPayment(paymentIntentId);
      if (verificationResult.success && verificationResult.verified) {
        // Generate or retrieve device fingerprint
        const deviceId = await getHardwareFingerprint();
        // Store user information for future verification
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const email = verificationResult.customer_email || 'user@brightpal.local';
        const stripeCustomerId = (verificationResult as any).customer_id || undefined;
        
        setUserInfo(userId, email, stripeCustomerId);
        // Persist device id as well
        usePaymentStore.getState().setDeviceId(deviceId);
        setHasPaid(true);
        setHasCompletedOnboarding(true);
        router.replace('/library');
      } else {
        setPaymentError(verificationResult.error || 'Payment verification failed.');
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      setPaymentError('Payment verification failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    setPaymentError('');

    try {
      const deviceId = await getHardwareFingerprint();
      usePaymentStore.getState().setDeviceId(deviceId);
      
      console.log('Creating payment intent with:', {
        userId: 'local-user-id',
        email: 'user@brightpal.local',
        appVersion: '0.9.71',
        platform: 'desktop',
        deviceId,
      });

      const result = await paymentService.createPaymentIntent({
        userId: 'local-user-id', // Replace with actual
        email: 'user@brightpal.local', // Replace with actual
        appVersion: '0.9.71', // Replace with actual app version
        platform: 'desktop',
        deviceId,
      });

      console.log('Payment intent result:', result);

      if (result && result.success && result.client_secret) {
        setClientSecret(result.client_secret);
        setPaymentIntentId(result.payment_intent_id || null);
        setShowStripeModal(true);
      } else {
        const errorMsg = result?.error || 'Failed to initiate payment.';
        console.error('Payment failed:', errorMsg);
        setPaymentError(errorMsg);
      }
    } catch (error) {
      console.error('Payment initiation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setPaymentError(`Payment error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    setCurrentStep(3);
  };

  const handleDevBypass = () => {
    // Store user information even for dev bypass
    const userId = `dev_user_${Date.now()}`;
    const email = 'dev@brightpal.local';
    getHardwareFingerprint().then((deviceId) => usePaymentStore.getState().setDeviceId(deviceId));
    
    setUserInfo(userId, email);
    setHasPaid(true);
    setHasCompletedOnboarding(true);
    router.replace('/library');
  };

  const handleRecoverAccess = async () => {
    setIsProcessing(true);
    setPaymentError('');

    try {
      const deviceId = await getHardwareFingerprint();
      usePaymentStore.getState().setDeviceId(deviceId);

      const result = await paymentService.recoverAccess({
        userId: 'local-user-id', // Replace with actual
        email: 'user@brightpal.local', // Replace with actual
        appVersion: '0.9.71', // Replace with actual app version
        platform: 'desktop',
        deviceId,
      });

      if (result && result.success) {
        setHasPaid(true);
        setHasCompletedOnboarding(true);
        router.replace('/library');
      } else {
        setPaymentError(result?.error || 'Failed to recover access.');
      }
    } catch (error) {
      console.error('Error recovering access:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setPaymentError(`Recovery error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Get Lifetime Access
        </h1>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-green-800 mb-4">
            One-Time Payment of $10
          </h2>
          
          <div className="space-y-4 text-left">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-600 rounded-full mt-3 flex-shrink-0"></div>
              <p className="text-green-800">
                <span className="font-semibold">Lifetime access</span> - No monthly fees, no recurring charges
              </p>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-600 rounded-full mt-3 flex-shrink-0"></div>
              <p className="text-green-800">
                <span className="font-semibold">1000x more effective</span> studying with AI. Simplify your learning.
              </p>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-600 rounded-full mt-3 flex-shrink-0"></div>
              <p className="text-green-800">
                <span className="font-semibold">Regular updates</span> - Built by a student, for students
              </p>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-red-600 rounded-full mt-3 flex-shrink-0"></div>
              <p className="text-red-800 line-through">
                Monthly subscription fees
              </p>
            </div>
          </div>
        </div>

        {/* Recovery Flow for Existing Users */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            Already purchased? Recover your access
          </h3>
          <p className="text-blue-700 text-sm mb-3">
            If you've already paid for BrightPal, click below to restore your access using your device.
          </p>
          <button
            onClick={handleRecoverAccess}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors duration-200 disabled:opacity-50"
          >
            {isProcessing ? 'Checking...' : 'Recover My Access'}
          </button>
        </div>

        <div className="flex items-center justify-center space-x-4">
          <button
            onClick={handleBack}
            className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-4 px-8 rounded-lg text-lg transition-colors duration-200 shadow-lg"
          >
            Back
          </button>

          <button
            onClick={handlePayment}
            disabled={isProcessing}
            className={`font-semibold py-4 px-12 rounded-lg text-xl transition-all duration-200 shadow-lg ${
              isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white hover:shadow-xl'
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Initiating Payment...</span>
              </div>
            ) : (
              'Pay $10 & Get Started'
            )}
          </button>
        </div>

        <div className="mt-6 text-sm text-gray-500">
          Secure payment powered by Stripe
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 mb-2">Development Mode</p>
            <button
              onClick={handleDevBypass}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              Bypass Payment (Dev Only)
            </button>
          </div>
        )}

        {showStripeModal && clientSecret && (
          <StripeElementsModal
            clientSecret={clientSecret}
            onSuccess={(paymentIntentId) => {
              setPaymentIntentId(paymentIntentId);
              handlePaymentSuccess();
            }}
            onCancel={() => {
              setShowStripeModal(false);
              setPaymentError('Payment was canceled.');
            }}
          />
        )}
      </div>
    </div>
  );
}
