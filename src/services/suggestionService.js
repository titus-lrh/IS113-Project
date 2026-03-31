'use strict';

const Recipe = require('../models/recipe-model');
const FoodNutrition = require('../models/foodNutrition-model');
const { getNutrition } = require('./nutritionService');

// ── TheMealDB categories we pull from (free bulk endpoint, no API key needed)
const MEALDB_CATEGORIES = ['Chicken', 'Beef', 'Seafood', 'Vegetarian', 'Pasta', 'Dessert'];
const MEALDB_CACHE_TTL_MS = 10 * 60 * 1000;
let mealDbCandidateCache = { items: [], expiresAt: 0 };

/**
 * gatherCandidates()
 * ------------------
 * Fetches candidate foods from TWO sources:
 *   1. Community recipes (MongoDB) — all user-uploaded recipes
 *   2. TheMealDB /filter.php?c=<category> — returns ~20 meals per category
 *
 * Returns a flat array of { name, sourceType, sourceId } objects.
 * Each candidate is a "potential suggestion" — we don't know calories yet.
 *
 * WHY these two sources? The user constraint says suggestions must come
 * from real recipes, not GPT-invented food names.
 */
async function gatherCandidates() {
  // 1. Community recipes from MongoDB
  const userRecipes = await Recipe.getRecipeSuggestionCandidates();
  const recipeCandidates = userRecipes.map(r => ({
    name: r.title,
    sourceType: 'user_recipe',
    sourceId: r._id.toString(),
  }));

  // 2. TheMealDB — fetch multiple categories in parallel
  //    Each category URL returns { meals: [{ strMeal, idMeal, ... }] }
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
      // If one category fails, don't break the whole thing
      return [];
    }
  });

  const mealdbArrays = await Promise.all(categoryFetches);
  // .flat() merges [ [a,b], [c,d] ] into [a,b,c,d]
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
 * Given an array of candidates, checks which ones already have nutrition
 * data in the FoodNutrition collection (our cache).
 *
 * Uses a single MongoDB $or query instead of N individual queries.
 * WHY? If we have 60 candidates, doing 60 separate findOne() calls would
 * be slow. One $or query with 60 conditions is much faster.
 *
 * Returns: { cached: [...], uncached: [...] }
 *   - cached items have a .nutritionDoc attached (the full FoodNutrition document)
 *   - uncached items are candidates with no cache entry yet
 */
async function batchCheckCache(candidates) {
  if (candidates.length === 0) return { cached: [], uncached: [] };

  // Build one big $or query: "find any FoodNutrition doc matching any of these"
  const orConditions = candidates.map(c => ({
    sourceType: c.sourceType,
    sourceId: c.sourceId,
  }));

  // This returns all FoodNutrition docs that match ANY candidate
  const cachedDocs = await FoodNutrition.find({ $or: orConditions });

  // Build a lookup map: "themealdb-52772" => nutritionDoc
  const cacheMap = new Map();
  for (const doc of cachedDocs) {
    const key = `${doc.sourceType}-${doc.sourceId}`;
    cacheMap.set(key, doc);
  }

  // Split candidates into cached vs uncached
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
 * Given a FoodNutrition document, calculates the calories for ONE default serving.
 *
 * Formula (same as FoodLog.calculateTotals):
 *   (nutrition.calories / 100) * defaultServing.amount * 1 serving
 *
 * WHY divide by 100? Because nutrition values are stored "per 100g".
 * The defaultServing.amount tells us how many grams one serving actually is.
 * Example: rice is 130 kcal/100g, default serving 200g => 260 kcal per serving.
 */
function calcCaloriesForServing(nutritionDoc) {
  const cal = (nutritionDoc.nutrition && nutritionDoc.nutrition.calories) || 0;
  const amount = (nutritionDoc.defaultServing && nutritionDoc.defaultServing.amount) || 100;
  return (cal / 100) * amount;
}

/**
 * getSuggestions(remainingCalories)
 * ---------------------------------
 * The main orchestrator. Steps:
 *
 * 1. Gather ~60+ candidates from community recipes + TheMealDB
 * 2. Batch-check which candidates are already in the FoodNutrition cache
 * 3. Filter cached items that fit within remainingCalories
 * 4. If we have 5+ cached suggestions => done! Zero GPT cost.
 * 5. If not enough => enrich uncached items one-by-one (calling GPT),
 *    stopping as soon as we have 5 total suggestions (adaptive enrichment)
 * 6. Rank by how well they fill the calorie gap (closest to remaining without exceeding)
 * 7. Return top 5
 *
 * COST LOGIC: On a fresh deployment, most items are uncached, so we'd need
 * GPT calls. But we cap enrichment at 10 GPT calls max per request.
 * Over time, the cache fills up and GPT calls drop to zero.
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

  // Step 3: Filter cached items that fit within remaining calories
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

  // Step 5: Adaptive enrichment — enrich uncached items until we have enough
  //   Shuffle uncached so we get variety each time (not always the same first 10)
  const shuffled = shuffleArray(uncached);
  const enriched = [...fittingFromCache];
  let gptCalls = 0;

  for (const item of shuffled) {
    if (enriched.length >= TARGET_COUNT || gptCalls >= MAX_GPT_CALLS) break;

    try {
      // getNutrition() will call GPT and cache the result for next time
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
      // If GPT fails for one item, skip it and continue
      gptCalls++;
    }
  }

  // Step 6 & 7: Rank and return top 5
  return rankAndReturn(enriched, remainingCalories, TARGET_COUNT);
}

// ── helpers ──────────────────────────────────────────────────────

/**
 * Rank suggestions by how well they fill the remaining gap.
 * Best fit = calories closest to remainingCalories (fills the most without exceeding).
 */
function rankAndReturn(items, remainingCalories, count) {
  const sorted = [...items].sort((a, b) => {
    // Closer to remainingCalories = better (descending by calories, since all are <= remaining)
    return b.calories - a.calories;
  });
  return sorted.slice(0, count);
}

/**
 * Fisher-Yates shuffle — returns a new shuffled array (does not mutate original).
 * WHY shuffle? So uncached enrichment picks different items each page load,
 * giving the user variety and gradually filling the cache across requests.
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
    const key = `${candidate.sourceType}:${candidate.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { getSuggestions };
