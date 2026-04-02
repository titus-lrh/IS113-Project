'use strict';

/**
 * Food log controller
 * -------------------
 * This module owns the schedule feature end to end:
 * 1. Load a day's FoodLog document (or create one if it does not exist yet)
 * 2. Let the user search for food from community recipes and TheMealDB
 * 3. Resolve nutrition through the shared nutrition cache / GPT fallback
 * 4. Persist denormalized entries onto the FoodLog document
 * 5. Render the schedule view with grouped entries, totals, and suggestions
 *
 * 
 */
const mongoose = require('mongoose');
const FoodLog = require('../models/foodLog-model');
const Recipe = require('../models/recipe-model');
const User = require('../models/user-model');
const { getNutrition } = require('../services/nutritionService');
const getOrCreateLog = FoodLog.getOrCreateLog.bind(FoodLog);
const addFoodEntry = FoodLog.addFoodEntry.bind(FoodLog);
const removeFoodEntry = FoodLog.removeFoodEntry.bind(FoodLog);
const { getSuggestions } = require('../services/suggestionService');

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a date string into the schedule's expected YYYY-MM-DD format.
 * Invalid or missing dates fall back to "today" so downstream code can safely
 * build Date objects and query FoodLog by a single canonical day key.
 */
function normalizeDateString(input) {
  const today = new Date().toISOString().slice(0, 10);
  if (!input || typeof input !== 'string') return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return today;
  const parsed = Date.parse(`${input}T00:00:00Z`);
  return Number.isNaN(parsed) ? today : input;
}

/**
 * Fetch meals from TheMealDB and normalize its "null when empty" response shape
 * into a predictable array for callers in this controller.
 */
async function fetchFromMealDB(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data.meals || [];
}

/**
 * Read the user's calorie goal from the profile document.
 * Schedule rendering and suggestion generation both use the same fallback of
 * 3000 kcal when the user record or the specific field is missing.
 */
async function getUserCalorieGoal(userId) {
  const user = await User.findByUserId(userId);
  return user ? user.calorieGoal || 3000 : 3000;
}

/**
 * Convert a FoodLog document into the exact shape expected by schedule.ejs.
 * The view needs:
 * - remaining calories for the header / suggestions area
 * - a fixed meal order so empty sections still render consistently
 * - grouped entries with per-meal calories for the timeline
 * - previous / next date strings for navigation
 */
function buildScheduleViewModel(log, dateString, calorieGoal) {
  const totals = log.dailyTotals || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const remainingCalories = calorieGoal - (totals.calories || 0);
  const mealOrder = ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack', 'Other'];
  const groupedEntries = {};

  mealOrder.forEach((mealType) => {
    groupedEntries[mealType] = { entries: [], calories: 0 };
  });

  // Group entries before rendering so the template stays simple and predictable.
  (log.entries || []).forEach((entry) => {
    const mealType = entry.mealType || 'Other';
    if (!groupedEntries[mealType]) {
      groupedEntries[mealType] = { entries: [], calories: 0 };
    }
    groupedEntries[mealType].entries.push(entry);
    groupedEntries[mealType].calories += entry.computed?.calories || 0;
  });

  const today = new Date().toISOString().slice(0, 10);
  const current = new Date(`${dateString}T00:00:00Z`);
  const prevDate = new Date(current);
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const nextDate = new Date(current);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  return {
    calorieGoal,
    remainingCalories,
    mealOrder,
    groupedEntries,
    prevStr: prevDate.toISOString().slice(0, 10),
    nextStr: nextDate.toISOString().slice(0, 10),
    displayLabel: dateString === today
      ? 'Today'
      : current.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

/**
 * Single render helper for the main schedule page.
 * Controllers call this when they want to re-display the schedule after either:
 * - a normal GET load
 * - a recoverable form error
 * - successful suggestion generation
 */
function renderSchedulePage(res, req, { log, dateString, calorieGoal, errors = [], suggestions = [] }) {
  const viewModel = buildScheduleViewModel(log, dateString, calorieGoal);
  return res.render('foodlog/schedule', {
    log,
    dateString,
    errors,
    suggestions,
    session: req.session,
    ...viewModel,
    page: 'schedule',
  });
}

// ── controllers ────────────────────────────────────────────────────────────

/**
 * GET /schedule
 * GET /schedule/:dateString  (YYYY-MM-DD)
 *
 * Main schedule page. Ensures the user has a FoodLog document for the requested
 * day, loads the user's calorie goal, then renders the timeline view.
 */
const getSchedule = async (req, res) => {
  try {
    const dateString = normalizeDateString(req.params.dateString);
    const userId = req.session.userId;
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(userId, dateString),
      getUserCalorieGoal(userId),
    ]);
    renderSchedulePage(res, req, { log, dateString, calorieGoal });
  } catch (error) {
    console.error('Error loading schedule:', error);
    res.status(500).send('Error loading schedule');
  }
};

