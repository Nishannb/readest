# Onboarding & Payment System Setup

This document explains how to set up the onboarding and payment system for Readest.

## Overview

The onboarding system consists of 4 steps:
1. **Welcome Screen** - Big welcome message with next button
2. **Features Explanation** - Details about the app with terms acceptance
3. **Ollama Check** - Verifies Ollama installation, lists models, and allows model selection
4. **Payment** - $10 one-time payment via Stripe

## Environment Variables

Create a `.env.local` file in the `apps/brightpal-app` directory with:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_payment_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Stripe Setup

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard
3. Set up webhook endpoints:
   - URL: `https://yourdomain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the webhook secret to your environment variables

## How It Works

### Payment Flow
1. User clicks "Pay $10 & Get Started"
2. App creates a Stripe checkout session
3. User is redirected to Stripe Checkout
4. After payment, user is redirected back with success/cancel parameters
5. App marks user as paid and redirects to main app

### Ollama Integration
1. **Detection**: Automatically checks if Ollama is installed using `ollama --version`
2. **Model Listing**: Lists all installed models using `ollama list`
3. **Model Selection**: User selects a default model during onboarding
4. **Persistence**: Selected model is stored and can be changed later in settings
5. **Fallback**: Users can proceed without Ollama if needed

### Route Protection
- All protected routes (like `/library`) are wrapped with `ProtectedRoute` component
- Users who haven't completed onboarding or paid are automatically redirected to `/onboarding`
- Payment status is stored locally using Zustand with persistence

### Local Storage
The payment store uses Zustand's persist middleware to store:
- `hasCompletedOnboarding`: Whether user completed the flow
- `hasPaid`: Whether payment was successful
- `currentStep`: Current onboarding step
- `ollamaInstalled`: Whether Ollama was detected
- `termsAccepted`: Whether terms were accepted
- `selectedOllamaModel`: The user's selected default Ollama model

## Ollama Commands

The system provides guidance on these Ollama commands:
- `ollama --version` - Check if Ollama is installed
- `ollama list` - List installed models
- `ollama pull <model_name>` - Download a model
- `ollama run <model_name>` - Run a model

## Customization

### Changing the Price
Edit the `unit_amount` in `apps/brightpal-app/src/app/api/stripe/checkout/route.ts`:
```typescript
unit_amount: 1000, // $10.00 in cents
```

### Modifying Onboarding Steps
Edit the components in `apps/brightpal-app/src/app/onboarding/components/`

### Adding More Payment Methods
Modify the Stripe checkout session creation to include additional payment methods.

### Ollama Model Parsing
The system parses `ollama list` output to extract model information. If the output format changes, update the parsing logic in `OllamaStep.tsx`.

## Testing

1. Use Stripe test keys for development
2. Test the payment flow with test card numbers:
   - Success: 4242 4242 4242 4242
   - Decline: 4000 0000 0000 0002
3. Verify webhook handling in your server logs
4. Test Ollama detection with and without Ollama installed
5. Test model selection and persistence

## Development Features

- **Reset Button**: In header for easy testing
- **Step Navigation**: Can jump between completed steps
- **Development Bypass**: Payment bypass button in development mode
- **Ollama Settings Component**: Reusable component for model management

## Production Considerations

1. Use production Stripe keys
2. Implement proper payment verification
3. Add database storage for payment records
4. Set up proper error handling and logging
5. Consider adding analytics for conversion tracking
6. Implement proper security measures for webhook verification
7. Remove development bypass features
8. Test Ollama detection on various systems

## Troubleshooting

### Ollama Not Detected
- Ensure Ollama is in your system PATH
- Try running `ollama --version` in terminal
- Check if Ollama service is running
- Verify Tauri shell permissions

### Model Parsing Issues
- Check `ollama list` output format
- Update parsing logic if needed
- Verify model data structure

### Payment Issues
- Check Stripe API keys
- Verify webhook configuration
- Check network connectivity
- Review Stripe dashboard for errors
