'use strict';

const Recipe = require('../models/recipe-model');
const FoodNutrition = require('../models/foodNutrition-model');
const { getNutrition } = require('./nutritionService');

/**
 * Suggestion service
 * ------------------
 * Pick foods that fit within the user's remaining calories.
 *
 * We first try foods that already have nutrition saved in FoodNutrition.
 * If that is not enough, we try a few uncached foods and save their nutrition
 * so the next request is faster.
 */

// TheMealDB categories used to build a reusable suggestion pool.
const MEALDB_CATEGORIES = ['Chicken', 'Beef', 'Seafood', 'Vegetarian', 'Pasta', 'Dessert'];
const MEALDB_CACHE_TTL_MS = 10 * 60 * 1000;
let mealDbCandidateCache = { items: [], expiresAt: 0 };

/**
 * gatherCandidates()
 * ------------------
 * Build one combined list of foods we can suggest.
 *
 * Each item looks like:
 * { name, sourceType, sourceId }
 *
 * We only use real recipes from our DB and TheMealDB.
 */
async function gatherCandidates() {
  // The model already limits how many recipe candidates come back.
  const userRecipes = await Recipe.getRecipeSuggestionCandidates();
  const recipeCandidates = userRecipes.map(r => ({
    name: r.title,
    sourceType: 'user_recipe',
    sourceId: r._id.toString(),
  }));

  // Reuse the MealDB candidate list for a while so repeated clicks do not keep
  // hitting the MealDB API.
  const now = Date.now();
  if (mealDbCandidateCache.expiresAt > now) {
    return dedupeCandidates([...recipeCandidates, ...mealDbCandidateCache.items]);
  }

  const categoryFetches = MEALDB_CATEGORIES.map(async (cat) => {
    try {
      const res = await fetch(
        `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(cat)}`
      );
      const data = await res.json();
      return (data.meals || []).map(m => ({
        name: m.strMeal,
        sourceType: 'themealdb',
        sourceId: m.idMeal,
      }));
    } catch {
      // Skip failed categories instead of failing the whole suggestions request.
      return [];
    }
  });

  const mealdbArrays = await Promise.all(categoryFetches);
  // Promise.all gives us an array of arrays, so flatten it into one list.
  const mealdbCandidates = mealdbArrays.flat();
  mealDbCandidateCache = {
    items: mealdbCandidates,
    expiresAt: now + MEALDB_CACHE_TTL_MS,
  };

  return dedupeCandidates([...recipeCandidates, ...mealdbCandidates]);
}

/**
 * batchCheckCache(candidates)
 * ---------------------------
 * Split the candidate list into:
 * - cached: we already have nutrition for this food
 * - uncached: we still need to look nutrition up
 *
 * We do one Mongo query for all candidates instead of one query per food.
 *
 * Example:
 * input:  [{ sourceType: 'themealdb', sourceId: '1' }, { sourceType: 'themealdb', sourceId: '2' }]
 * output: { cached: [...with nutritionDoc], uncached: [...without nutritionDoc] }
 */
async function batchCheckCache(candidates) {
  if (candidates.length === 0) return { cached: [], uncached: [] };

  // Turn each candidate into one Mongo match condition.
  // Example:
  // [{ sourceType: 'themealdb', sourceId: '1' }, { sourceType: 'user_recipe', sourceId: 'abc' }]
  const orConditions = candidates.map(c => ({
    sourceType: c.sourceType,
    sourceId: c.sourceId,
  }));

  // Find any FoodNutrition doc that matches any candidate in the list.
  const cachedDocs = await FoodNutrition.find({ $or: orConditions });

  // Build a quick lookup so we can answer:
  // "for this candidate, do we already have a nutrition doc?"
  const cacheMap = new Map();
  for (const doc of cachedDocs) {
    const key = `${doc.sourceType}-${doc.sourceId}`;
    cacheMap.set(key, doc);
  }

  // Walk the original candidate list and put each item in one bucket.
  const cached = [];
  const uncached = [];

  for (const candidate of candidates) {
    const key = `${candidate.sourceType}-${candidate.sourceId}`;
    const doc = cacheMap.get(key);
    if (doc) {
      cached.push({ ...candidate, nutritionDoc: doc });
    } else {
      uncached.push(candidate);
    }
  }

  return { cached, uncached };
}

