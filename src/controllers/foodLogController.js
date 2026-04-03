'use strict';

/**
  Food log controller
  This file runs the schedule feature from start to finish:
  1. Load a day's FoodLog document (or create one if it does not exist yet)
  2. Let the user search for food from community recipes and TheMealDB
  3. Resolve nutrition through the shared nutrition service
  4. Save entries onto the FoodLog document
  5. Render the schedule view with grouped entries, totals, and suggestions
 */
const mongoose = require('mongoose');
const {
  FoodLogModel,
  getOrCreateLog,
  addFoodEntry,
  removeFoodEntry,
} = require('../models/foodLog-model');
const Recipe = require('../models/recipe-model');
const User = require('../models/user-model');
const { getNutrition } = require('../services/nutritionService');
const { getSuggestions } = require('../services/suggestionService');

// ── helpers

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function parseResultsBody(results) {
  if (Array.isArray(results)) {
    return results;
  }

  if (typeof results !== 'string') {
    return [];
  }

  return JSON.parse(results);
}

function hasSelectedIndex(selectedIndex) {
  return selectedIndex !== undefined && selectedIndex !== null && selectedIndex !== '';
}

function normalizeFoodName(foodName) {
  if (typeof foodName !== 'string') {
    return '';
  }

  return foodName.trim();
}

function isValidServings(servings) {
  const servingsNumber = Number(servings);
  return !Number.isNaN(servingsNumber) && servingsNumber > 0;
}

function getPerServingNutritionPreview(nutritionDoc) {
  if (!nutritionDoc) {
    return 'Nutrition pending';
  }

  const nutrition = nutritionDoc.nutrition || {};
  const defaultServing = nutritionDoc.defaultServing || {};
  const servingAmount = defaultServing.amount || 100;
  const servingUnit = defaultServing.unit || 'g';
  const calories = ((nutrition.calories || 0) / 100) * servingAmount;
  const protein = ((nutrition.protein || 0) / 100) * servingAmount;

  return `~${Math.round(calories)} kcal · ${Math.round(protein)}g P per serving (${servingAmount}${servingUnit})`;
}

/**
  - Normalize a date string into the schedule's expected YYYY-MM-DD format.
  Invalid or missing dates fall back to "today" so the rest of the code
  always works with one predictable date format.
 */
function normalizeDateString(input) {
  const today = getTodayDateString();

  if (typeof input !== 'string') return today;
  if (!input) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return today;

  const parsed = Date.parse(`${input}T00:00:00Z`);
  return Number.isNaN(parsed) ? today : input;
}

/**
  - TheMealDB returns `null` when there are no meals.
  This helper always gives the controller an array instead.
 */
async function fetchFromMealDB(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data.meals || [];
}

/**
  - Read the user's calorie goal from the profile document.
  Schedule rendering and suggestion generation both use the same fallback of
  3000 kcal when the user record or the specific field is missing.
 */
async function getUserCalorieGoal(userId) {
  const user = await User.findByUserId(userId);
  return user ? user.calorieGoal || 3000 : 3000;
}

function getGroupedEntries(logEntries, mealOrder) {
  const groupedEntries = {};

  mealOrder.forEach((mealType) => {
    groupedEntries[mealType] = { entries: [], calories: 0 };
  });

  (logEntries || []).forEach((entry) => {
    const mealType = entry.mealType || 'Other';

    if (!groupedEntries[mealType]) {
      groupedEntries[mealType] = { entries: [], calories: 0 };
    }

    groupedEntries[mealType].entries.push(entry);
    groupedEntries[mealType].calories += entry.computed?.calories || 0;
  });

  return groupedEntries;
}

