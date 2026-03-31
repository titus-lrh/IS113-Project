'use strict';

const express = require('express');
const router = express.Router();
const foodLogController = require('../controllers/foodLogController');
const { isAuthenticated } = require('../middleware/auth');

// All food log routes require auth
router.use(isAuthenticated);

// ── Form-based endpoints (new, backend-first) ──
router.post('/search-food', foodLogController.searchFoodForm);
router.post('/select-food', foodLogController.selectFoodForm);
router.post('/add-food', foodLogController.addFoodPost);
router.post('/delete-entry/:entryId', foodLogController.deleteEntryPost);
router.post('/generate-suggestions', foodLogController.generateSuggestions);

// ── JSON endpoints (legacy, can remove later) ──
router.get('/search', foodLogController.searchFood);
router.get('/nutrition/:sourceType/:sourceId', foodLogController.getNutritionData);
router.post('/entry', foodLogController.addEntry);
router.delete('/entry/:entryId', foodLogController.removeEntry);

// ── Schedule views ──
router.get('/:dateString', foodLogController.getSchedule);
router.get('/', foodLogController.getSchedule);

module.exports = router;
