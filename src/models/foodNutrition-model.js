'use strict';

const mongoose = require('mongoose');

/**
 * FoodNutrition model
 * -------------------
 * This collection stores saved nutrition lookups.
 *
 * Each document stores:
 * - a key we can look up later
 * - nutrition values per 100g
 * - one default serving size
 *
 * The schedule feature uses this when adding entries.
 * The suggestions feature uses it so repeated requests do not keep asking GPT.
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

// If a food comes from a known source, that sourceType + sourceId pair should be unique.
// sparse:true avoids collisions for custom foods that do not have a sourceId.
foodNutritionSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true, sparse: true });

// foodKey is the fallback unique key for custom / text-based foods.
foodNutritionSchema.index({ foodKey: 1 }, { unique: true });

// Lets us search by foodKey text if needed.
foodNutritionSchema.index({ foodKey: 'text' });

// Helper methods used by nutritionService.
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
