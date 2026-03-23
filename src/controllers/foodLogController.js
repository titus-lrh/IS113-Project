'use strict';

const mongoose = require('mongoose');
const FoodLog = require('../models/FoodLog');
const Recipe = require('../models/recipe-model');
const { getNutrition } = require('../services/nutritionService');
const { getOrCreateLog, addFoodEntry, removeFoodEntry } = require('../services/foodLogService');

// ── helpers ────────────────────────────────────────────────────────────────

async function fetchFromMealDB(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data.meals || [];
}

// ── controllers ────────────────────────────────────────────────────────────

/**
 * GET /schedule
 * GET /schedule/:dateString  (YYYY-MM-DD)
 */
const getSchedule = async (req, res) => {
  try {
    const dateString = req.params.dateString || new Date().toISOString().slice(0, 10);
    const userId = req.session.userId;
    const log = await getOrCreateLog(userId, dateString);

    res.render('foodlog/schedule', {
      log,
      dateString,
      session: req.session,
      page: 'schedule',
    });
  } catch (error) {
    console.error('Error loading schedule:', error);
    res.status(500).send('Error loading schedule');
  }
};

/**
 * GET /schedule/search?q=...
 * Returns JSON { userRecipes: [...], mealdb: [...] }
 */
const searchFood = async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ userRecipes: [], mealdb: [] });

  try {
    const [userRecipes, mealdbMeals] = await Promise.all([
      Recipe.searchRecipesByTitle(query),
      fetchFromMealDB(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`),
    ]);

    const mealdb = mealdbMeals.map((m) => ({
      id: m.idMeal,
      name: m.strMeal,
      thumb: m.strMealThumb,
      sourceType: 'themealdb',
      sourceId: m.idMeal,
    }));

    const recipes = userRecipes.map((r) => ({
      id: r._id,
      name: r.title,
      sourceType: 'user_recipe',
      sourceId: r._id.toString(),
    }));

    res.json({ userRecipes: recipes, mealdb });
  } catch (error) {
    console.error('Error searching food:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

/**
 * POST /schedule/entry
 * Body: { dateString, sourceType, sourceId, foodName, context, servings, timeLabel, mealType }
 */
const addEntry = async (req, res) => {
  const {
    dateString,
    sourceType,
    sourceId,
    foodName,
    context = '',
    servings = 1,
    timeLabel = '',
    mealType = 'Other',
  } = req.body;

  if (!foodName) {
    return res.status(400).json({ error: 'foodName is required' });
  }

  const userId = req.session.userId;
  const date = dateString || new Date().toISOString().slice(0, 10);

  try {
    // Nutrition lookup (cache-first, GPT fallback)
    let nutritionDoc = null;
    try {
      nutritionDoc = await getNutrition(sourceType || null, sourceId || null, foodName, context);
    } catch (nutritionErr) {
      console.error('Nutrition fetch failed, saving entry without computed values:', nutritionErr);
    }

    const log = await getOrCreateLog(userId, date);
    await addFoodEntry(log, { foodName, sourceType, sourceId, nutrition: nutritionDoc, servings, mealType, timeLabel });

    const updated = await FoodLog.findById(log._id);
    res.json({ log: updated });
  } catch (error) {
    console.error('Error adding entry:', error);
    res.status(500).json({ error: 'Failed to add entry' });
  }
};

/**
 * DELETE /schedule/entry/:entryId
 */
const removeEntry = async (req, res) => {
  const userId = req.session.userId;
  const { entryId } = req.params;

  try {
    const log = await FoodLog.findOne({
      userId,
      entries: { $elemMatch: { _id: new mongoose.Types.ObjectId(entryId) } },
    });

    if (!log) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    await removeFoodEntry(log, entryId);

    res.json({ log });
  } catch (error) {
    console.error('Error removing entry:', error);
    res.status(500).json({ error: 'Failed to remove entry' });
  }
};

/**
 * GET /schedule/nutrition/:sourceType/:sourceId
 * JSON endpoint — returns or fetches nutrition for a food item.
 */
const getNutritionData = async (req, res) => {
  const { sourceType, sourceId } = req.params;
  const { foodName = '', context = '' } = req.query;

  if (!foodName) {
    return res.status(400).json({ error: 'foodName query param is required' });
  }

  try {
    const doc = await getNutrition(sourceType, sourceId, foodName, context);
    res.json({ nutrition: doc });
  } catch (error) {
    console.error('Error fetching nutrition data:', error);
    res.status(502).json({ error: 'Failed to fetch nutrition data' });
  }
};

/**
 * ── Form-based endpoints (backend-first, serves HTML) ──
 */

/**
 * POST /schedule/search-food
 * Body: { query, mealType }
 * Renders search results form with matching foods
 */
const searchFoodForm = async (req, res) => {
  const { query, mealType = 'Other' } = req.body;
  const errors = [];

  if (!query || !query.trim()) {
    errors.push('Enter a food name');
    const dateString = new Date().toISOString().slice(0, 10);
    const log = await getOrCreateLog(req.session.userId, dateString);
    return res.render('foodlog/schedule', { log, dateString, errors, session: req.session });
  }

  try {
    // Search both user recipes and TheMealDB
    const [userRecipes, mealdbMeals] = await Promise.all([
      Recipe.searchRecipesByTitle(query.trim()),
      fetchFromMealDB(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`),
    ]);

    // Build results array with all needed fields
    const results = [
      ...userRecipes.map((r) => ({
        id: r._id.toString(),
        name: r.title,
        source: 'My Recipe',
        sourceType: 'user_recipe',
        sourceId: r._id.toString(),
      })),
      ...mealdbMeals.map((m) => ({
        id: m.idMeal,
        name: m.strMeal,
        source: 'TheMealDB',
        sourceType: 'themealdb',
        sourceId: m.idMeal,
      })),
    ];

    // If no results, show message
    if (results.length === 0) {
      return res.render('foodlog/search-results', {
        results: [],
        query: query.trim(),
        mealType,
        session: req.session,
      });
    }

    res.render('foodlog/search-results', { results, query: query.trim(), mealType, session: req.session });
  } catch (error) {
    console.error('Error searching food:', error);
    errors.push('Search failed. Try again.');
    const dateString = new Date().toISOString().slice(0, 10);
    const log = await getOrCreateLog(req.session.userId, dateString);
    res.render('foodlog/schedule', { log, dateString, errors, session: req.session });
  }
};

