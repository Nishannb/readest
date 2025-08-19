"use client";

import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

type InnerProps = {
  clientSecret: string;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
};

function CheckoutFormInner({ clientSecret, onSuccess, onCancel }: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href, // not used in embedded flow
      },
      redirect: 'if_required',
    });
    if (error) {
      setError(error.message || 'Payment failed');
      setSubmitting(false);
      return;
    }
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    } else {
      setError('Payment not completed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
      <div className="mb-4 text-lg font-semibold">Complete payment</div>
      <div className="mb-4">
        <PaymentElement />
      </div>
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
      <div className="flex items-center justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300">
          Cancel
        </button>
        <button
          disabled={!stripe || submitting}
          onClick={handleSubmit}
          className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Processing…' : 'Pay'}
        </button>
      </div>
    </div>
  );
}

export default function StripeElementsModal({
  clientSecret,
  onSuccess,
  onCancel,
}: InnerProps) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(!!clientSecret && !!publishableKey);
  }, [clientSecret]);

  if (!ready) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <Elements
        stripe={stripePromise}
        options={{ clientSecret, appearance: { theme: 'stripe' } }}
      >
        <CheckoutFormInner clientSecret={clientSecret} onSuccess={onSuccess} onCancel={onCancel} />
      </Elements>
    </div>
  );
}
