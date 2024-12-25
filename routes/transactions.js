const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const transactionController = require('../controllers/transactionController');

router.post('/airtime', auth, transactionController.purchaseAirtime);
router.post('/data', auth, transactionController.purchaseData);
router.post('/electricity', auth, transactionController.purchaseElectricity);
router.post('/tv', auth, transactionController.purchaseTv);
router.get('/history', auth, transactionController.getTransactions);

module.exports = router;
