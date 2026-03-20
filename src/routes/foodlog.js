'use strict';

const express = require('express');
const router = express.Router();
const foodLogController = require('../controllers/foodLogController');
const { isAuthenticated } = require('../middleware/auth');

// All food log routes require auth
router.use(isAuthenticated);

router.get('/search', foodLogController.searchFood);
router.get('/nutrition/:sourceType/:sourceId', foodLogController.getNutritionData);
router.post('/entry', foodLogController.addEntry);
router.delete('/entry/:entryId', foodLogController.removeEntry);
router.get('/:dateString', foodLogController.getSchedule);
router.get('/', foodLogController.getSchedule);

module.exports = router;
