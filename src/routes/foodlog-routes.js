'use strict';

const express = require('express');
const router = express.Router();
const foodLogController = require('../controllers/foodLogController');
const { isAuthenticated } = require('../middleware/auth');

// All food log routes require auth
router.use(isAuthenticated);

// ── Schedule form flow ────────────────────────────────────────────────────
router.post('/search-food', foodLogController.searchFoodForm);
router.post('/select-food', foodLogController.selectFoodForm);
router.post('/add-food', foodLogController.addFoodPost);
router.post('/delete-entry/:entryId', foodLogController.deleteEntryPost);
router.post('/generate-suggestions', foodLogController.generateSuggestions);

// ── Schedule views ────────────────────────────────────────────────────────
router.get('/:dateString', foodLogController.getSchedule);
router.get('/', foodLogController.getSchedule);

module.exports = router;
