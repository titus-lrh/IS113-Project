'use strict';

const {
  findBySourceId,
  findByFoodKey,
  createNutrition,
} = require('../models/foodNutrition-model');

/**
  Nutrition service

  rule:
  - try FoodNutrition first
  - if nothing is there, call GPT
  - save the result so the next request is faster
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
  Build the key we use when a food does not already come with a source ID.
  For custom text searches, this turns small name differences into one lookup key.
 */
function buildFoodKey(sourceType, sourceId, foodName) {
  if (sourceType === 'themealdb' && sourceId) return `themealdb-${sourceId}`;
  if (sourceType === 'user_recipe' && sourceId) return `recipe-${sourceId}`;
  return foodName.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
  Ask GPT for nutrition and parse the JSON it returns.
  Retries once if the first response cannot be parsed.
  We ask for values per 100g plus one default serving description.
 
  @param {string} foodName
  @param {string} [context] - optional context hint (e.g. ingredient list)
  @returns {{ calories, protein, carbs, fat, fiber, defaultServing: { amount, unit } }}
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
  Main entry point.
  Return a FoodNutrition document whether it came from the DB or from a fresh GPT lookup.

  @param {string|null} sourceType - 'themealdb' | 'user_recipe' | 'custom' | null
  @param {string|null} sourceId
  @param {string} foodName
  @param {string} [context]
  // returns instance of FoodNutritionModel.Document (specific day)
  @returns {Promise<import('../models/FoodNutrition').Document>}
 */
async function getNutrition(sourceType, sourceId, foodName, context = '') {
  const foodKey = buildFoodKey(sourceType, sourceId, foodName);

  // If the food comes from a known source, use that source ID first.
  // Otherwise fall back to the normalized text key.
  const existing = sourceId
    ? await findBySourceId(sourceType, sourceId)
    : await findByFoodKey(foodKey);
  if (existing) return existing;

  // Not in the DB yet, so fetch it once and save it for later.
  const nutrition = await fetchNutritionFromGPT(foodName, context);

  const doc = await createNutrition({
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
