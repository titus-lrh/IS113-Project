'use strict';

const mongoose = require('mongoose');

/**
 * FoodNutrition model
 * -------------------
 * This collection is the shared nutrition cache for the app.
 *
 * Each document stores:
 * - a lookup identity (foodKey, and optionally sourceType + sourceId)
 * - normalized nutrition values per 100g
 * - one default serving description used by FoodLog total calculations
 *
 * The schedule feature uses this cache when adding entries, and the suggestion
 * service uses it to avoid repeated GPT enrichment for candidate foods.
 */
const foodNutritionSchema = new mongoose.Schema({
  foodKey: {
    type: String,
    required: true,
  },
  name: String,
  sourceType: {
    type: String,
    enum: ['themealdb', 'user_recipe', 'custom'],
  },
  sourceId: String,
  nutrition: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number, 
    fiber: Number,
  },
  defaultServing: {
    amount: Number,
    unit: String,
  },
  aiGenerated: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Documents with a stable external/source identity should be unique on that pair.
// sparse:true means custom foods without sourceId do not all collide on null values.
foodNutritionSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true, sparse: true });

// foodKey is the fallback unique identity for free-text foods and also the
// normalized cache key stored on every document.
foodNutritionSchema.index({ foodKey: 1 }, { unique: true });

// Supports text-based lookup / exploration on normalized food keys.
foodNutritionSchema.index({ foodKey: 'text' });

// Lookup helpers used by nutritionService's cache contract.
// - findBySourceId() is for foods with stable source identity
// - findByFoodKey() is for custom / text-only foods
// - deleteBySourceId() is used when a recipe's nutrition cache should be refreshed
// - createNutrition() inserts the normalized cache record
foodNutritionSchema.statics.findBySourceId = async function(sourceType, sourceId) {
  return this.findOne({ sourceType, sourceId });
};

foodNutritionSchema.statics.findByFoodKey = async function(foodKey) {
  return this.findOne({ foodKey });
};

foodNutritionSchema.statics.deleteBySourceId = async function(sourceType, sourceId) {
  return this.deleteOne({ sourceType, sourceId });
};

foodNutritionSchema.statics.createNutrition = async function(data) {
  return this.create(data);
};

module.exports = mongoose.model('FoodNutrition', foodNutritionSchema);
