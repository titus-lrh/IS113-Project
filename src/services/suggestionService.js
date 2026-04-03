'use strict';

const { FoodNutritionModel } = require('../models/foodNutrition-model');

/**
  Pick foods that already exist in FoodNutrition and fit within the user's
  remaining calories.
 */

function calcCaloriesForServing(nutritionDoc) {
  const nutrition = nutritionDoc.nutrition || {};
  const defaultServing = nutritionDoc.defaultServing || {};
  const caloriesPer100g = nutrition.calories || 0;
  const servingAmount = defaultServing.amount || 100;

  return (caloriesPer100g / 100) * servingAmount;
}

async function getSuggestions(remainingCalories, _options = {}) {
  const TARGET_COUNT = 5;

  if (remainingCalories <= 0) {
    return [];
  }

  const nutritionDocs = await FoodNutritionModel.find(
    {},
    'name sourceType sourceId nutrition defaultServing'
  ).lean();

  const matchingItems = [];

  for (const nutritionDoc of nutritionDocs) {
    const name = (nutritionDoc.name || '').trim();
    if (!name) {
      continue;
    }

    const calories = Math.round(calcCaloriesForServing(nutritionDoc));
    if (calories <= 0) {
      continue;
    }

    if (calories > remainingCalories) {
      continue;
    }

    matchingItems.push({
      name,
      sourceType: nutritionDoc.sourceType || 'custom',
      sourceId: nutritionDoc.sourceId || '',
      calories,
    });
  }

  matchingItems.sort((a, b) => b.calories - a.calories);
  return matchingItems.slice(0, TARGET_COUNT);
}

module.exports = { getSuggestions };
