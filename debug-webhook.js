// Test script to verify webhook signature
// Run: node debug-webhook.js

const crypto = require('crypto');

// Test values (replace with your actual values)
const APP_SECRET = 'your_app_secret_here';
const TEST_BODY = '{"object":"whatsapp_business_account","entry":[]}';
const EXPECTED_SIGNATURE = 'sha256=' + crypto
  .createHmac('sha256', APP_SECRET)
  .update(TEST_BODY, 'utf8')
  .digest('base64');

console.log('Expected signature:', EXPECTED_SIGNATURE);
console.log('Test body:', TEST_BODY);
console.log('\nCopy this signature and compare with what Meta sends in X-Hub-Signature-256 header');
