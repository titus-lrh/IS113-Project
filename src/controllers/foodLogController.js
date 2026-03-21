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

module.exports = { getSchedule, searchFood, addEntry, removeEntry, getNutritionData };