function getScheduleDisplayLabel(dateString, today, currentDate) {
  if (dateString === today) {
    return 'Today';
  }

  return currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function renderSchedulePage(res, req, { log, dateString, calorieGoal, errors = [], suggestions = [] }) {
  const totals = log.dailyTotals || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const remainingCalories = calorieGoal - (totals.calories || 0);
  const mealOrder = ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack', 'Other'];
  const groupedEntries = getGroupedEntries(log.entries, mealOrder);

  const today = getTodayDateString();
  const current = new Date(`${dateString}T00:00:00Z`);
  const prevDate = new Date(current);
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const nextDate = new Date(current);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  return res.render('foodlog/schedule', {
    log,
    dateString,
    errors,
    suggestions,
    session: req.session,
    calorieGoal,
    remainingCalories,
    mealOrder,
    groupedEntries,
    prevStr: prevDate.toISOString().slice(0, 10),
    nextStr: nextDate.toISOString().slice(0, 10),
    displayLabel: getScheduleDisplayLabel(dateString, today, current),
    page: 'schedule',
  });
}

async function renderScheduleWithErrors(req, res, dateString, errors) {
  const userId = req.session.userId;
  const [log, calorieGoal] = await Promise.all([
    getOrCreateLog(userId, dateString),
    getUserCalorieGoal(userId),
  ]);

  return renderSchedulePage(res, req, { log, dateString, calorieGoal, errors });
}

// ── controllers ────────────────────────────────────────────────────────────

/**
  GET /schedule
  GET /schedule/:dateString  (YYYY-MM-DD)

  Main schedule page. Ensures the user has a FoodLog document for the requested
  day, loads the user's calorie goal, then renders the timeline view.
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
  POST /schedule/generate-suggestions
  Body: { dateString }

  Loads the current day's log, computes remaining calories from the same
  helper used by the page, then asks suggestionService for foods
  that fit within that remaining budget.
 */
const generateSuggestions = async (req, res) => {
  const dateString = normalizeDateString(req.body.dateString || req.params.dateString);
  const userId = req.session.userId;

  try {
    const [log, calorieGoal] = await Promise.all([
      getOrCreateLog(userId, dateString),
      getUserCalorieGoal(userId),
    ]);
    const totals = log.dailyTotals || { calories: 0 };
    const remainingCalories = calorieGoal - (totals.calories || 0);
    const suggestions = await getSuggestions(remainingCalories);
    renderSchedulePage(res, req, { log, dateString, calorieGoal, suggestions });
  } catch (error) {
    console.error('Error loading suggestions:', error);
    res.status(500).send('Failed to load suggestions');
  }
};

/**
  Schedule form flow
  search - select - portion form - add to log - back to schedule.
 */

/**
  POST /schedule/search-food
  Body: { query, mealType, dateString }

  First step of the backend-first add-food flow.
  Searches both local recipes and TheMealDB, then renders a page where the user
  picks exactly one result to continue with.
 */
const searchFoodForm = async (req, res) => {
  const { query, mealType = 'Other', dateString: bodyDate } = req.body;
  const dateString = normalizeDateString(bodyDate);
  const errors = [];
  const normalizedQuery = normalizeFoodName(query);

  if (!normalizedQuery) {
    errors.push('Enter a food name');
    return renderScheduleWithErrors(req, res, dateString, errors);
  }

  try {
    // The search page merges internal recipes with external MealDB results into one list.
    const [userRecipes, mealdbMeals] = await Promise.all([
      Recipe.searchRecipeTitles(normalizedQuery),
      fetchFromMealDB(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(normalizedQuery)}`),
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
        query: normalizedQuery,
        mealType,
        dateString,
        session: req.session,
      });
    }

    res.render('foodlog/search-results', { results, query: normalizedQuery, mealType, dateString, session: req.session });
  } catch (error) {
    console.error('Error searching food:', error);
    errors.push('Invalid search entry. Try again.');
    return renderScheduleWithErrors(req, res, dateString, errors);
  }
};

/**
  POST /schedule/select-food
  Body: { results, selectedIndex, mealType, dateString }

  Second step of the backend-first flow.
  Reads the selected search result back out of the submitted payload, fetches
  nutrition if possible, and renders the serving-size form for final confirmation.
 */
const selectFoodForm = async (req, res) => {
  const { results, selectedIndex, mealType = 'Other', dateString: bodyDate } = req.body;
  const dateString = normalizeDateString(bodyDate);
  const errors = [];

  if (!results || !hasSelectedIndex(selectedIndex)) {
    errors.push('No food selected');
    return renderScheduleWithErrors(req, res, dateString, errors);
  }

  try {
    const resultsArray = parseResultsBody(results);
    const selectedIndexNumber = Number.parseInt(selectedIndex, 10);
    const selectedFood = resultsArray[selectedIndexNumber];

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

    const nutritionPreview = getPerServingNutritionPreview(nutrition);

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
    return renderScheduleWithErrors(req, res, dateString, errors);
  }
};

/**
  POST /schedule/add-food
  Body: { foodName, sourceType, sourceId, servings, mealType, timeLabel }

  Final step of the backend-first add-food flow.
  Validates the submitted serving info, resolves nutrition if possible, writes
  a FoodLog entry, then redirects back to the schedule page for that date.
 */
const addFoodPost = async (req, res) => {
  const { foodName, sourceType, sourceId, servings = 1, mealType = 'Other', timeLabel = '', dateString: bodyDate } = req.body;
  const userId = req.session.userId;
  const dateString = normalizeDateString(bodyDate);
  const errors = [];
  const normalizedFoodName = normalizeFoodName(foodName);
  const servingsNumber = Number(servings);

  if (!normalizedFoodName) {
    errors.push('Food required');
  }

  if (!isValidServings(servings)) {
    errors.push('Valid servings required');
  }

  if (errors.length > 0) {
    return renderScheduleWithErrors(req, res, dateString, errors);
  }

  try {
    const log = await getOrCreateLog(userId, dateString);

    // The entry can still be stored without nutrition; in that case the schedule
    // shows a pending state because addFoodEntry() has no nutrition to copy.
    let nutritionDoc = null;
    try {
      nutritionDoc = await getNutrition(sourceType || null, sourceId || null, normalizedFoodName, '');
    } catch (err) {
      console.error('Nutrition fetch failed:', err);
    }

    await addFoodEntry(log, {
      foodName: normalizedFoodName,
      sourceType: sourceType || 'custom',
      sourceId: sourceId || '',
      nutrition: nutritionDoc,
      servings: servingsNumber,
      mealType,
      timeLabel,
    });

    res.redirect(`/schedule/${dateString}?added=1`);
  } catch (error) {
    console.error('Error adding entry:', error);
    errors.push('Failed to add entry');
    return renderScheduleWithErrors(req, res, dateString, errors);
  }
};

/**
  POST /schedule/delete-entry/:entryId

  delete path used by the schedule UI. 
 */
const deleteEntryPost = async (req, res) => {
  const userId = req.session.userId;
  const { entryId } = req.params;
  const dateString = normalizeDateString(req.body.dateString);

  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    return res.status(400).send('Invalid entryId');
  }

  try {
    const log = await FoodLogModel.findOne({
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
  searchFoodForm,
  selectFoodForm,
  addFoodPost,
  deleteEntryPost,
};
