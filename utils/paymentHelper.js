const paystack = require('../config/paystack');

const initializeDirectPayment = async (amount, email, metadata) => {
  try {
    const paymentData = {
      email,
      amount: amount * 100, // Convert to kobo
      callback_url: `${process.env.FRONTEND_URL}/dashboard`, // Use same endpoint
      cancel_url: `${process.env.FRONTEND_URL}/dashboard`,
      metadata,
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      // Add these options to improve payment success rate
      currency: "NGN",
      bearer: "account"
    };

    console.log('Initializing payment with data:', paymentData);
    const response = await paystack.acceptPayment(paymentData);
    
    if (!response.data || !response.data.authorization_url) {
      throw new Error('Invalid payment initialization response');
    }
    
    return response;
  } catch (error) {
    console.error('Payment initialization error:', error);
    throw new Error(`Payment initialization failed: ${error.message}`);
  }
};

module.exports = { initializeDirectPayment };
