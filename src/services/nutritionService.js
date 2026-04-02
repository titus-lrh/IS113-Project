'use strict';

const FoodNutrition = require('../models/foodNutrition-model');

/**
 * Nutrition service
 * -----------------
 * This is the shared nutrition lookup layer used by both schedule entry creation
 * and suggestion generation.
 *
 * Lookup contract:
 * - If a food has a stable source identity (sourceType + sourceId), use that first.
 * - Otherwise, use a normalized text key derived from the food name.
 * - On a cache miss, call GPT, then store the normalized result in FoodNutrition.
 * - Return the FoodNutrition document so callers can reuse both per-100g nutrition
 *   and default serving metadata.
 */
const GPT_SYSTEM_PROMPT = `You are a precise nutrition database. Given a food item, return ONLY a JSON object with these exact fields:
{
  "calories": <kcal per 100g>,
  "protein": <grams per 100g>,
  "carbs": <grams per 100g>,
  "fat": <grams per 100g>,
  "fiber": <grams per 100g or 0 if unknown>,
  "defaultServing": { "amount": <number>, "unit": "<g|ml|cup|piece|slice|tbsp>" }
}
Base values on standard nutritional databases (USDA). No preamble, no markdown, JSON only.`;

/**
 * Normalize a food name into a consistent cache key.
 * For keyed sources (themealdb, user_recipe), the key encodes the sourceType + sourceId.
 * For custom/text lookups, it's just the lowercased, trimmed food name.
 *
 * The returned key is only used for storage / lookup. Callers still keep the
 * human-readable food name separately on FoodNutrition and FoodLog entries.
 */
function buildFoodKey(sourceType, sourceId, foodName) {
  if (sourceType === 'themealdb' && sourceId) return `themealdb-${sourceId}`;
  if (sourceType === 'user_recipe' && sourceId) return `recipe-${sourceId}`;
  return foodName.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Call GPT-4o-mini and parse the nutrition JSON.
 * Retries once if the first response cannot be parsed.
 * The model is asked for values per 100g plus one default serving description.
 *
 * @param {string} foodName
 * @param {string} [context] - optional context hint (e.g. ingredient list)
 * @returns {{ calories, protein, carbs, fat, fiber, defaultServing: { amount, unit } }}
 */
async function fetchNutritionFromGPT(foodName, context = '') {
  const userContent = context ? `${foodName}. ${context}` : foodName;

  async function callGPT() {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env['GPT-SECRET']}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: GPT_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(err)}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  let raw;
  try {
    raw = await callGPT();
    return JSON.parse(raw);
  } catch (firstErr) {
    // Retry once on parse failure (not on HTTP error — that already throws above)
    if (firstErr instanceof SyntaxError) {
      try {
        raw = await callGPT();
        return JSON.parse(raw);
      } catch (secondErr) {
        throw new Error(`GPT nutrition parse failed after retry: ${secondErr.message}`);
      }
    }
    throw firstErr;
  }
}

/**
 * Main entry point — check FoodNutrition cache first, call GPT only on miss.
 * Saves new document to DB if GPT is called.
 * Callers receive the stored FoodNutrition document either way, so downstream
 * code has one consistent shape to read from.
 *
 * @param {string|null} sourceType - 'themealdb' | 'user_recipe' | 'custom' | null
 * @param {string|null} sourceId
 * @param {string} foodName
 * @param {string} [context]
 * @returns {Promise<import('../models/FoodNutrition').Document>}
 */
async function getNutrition(sourceType, sourceId, foodName, context = '') {
  const foodKey = buildFoodKey(sourceType, sourceId, foodName);

  // Stable external IDs win because they let the app treat renamed but identical
  // foods as the same cached record. Free-text foods fall back to foodKey matching.
  const existing = sourceId
    ? await FoodNutrition.findBySourceId(sourceType, sourceId)
    : await FoodNutrition.findByFoodKey(foodKey);
  if (existing) return existing;

  // Cache miss: fetch normalized nutrition once, then persist it for future reuse
  // by both the schedule feature and the suggestion engine.
  const nutrition = await fetchNutritionFromGPT(foodName, context);

  const doc = await FoodNutrition.createNutrition({
    foodKey,
    name: foodName.trim(),
    sourceType: sourceType || 'custom',
    sourceId: sourceId || undefined,
    nutrition: {
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      fiber: nutrition.fiber,
    },
    defaultServing: nutrition.defaultServing,
    aiGenerated: true,
  });

  return doc;
}

module.exports = { fetchNutritionFromGPT, getNutrition };
