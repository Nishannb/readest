'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms & Conditions</h1>
          <p className="text-lg text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="prose prose-lg max-w-none">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By using Readest, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the application.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Readest is a PDF reader application designed for students to enhance their study experience through AI-powered features. The application allows users to read, annotate, and analyze PDF documents.
          </p>

          <h2>3. Payment Terms</h2>
          <p>
            Readest requires a one-time payment of $10 for lifetime access to all features. This is not a subscription service and no recurring charges will be applied.
          </p>

          <h2>4. User Responsibilities</h2>
          <p>
            Users are responsible for:
          </p>
          <ul>
            <li>Providing their own API keys for AI services (Gemini, OpenAI, OpenRouter, etc.)</li>
            <li>Ensuring they have the right to access and use any PDF documents they upload</li>
            <li>Using the application in compliance with applicable laws and regulations</li>
          </ul>

          <h2>5. Privacy and Data</h2>
          <p>
            Readest processes PDF documents locally on your device. No personal data or document content is transmitted to our servers unless explicitly requested by you for specific features.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            Readest is provided "as is" without warranties of any kind. We are not responsible for any damages arising from the use of the application.
          </p>

          <h2>7. Updates and Modifications</h2>
          <p>
            We may update these terms from time to time. Continued use of the application constitutes acceptance of any changes.
          </p>

          <h2>8. Contact Information</h2>
          <p>
            If you have any questions about these terms, please contact us through the application or our support channels.
          </p>
        </div>

        <div className="text-center mt-12">
          <Link 
            href="/onboarding" 
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            Back to Onboarding
          </Link>
        </div>
      </div>
    </div>
  );
}