/**
 * POST /schedule/select-food
 * Body: { results, selectedIndex, mealType }
 * Renders portion/nutrition form
 */
const selectFoodForm = async (req, res) => {
  const { results, selectedIndex, mealType = 'Other' } = req.body;
  const errors = [];

  if (!results || !selectedIndex) {
    errors.push('No food selected');
    const dateString = new Date().toISOString().slice(0, 10);
    const log = await getOrCreateLog(req.session.userId, dateString);
    return res.render('foodlog/schedule', { log, dateString, errors, session: req.session });
  }

  try {
    // Parse the results array and get the selected food
    const resultsArray = typeof results === 'string' ? JSON.parse(results) : results;
    const selectedFood = resultsArray[parseInt(selectedIndex)];

    if (!selectedFood) {
      throw new Error('Food not found in results');
    }

    // Get nutrition data
    let nutrition = null;
    try {
      nutrition = await getNutrition(selectedFood.sourceType, selectedFood.sourceId, selectedFood.name, '');
    } catch (err) {
      console.error('Nutrition fetch failed:', err);
    }

    // Build nutrition preview (default serving is 100g for 1x)
    const nutritionPreview = nutrition
      ? `~${Math.round(nutrition.nutrition?.calories || 0)} kcal · ${Math.round(nutrition.nutrition?.protein || 0)}g P`
      : 'Nutrition pending';

    res.render('foodlog/portion-form', {
      selectedFood,
      nutrition,
      mealType,
      nutritionPreview,
      session: req.session,
    });
  } catch (error) {
    console.error('Error selecting food:', error);
    errors.push('Food not found');
    const dateString = new Date().toISOString().slice(0, 10);
    const log = await getOrCreateLog(req.session.userId, dateString);
    res.render('foodlog/schedule', { log, dateString, errors, session: req.session });
  }
};

/**
 * POST /schedule/add-food
 * Body: { foodId, foodName, sourceType, sourceId, servings, mealType, timeLabel }
 * Adds entry and redirects to schedule
 */
const addFoodPost = async (req, res) => {
  const { foodId, foodName, sourceType, sourceId, servings = 1, mealType = 'Other', timeLabel = '' } = req.body;
  const userId = req.session.userId;
  const dateString = new Date().toISOString().slice(0, 10);
  const errors = [];

  if (!foodName || !foodName.trim()) errors.push('Food required');
  if (!servings || isNaN(servings) || servings <= 0) errors.push('Valid servings required');

  if (errors.length > 0) {
    const log = await getOrCreateLog(userId, dateString);
    return res.render('foodlog/schedule', { log, dateString, errors, session: req.session });
  }

  try {
    const log = await getOrCreateLog(userId, dateString);

    // Fetch nutrition
    let nutritionDoc = null;
    try {
      nutritionDoc = await getNutrition(sourceType || null, sourceId || null, foodName.trim(), '');
    } catch (err) {
      console.error('Nutrition fetch failed:', err);
    }

    await addFoodEntry(log, {
      foodName: foodName.trim(),
      sourceType: sourceType || 'custom',
      sourceId: sourceId || '',
      nutrition: nutritionDoc,
      servings: Number(servings),
      mealType,
      timeLabel,
    });

    res.redirect(`/schedule/${dateString}`);
  } catch (error) {
    console.error('Error adding entry:', error);
    errors.push('Failed to add entry');
    const log = await getOrCreateLog(userId, dateString);
    res.render('foodlog/schedule', { log, dateString, errors, session: req.session });
  }
};

/**
 * POST /schedule/delete-entry/:entryId
 * Deletes entry and redirects to schedule
 */
const deleteEntryPost = async (req, res) => {
  const userId = req.session.userId;
  const { entryId } = req.params;
  const dateString = new Date().toISOString().slice(0, 10);

  try {
    const log = await FoodLog.findOne({
      userId,
      entries: { $elemMatch: { _id: new mongoose.Types.ObjectId(entryId) } },
    });

    if (!log) {
      return res.status(404).send('Entry not found');
    }

    await removeFoodEntry(log, entryId);
    res.redirect(`/schedule/${dateString}`);
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).send('Failed to delete entry');
  }
};

module.exports = {
  getSchedule,
  searchFood,
  addEntry,
  removeEntry,
  getNutritionData,
  searchFoodForm,
  selectFoodForm,
  addFoodPost,
  deleteEntryPost,
};
