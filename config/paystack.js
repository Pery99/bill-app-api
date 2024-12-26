const https = require('https');

const MySecretKey = process.env.PAYSTACK_SECRET_KEY;

const paystack = {
  acceptPayment: async (form) => {
    return new Promise((resolve, reject) => {
      const params = JSON.stringify({
        "email": form.email,
        "amount": form.amount,
        "callback_url": form.callback_url,
        "cancel_url": form.cancel_url,
        "metadata": form.metadata
      });

      const options = {
        hostname: 'api.paystack.co',
        port: 443,
        path: '/transaction/initialize',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MySecretKey}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, res => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(JSON.parse(data));
        });
      }).on('error', error => {
        reject(error);
      });

      req.write(params);
      req.end();
    });
  },

  verifyPayment: async (ref) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.paystack.co',
        port: 443,
        path: `/transaction/verify/${ref}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${MySecretKey}`
        }
      };

      const req = https.request(options, res => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(JSON.parse(data));
        });
      }).on('error', error => {
        reject(error);
      });

      req.end();
    });
  }
};

module.exports = paystack;
