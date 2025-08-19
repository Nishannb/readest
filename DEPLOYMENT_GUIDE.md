# Serverless Payment Backend Deployment Guide

This guide shows you how to deploy the payment backend to various serverless platforms.

## 🚀 **Quick Start - Vercel (Recommended)**

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Create Project Structure
```
your-project/
├── api/
│   └── payment.py
├── requirements.txt
├── vercel.json
└── .env.local
```

### 3. Create `vercel.json`
```json
{
  "functions": {
    "api/payment.py": {
      "runtime": "python3.9"
    }
  },
  "env": {
    "STRIPE_SECRET_KEY": "@stripe-secret-key"
  }
}
```

### 4. Deploy
```bash
vercel
```

## ☁️ **AWS Lambda**

### 1. Create Lambda Function
```bash
# Install AWS CLI and configure credentials
aws configure

# Create deployment package
pip install -r requirements.txt -t package/
cd package
zip -r ../lambda-deployment.zip .
cd ..
zip lambda-deployment.zip payment.py
```

### 2. Deploy via AWS Console
- Go to Lambda Console
- Create function
- Upload `lambda-deployment.zip`
- Set environment variables
- Configure API Gateway trigger

### 3. Environment Variables
```bash
STRIPE_SECRET_KEY=sk_live_your_key_here
```

## 🔥 **Google Cloud Functions**

### 1. Install Google Cloud CLI
```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
gcloud init
```

### 2. Deploy Function
```bash
gcloud functions deploy payment \
  --runtime python39 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars STRIPE_SECRET_KEY=sk_live_your_key_here
```

## 🌐 **Netlify Functions**

### 1. Create Project Structure
```
your-project/
├── netlify/
│   └── functions/
│       └── payment.py
├── requirements.txt
└── netlify.toml
```

### 2. Create `netlify.toml`
```toml
[build]
  functions = "netlify/functions"

[functions]
  directory = "netlify/functions"
```

### 3. Deploy
```bash
netlify deploy --prod
```

## 🐳 **Docker + Any Platform**

### 1. Create Dockerfile
```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY payment.py .

EXPOSE 8000
CMD ["python", "payment.py"]
```

### 2. Build and Deploy
```bash
docker build -t payment-backend .
docker run -p 8000:8000 -e STRIPE_SECRET_KEY=your_key payment-backend
```

## 📱 **Desktop App Integration**

### 1. Update PaymentStep Component
```typescript
const handlePayment = async () => {
  setIsProcessing(true);
  setPaymentError('');

  try {
    // Call your serverless function
    const response = await fetch('https://your-domain.com/api/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create_payment_intent',
        data: {
          app_version: '1.0.0',
          platform: 'desktop',
          user_id: 'user_123',
          email: 'user@example.com'
        }
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create payment');
    }

    const result = await response.json();
    
    if (result.success) {
      // Use the client_secret with Stripe SDK
      const { error } = await stripe.confirmPayment({
        clientSecret: result.client_secret,
        confirmParams: {
          return_url: `${window.location.origin}/onboarding?success=true`,
        },
      });

      if (error) {
        setPaymentError(error.message);
      }
    } else {
      setPaymentError(result.error);
    }
  } catch (error) {
    console.error('Payment error:', error);
    setPaymentError('Payment failed. Please try again.');
  } finally {
    setIsProcessing(false);
  }
};
```

### 2. Alternative: Checkout Session
```typescript
const handlePayment = async () => {
  setIsProcessing(true);
  setPaymentError('');

  try {
    const response = await fetch('https://your-domain.com/api/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create_checkout_session',
        data: {
          app_domain: window.location.origin,
          app_version: '1.0.0',
          platform: 'desktop',
          user_id: 'user_123',
          email: 'user@example.com'
        }
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const result = await response.json();
    
    if (result.success) {
      // Redirect to Stripe Checkout
      window.location.href = result.checkout_url;
    } else {
      setPaymentError(result.error);
    }
  } catch (error) {
    console.error('Payment error:', error);
    setPaymentError('Payment failed. Please try again.');
  } finally {
    setIsProcessing(false);
  }
};
```

## 🔐 **Environment Variables**

### Required Variables
```bash
STRIPE_SECRET_KEY=sk_live_your_production_key_here
```

### Optional Variables
```bash
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
NODE_ENV=production
```

## 🧪 **Testing**

### 1. Local Testing
```bash
# Set environment variable
export STRIPE_SECRET_KEY=sk_test_your_test_key_here

# Run the script
python payment.py
```

### 2. Test with Stripe CLI
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:8000/api/payment

# Test webhook delivery
stripe trigger checkout.session.completed
```

### 3. Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

## 📊 **Monitoring & Logs**

### 1. Stripe Dashboard
- Monitor payments in real-time
- View webhook delivery status
- Check for failed payments

### 2. Platform Logs
- **Vercel**: Dashboard → Functions → Logs
- **AWS**: CloudWatch Logs
- **Google Cloud**: Logging Console
- **Netlify**: Functions → Logs

### 3. Error Tracking
```python
# Add logging to your function
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log important events
logger.info(f"Payment created: {payment_intent.id}")
logger.error(f"Payment failed: {error}")
```

## 🚨 **Security Best Practices**

### 1. Environment Variables
- Never commit secrets to version control
- Use platform-specific secret management
- Rotate keys regularly

### 2. CORS Configuration
```python
# Restrict to your app's domain
'Access-Control-Allow-Origin': 'https://yourdomain.com'
```

### 3. Rate Limiting
- Implement rate limiting on your endpoint
- Monitor for abuse
- Use platform-specific rate limiting

### 4. Input Validation
```python
# Validate input data
def validate_request_data(data):
    required_fields = ['app_version', 'platform']
    for field in required_fields:
        if field not in data:
            raise ValueError(f"Missing required field: {field}")
```

## 🔄 **Webhook Handling**

### 1. Set Up Webhook Endpoint
```bash
# In Stripe Dashboard
URL: https://your-domain.com/api/webhook
Events: checkout.session.completed, payment_intent.succeeded
```

### 2. Verify Webhook Signatures
```python
import stripe

# Verify webhook signature
try:
    event = stripe.Webhook.construct_event(
        payload, sig_header, webhook_secret
    )
except ValueError as e:
    return {'error': 'Invalid payload'}
except stripe.error.SignatureVerificationError as e:
    return {'error': 'Invalid signature'}
```

## 💰 **Getting Paid**

### 1. Payout Schedule
- Set in Stripe Dashboard
- Usually 2-7 business days
- Add your business bank account

### 2. Tax Considerations
- Provide tax information
- Consider VAT/GST if applicable
- Keep records for tax purposes

## 🆘 **Troubleshooting**

### Common Issues
1. **CORS Errors**: Check CORS headers in response
2. **Environment Variables**: Verify they're set correctly
3. **Stripe Keys**: Ensure you're using the right keys (test vs live)
4. **Webhook Failures**: Check endpoint URL and signature verification

### Support Resources
- **Stripe**: [support.stripe.com](https://support.stripe.com)
- **Platform Docs**: Check your platform's documentation
- **Community**: Stack Overflow, Reddit, etc.

## 🎯 **Next Steps**

1. **Deploy** to your chosen platform
2. **Test** with Stripe test keys
3. **Update** your desktop app to use the new endpoint
4. **Monitor** payments and webhooks
5. **Go Live** with production Stripe keys
6. **Scale** as needed

Your serverless payment backend is now ready to handle real payments from your desktop app users!