/**
 * calcCaloriesForServing(nutritionDoc)
 * -------------------------------------
 * Convert a FoodNutrition doc into calories for one default serving.
 *
 * Same formula used in FoodLog totals:
 *   (nutrition.calories / 100) * defaultServing.amount * 1 serving
 *
 * Example:
 * 130 kcal per 100g, default serving 200g -> 260 kcal for one serving
 */
function calcCaloriesForServing(nutritionDoc) {
  const cal = (nutritionDoc.nutrition && nutritionDoc.nutrition.calories) || 0;
  const amount = (nutritionDoc.defaultServing && nutritionDoc.defaultServing.amount) || 100;
  return (cal / 100) * amount;
}

/**
 * getSuggestions(remainingCalories)
 * ---------------------------------
 * Main suggestions flow.
 *
 * First use foods that already have nutrition saved.
 * If that is not enough, try uncached foods one by one until we have enough
 * results or hit the GPT-call limit.
 *
 * @param {number} remainingCalories - calorieGoal minus dailyTotals.calories
 * @returns {Array<{ name, sourceType, sourceId, calories }>} top 5 suggestions
 */
async function getSuggestions(remainingCalories, { skipEnrichment = false } = {}) {
  const TARGET_COUNT = 5;
  const MAX_GPT_CALLS = 10;

  // If user is already over their goal, no suggestions
  if (remainingCalories <= 0) return [];

  // Step 1: Gather all candidates
  const candidates = await gatherCandidates();
  if (candidates.length === 0) return [];

  // Step 2: Batch-check cache
  const { cached, uncached } = await batchCheckCache(candidates);

  // Turn cached items into actual suggestion rows, then keep only the ones
  // that fit in the user's remaining calories.
  const fittingFromCache = cached
    .map(item => ({
      name: item.name,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      calories: Math.round(calcCaloriesForServing(item.nutritionDoc)),
    }))
    .filter(item => item.calories > 0 && item.calories <= remainingCalories);

  // Step 4: Do we have enough from cache alone, or enrichment is disabled?
  if (fittingFromCache.length >= TARGET_COUNT || skipEnrichment) {
    return rankAndReturn(fittingFromCache, remainingCalories, TARGET_COUNT);
  }

  // Shuffle uncached items so repeated requests do not always try the same foods first.
  const shuffled = shuffleArray(uncached);
  const enriched = [...fittingFromCache];
  let gptCalls = 0;

  for (const item of shuffled) {
    if (enriched.length >= TARGET_COUNT || gptCalls >= MAX_GPT_CALLS) break;

    try {
      // getNutrition() checks FoodNutrition first and only calls GPT if needed.
      // If this succeeds, the result is also saved for later requests.
      const doc = await getNutrition(item.sourceType, item.sourceId, item.name, '');
      const cal = Math.round(calcCaloriesForServing(doc));
      gptCalls++;

      if (cal > 0 && cal <= remainingCalories) {
        enriched.push({
          name: item.name,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          calories: cal,
        });
      }
    } catch {
      // If one lookup fails, skip it and keep trying the next item.
      gptCalls++;
    }
  }

  return rankAndReturn(enriched, remainingCalories, TARGET_COUNT);
}

// ── helpers ──────────────────────────────────────────────────────

/**
 * Pick the highest-calorie items from the foods that already fit the budget.
 */
function rankAndReturn(items, remainingCalories, count) {
  const sorted = [...items].sort((a, b) => {
    // At this point every item is already <= remainingCalories,
    // so sorting high to low means "fill the gap as much as possible."
    return b.calories - a.calories;
  });
  return sorted.slice(0, count);
}

/**
 * Return a shuffled copy of the array.
 * We do this so uncached foods get tried in a different order between requests.
 */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    // Use sourceType + sourceId as the "have we seen this already?" key.
    // filter() keeps items when we return true and removes them when we return false.
    const key = `${candidate.sourceType}:${candidate.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { getSuggestions };
