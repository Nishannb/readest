# Stripe Integration Setup for Desktop App

This guide explains how to set up Stripe payments in your Readest desktop application.

## 🔑 **Required Environment Variables**

Create a `.env.local` file in the `apps/brightpal-app` directory with:

```bash
# Stripe Configuration (Required for payment functionality)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🏗️ **What's Been Implemented**

### 1. **Payment Service** (`src/services/payment.ts`)
- Calls your AWS Lambda endpoints
- Handles PaymentIntent creation and verification
- Cross-platform HTTP requests (Tauri + web)

### 2. **Stripe Elements Modal** (`src/components/StripeElementsModal.tsx`)
- In-app payment form using Stripe Elements
- No external redirects or webviews
- Professional payment experience

### 3. **Updated Payment Step** (`src/app/onboarding/components/PaymentStep.tsx`)
- Integrates with Lambda API
- Shows Stripe Elements modal
- Verifies payment and unlocks features

## 🚀 **How to Get Your Stripe Keys**

1. **Go to** [stripe.com](https://stripe.com) and sign up/login
2. **Navigate to** Developers → API keys
3. **Copy** the Publishable key (starts with `pk_test_` or `pk_live_`)
4. **Add it to** your `.env.local` file

## 🧪 **Testing the Integration**

### 1. **Set Environment Variable**
```bash
# In apps/brightpal-app/.env.local
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

### 2. **Test Cards**
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

### 3. **Run the App**
```bash
pnpm tauri dev
```

## 🔄 **Payment Flow**

1. **User clicks "Pay $10 & Get Started"**
2. **App calls Lambda** `create_payment_intent`
3. **Lambda returns** `client_secret` and `payment_intent_id`
4. **App opens** Stripe Elements modal in-app
5. **User enters** payment details and submits
6. **App calls Lambda** `verify_payment` with `payment_intent_id`
7. **If verified**: Features unlock, user redirected to library
8. **If failed**: Error shown, user can retry

## 🌐 **Lambda API Endpoints Used**

Your existing Lambda function handles:
- `create_payment_intent` - Creates payment intent
- `verify_payment` - Verifies payment completion

**No changes needed to your Lambda!**

## 🎯 **Cross-Platform Support**

- **Windows**: Uses Tauri HTTP plugin when available
- **Mac**: Uses Tauri HTTP plugin when available
- **Fallback**: Uses browser fetch API

## 🔒 **Security Features**

- **No sensitive keys** in desktop app
- **Server-side verification** via Lambda
- **HTTPS-only** API calls
- **Input validation** and error handling

## 🚨 **Troubleshooting**

### **Payment Not Starting**
- Check `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
- Verify Lambda URL is accessible
- Check browser console for errors

### **Payment Failing**
- Verify Stripe keys are correct
- Check Lambda logs for errors
- Ensure CORS is enabled on API Gateway

### **Modal Not Opening**
- Check Stripe dependencies are installed
- Verify environment variables are loaded
- Check for JavaScript errors in console

## 📱 **Next Steps**

1. **Set your Stripe publishable key** in `.env.local`
2. **Test with test cards** first
3. **Verify Lambda integration** works
4. **Go live** with production Stripe keys

## 💡 **Pro Tips**

- **Start with test keys** to verify everything works
- **Monitor Lambda logs** for debugging
- **Test on both Windows and Mac** before going live
- **Keep your publishable key** in version control (it's safe to expose)

Your Stripe integration is now ready! Users can pay $10 for lifetime access directly in your desktop app.
