'use strict';

const mongoose = require('mongoose');

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

// Unique compound index for deduplication.
// sparse: true allows multiple documents where sourceType/sourceId are absent
// (e.g. custom foods without an external source ID).
foodNutritionSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true, sparse: true });

// Text index for food search
foodNutritionSchema.index({ foodKey: 'text' });

// Static methods for DB operations
foodNutritionSchema.statics.findBySourceId = async function(sourceType, sourceId) {
  return this.findOne({ sourceType, sourceId });
};

foodNutritionSchema.statics.deleteBySourceId = async function(sourceType, sourceId) {
  return this.deleteOne({ sourceType, sourceId });
};

foodNutritionSchema.statics.createNutrition = async function(data) {
  return this.create(data);
};

module.exports = mongoose.model('FoodNutrition', foodNutritionSchema);
