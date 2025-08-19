// index.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PRODUCT_NAME = "BrightPal - Lifetime Access";
const PRODUCT_DESCRIPTION = "One-time payment for lifetime access to BrightPal PDF reader";
const AMOUNT_CENTS = 1000; // $10
const CURRENCY = "usd";

// ---- Stripe Functions ----
async function createPaymentIntent(data) {
  // Create or get customer with device binding
  let customer;
  try {
    // Try to find existing customer by email
    const existingCustomers = await stripe.customers.list({
      email: data.email,
      limit: 1
    });
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      // Update existing customer with new device info
      customer = await stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          deviceId: data.deviceId,
          userId: data.userId,
          app_version: data.appVersion || "unknown",
          platform: data.platform || "desktop",
          last_updated: new Date().toISOString()
        }
      });
    } else {
      // Create new customer with device binding
      customer = await stripe.customers.create({
        email: data.email,
        metadata: {
          deviceId: data.deviceId,
          userId: data.userId,
          app_version: data.appVersion || "unknown",
          platform: data.platform || "desktop",
          created_at: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    console.error("Error creating/updating customer:", error);
    throw new Error("Failed to create customer");
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: AMOUNT_CENTS,
    currency: CURRENCY,
    customer: customer.id,
    description: PRODUCT_DESCRIPTION,
    receipt_email: data.email,
    metadata: {
      product: "brightpal-lifetime",
      payment_type: "one_time",
      app_version: data.appVersion || "unknown",
      platform: data.platform || "desktop",
      userId: data.userId || "anonymous",
      deviceId: data.deviceId,
      customer_id: customer.id
    },
    automatic_payment_methods: { enabled: true },
  });

  return {
    success: true,
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
    customer_id: customer.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
  };
}

async function createCheckoutSession(data) {
  // Create or get customer with device binding
  let customer;
  try {
    const existingCustomers = await stripe.customers.list({
      email: data.email,
      limit: 1
    });
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      customer = await stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          deviceId: data.deviceId,
          userId: data.userId,
          app_version: data.appVersion || "unknown",
          platform: data.platform || "desktop",
          last_updated: new Date().toISOString()
        }
      });
    } else {
      customer = await stripe.customers.create({
        email: data.email,
        metadata: {
          deviceId: data.deviceId,
          userId: data.userId,
          app_version: data.appVersion || "unknown",
          platform: data.platform || "desktop",
          created_at: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    console.error("Error creating/updating customer:", error);
    throw new Error("Failed to create customer");
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    customer: customer.id,
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          product_data: { name: PRODUCT_NAME, description: PRODUCT_DESCRIPTION },
          unit_amount: AMOUNT_CENTS,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${data.app_domain || "https://your-production-app.com"}/onboarding?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${data.app_domain || "https://your-production-app.com"}/onboarding?canceled=true`,
    customer_email: data.email,
    metadata: {
      product: "brightpal-lifetime",
      payment_type: "one_time",
      app_version: data.appVersion || "unknown",
      platform: data.platform || "desktop",
      userId: data.userId || "anonymous",
      deviceId: data.deviceId,
      customer_id: customer.id
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  return {
    success: true,
    checkout_url: checkoutSession.url,
    session_id: checkoutSession.id,
    customer_id: customer.id,
    amount: checkoutSession.amount_total,
    currency: checkoutSession.currency,
    status: checkoutSession.status,
  };
}

async function verifyPayment(payment_intent_id) {
  const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

  if (paymentIntent.status === "succeeded") {
    // Get customer info for device verification
    let customer = null;
    if (paymentIntent.customer) {
      customer = await stripe.customers.retrieve(paymentIntent.customer);
    }

    return {
      success: true,
      verified: true,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      customer_email: paymentIntent.receipt_email,
      customer_id: paymentIntent.customer,
      deviceId: customer?.metadata?.deviceId,
      userId: customer?.metadata?.userId,
      metadata: paymentIntent.metadata,
    };
  }

  return {
    success: true,
    verified: false,
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
  };
}

async function checkPaymentStatus(data) {
    try {
      // 1) Find the customer either by explicit id or by email
      let customer = null;
      if (data.stripe_customer_id) {
        customer = await stripe.customers.retrieve(data.stripe_customer_id);
      } else if (data.email) {
        const list = await stripe.customers.list({ email: data.email, limit: 1 });
        if (list.data && list.data.length > 0) {
          customer = list.data[0];
        }
      }
  
      if (!customer) {
        return { success: true, hasPaid: false, error: "Customer not found" };
      }
  
      // 2) Check for any succeeded payments
      const payments = await stripe.paymentIntents.list({ customer: customer.id, limit: 50 });
      const succeeded = payments.data.filter((p) => p.status === 'succeeded');
      if (!succeeded.length) {
        return { success: true, hasPaid: false, error: "No successful payments" };
      }
  
      // 3) Verify device binding against customer metadata
      const storedDeviceId = customer.metadata?.deviceId || null;
      const deviceVerified = !!storedDeviceId && !!data.deviceId && storedDeviceId === data.deviceId;
  
      const latest = succeeded[0];
      return {
        success: true,
        hasPaid: true,
        device_verified: deviceVerified,
        amount: latest.amount,
        currency: latest.currency,
        customer_email: customer.email,
        payment_date: latest.created ? new Date(latest.created * 1000).toISOString() : undefined,
      };
    } catch (e) {
      console.error('checkPaymentStatus error:', e);
      return { success: false, error: 'verification_failed', error_type: 'verification_error' };
    }
  }

async function createRefund(payment_intent_id, reason = "requested_by_customer") {
  const refund = await stripe.refunds.create({
    payment_intent: payment_intent_id,
    reason,
    metadata: { refund_reason: reason, refunded_at: new Date().toISOString() },
  });

  return {
    success: true,
    refund_id: refund.id,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
  };
}

// ---- Lambda handler ----
exports.handler = async (event) => {
  try {
    // --- Determine HTTP method for HTTP API v2 ---
    const method = event.requestContext?.http?.method || "POST";

    if (method === "OPTIONS") {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: "",
      };
    }

    if (method !== "POST") {
      return {
        statusCode: 405,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: "Method not allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { action, data } = body;

    let result;
    switch (action) {
      case "create_payment_intent":
        result = await createPaymentIntent(data);
        break;
      case "create_checkout_session":
        result = await createCheckoutSession(data);
        break;
      case "verify_payment":
        result = await verifyPayment(data.payment_intent_id);
        break;
      case "check_payment_status":
        result = await checkPaymentStatus(data);
        break;
      case "create_refund":
        result = await createRefund(data.payment_intent_id, data.reason);
        break;
      default:
        result = { success: false, error: `Unknown action: ${action}`, error_type: "invalid_action" };
    }

    return {
      statusCode: result.success ? 200 : 400,
      headers: corsHeaders(),
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Lambda error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, error: err.message, error_type: "server_error" }),
    };
  }
};

// ---- CORS headers ----
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}