/**
 * POST /schedule/generate-suggestions
 * Body: { dateString }
 *
 * Loads the current day's log, computes remaining calories from the same
 * view-model logic used by the page, then asks suggestionService for foods
 * that fit within that remaining budget.
 */
const generateSuggestions = async (req, res) => {
  const dateString = normalizeDateString(req.body.dateString || req.params.dateString);
  const userId = req.session.userId;

  try {
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(userId, dateString),
      getUserCalorieGoal(userId),
    ]);
    const { remainingCalories } = buildScheduleViewModel(log, dateString, calorieGoal);
    const suggestions = await getSuggestions(remainingCalories);
    renderSchedulePage(res, req, { log, dateString, calorieGoal, suggestions });
  } catch (error) {
    console.error('Error loading suggestions:', error);
    res.status(500).send('Failed to load suggestions');
  }
};

/**
 * GET /schedule/search?q=...
 * Returns JSON { userRecipes: [...], mealdb: [...] }
 *
 * Legacy JSON endpoint. It searches both local recipes and TheMealDB, then
 * returns lightweight result objects for clients that want to build their own UI.
 */
const searchFood = async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ userRecipes: [], mealdb: [] });

  try {
    const [userRecipes, mealdbMeals] = await Promise.all([
      Recipe.searchRecipeTitles(query),
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
 *
 * Legacy JSON endpoint for creating an entry directly.
 * The important flow is:
 * - try to resolve nutrition through the shared cache / GPT service
 * - still save the entry if nutrition lookup fails
 * - rely on FoodLog.addFoodEntry() to denormalize nutrition and recalculate totals
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
  const date = normalizeDateString(dateString);

  try {
    // getNutrition() first checks FoodNutrition cache and only calls GPT on a miss.
    // If lookup fails, we still save the entry so the log is not blocked by an API error.
    let nutritionDoc = null;
    try {
      nutritionDoc = await getNutrition(sourceType || null, sourceId || null, foodName, context);
    } catch (nutritionErr) {
      console.error('Nutrition fetch failed, saving entry without computed values:', nutritionErr);
    }

    const log = await getOrCreateLog(userId, date);
    await addFoodEntry(log, { foodName, sourceType, sourceId, nutrition: nutritionDoc, servings, mealType, timeLabel });
    res.json({ log });
  } catch (error) {
    console.error('Error adding entry:', error);
    res.status(500).json({ error: 'Failed to add entry' });
  }
};

/**
 * DELETE /schedule/entry/:entryId
 *
 * Legacy JSON deletion endpoint. Finds the FoodLog that owns the entry
 * subdocument, removes it, and returns the updated log as JSON.
 */
const removeEntry = async (req, res) => {
  const userId = req.session.userId;
  const { entryId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    return res.status(400).json({ error: 'Invalid entryId' });
  }

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
 * JSON endpoint - returns nutrition from cache or fetches and stores it first.
 * Useful when a client wants nutrition details without creating a FoodLog entry yet.
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
 * Form-based endpoints
 * --------------------
 * These power the current schedule UI. Instead of returning JSON and expecting
 * client-side rendering, they return full EJS pages for each step in the flow:
 * search -> select -> portion form -> add to log -> back to schedule.
 */

/**
 * POST /schedule/search-food
 * Body: { query, mealType, dateString }
 *
 * First step of the backend-first add-food flow.
 * Searches both local recipes and TheMealDB, then renders a page where the user
 * picks exactly one result to continue with.
 */
const searchFoodForm = async (req, res) => {
  const { query, mealType = 'Other', dateString: bodyDate } = req.body;
  const dateString = normalizeDateString(bodyDate);
  const errors = [];

  if (!query || !query.trim()) {
    errors.push('Enter a food name');
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(req.session.userId, dateString),
      getUserCalorieGoal(req.session.userId),
    ]);
    return renderSchedulePage(res, req, { log, dateString, calorieGoal, errors });
  }

  try {
    // The search page merges internal recipes with external MealDB results into one list.
    const [userRecipes, mealdbMeals] = await Promise.all([
      Recipe.searchRecipeTitles(query.trim()),
      fetchFromMealDB(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`),
    ]);

    // Each result carries enough metadata for the next form step to identify its source.
    const results = [
      ...userRecipes.map((r) => ({
        id: r._id.toString(),
        name: r.title,
        source: 'Community',
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

    if (results.length === 0) {
      return res.render('foodlog/search-results', {
        results: [],
        query: query.trim(),
        mealType,
        dateString,
        session: req.session,
      });
    }

    res.render('foodlog/search-results', { results, query: query.trim(), mealType, dateString, session: req.session });
  } catch (error) {
    console.error('Error searching food:', error);
    errors.push('Invalid search entry. Try again.');
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(req.session.userId, dateString),
      getUserCalorieGoal(req.session.userId),
    ]);
    renderSchedulePage(res, req, { log, dateString, calorieGoal, errors });
  }
};

/**
 * POST /schedule/select-food
 * Body: { results, selectedIndex, mealType, dateString }
 *
 * Second step of the backend-first flow.
 * Reads the selected search result back out of the submitted payload, fetches
 * nutrition if possible, and renders the serving-size form for final confirmation.
 */
const selectFoodForm = async (req, res) => {
  const { results, selectedIndex, mealType = 'Other', dateString: bodyDate } = req.body;
  const dateString = normalizeDateString(bodyDate);
  const errors = [];

  if (!results || selectedIndex === undefined || selectedIndex === null || selectedIndex === '') {
    errors.push('No food selected');
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(req.session.userId, dateString),
      getUserCalorieGoal(req.session.userId),
    ]);
    return renderSchedulePage(res, req, { log, dateString, calorieGoal, errors });
  }

  try {
    // The previous page serializes the result list into a hidden input so this
    // handler can reconstruct the exact selected item without re-running search.
    // Results body is a json string so need to parse it back into an array.
    const resultsArray = typeof results === 'string' ? JSON.parse(results) : results;
    const selectedFood = resultsArray[parseInt(selectedIndex)];

    if (!selectedFood) {
      throw new Error('Food not found in results');
    }

    // Nutrition is optional at this stage. The UI can still proceed and show
    // "Nutrition pending" if the shared lookup service fails.
    let nutrition = null;
    try {
      nutrition = await getNutrition(selectedFood.sourceType, selectedFood.sourceId, selectedFood.name, '');
    } catch (err) {
      console.error('Nutrition fetch failed:', err);
    }

    // This preview uses the per-100g values stored in FoodNutrition, not the
    // defaultServing amount that is later used for computed entry totals.
    const nutritionPreview = nutrition
      ? `~${Math.round(nutrition.nutrition?.calories || 0)} kcal · ${Math.round(nutrition.nutrition?.protein || 0)}g P`
      : 'Nutrition pending';

    res.render('foodlog/portion-form', {
      selectedFood,
      nutrition,
      mealType,
      dateString,
      nutritionPreview,
      session: req.session,
    });
  } catch (error) {
    console.error('Error selecting food:', error);
    errors.push('Food not found');
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(req.session.userId, dateString),
      getUserCalorieGoal(req.session.userId),
    ]);
    renderSchedulePage(res, req, { log, dateString, calorieGoal, errors });
  }
};

/**
 * POST /schedule/add-food
 * Body: { foodId, foodName, sourceType, sourceId, servings, mealType, timeLabel }
 *
 * Final step of the backend-first add-food flow.
 * Validates the submitted serving info, resolves nutrition if possible, writes
 * a FoodLog entry, then redirects back to the schedule page for that date.
 */
const addFoodPost = async (req, res) => {
  const { foodId, foodName, sourceType, sourceId, servings = 1, mealType = 'Other', timeLabel = '', dateString: bodyDate } = req.body;
  const userId = req.session.userId;
  const dateString = normalizeDateString(bodyDate);
  const errors = [];

  if (!foodName || !foodName.trim()) errors.push('Food required');
  if (!servings || isNaN(servings) || servings <= 0) errors.push('Valid servings required');

  if (errors.length > 0) {
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(userId, dateString),
      getUserCalorieGoal(userId),
    ]);
    return renderSchedulePage(res, req, { log, dateString, calorieGoal, errors });
  }

  try {
    const log = await getOrCreateLog(userId, dateString);

    // The entry can still be stored without nutrition; in that case the schedule
    // shows a pending state because addFoodEntry() has no nutrition snapshot to copy.
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

    res.redirect(`/schedule/${dateString}?added=1`);
  } catch (error) {
    console.error('Error adding entry:', error);
    errors.push('Failed to add entry');
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(userId, dateString),
      getUserCalorieGoal(userId),
    ]);
    renderSchedulePage(res, req, { log, dateString, calorieGoal, errors });
  }
};

/**
 * POST /schedule/delete-entry/:entryId
 *
 * Form-based delete path used by the schedule UI. It removes the embedded entry
 * subdocument and then redirects back to the same day's schedule page.
 */
const deleteEntryPost = async (req, res) => {
  const userId = req.session.userId;
  const { entryId } = req.params;
  const dateString = normalizeDateString(req.body.dateString);

  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    return res.status(400).send('Invalid entryId');
  }

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
  generateSuggestions,
  searchFood,
  addEntry,
  removeEntry,
  getNutritionData,
  searchFoodForm,
  selectFoodForm,
  addFoodPost,
  deleteEntryPost,
};
