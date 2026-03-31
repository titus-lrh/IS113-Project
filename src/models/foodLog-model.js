'use strict';

const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  entryId: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  timeLabel: String,
  mealType: {
    type: String,
    enum: ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack', 'Other'],
    default: 'Other',
  },
  food: {
    nutritionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodNutrition' },
    name: String,
    sourceType: String,
    sourceId: String,
  },
  servings: { type: Number, default: 1 },
  computed: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number,
  },
  // Stored on entry for self-contained calculation (populated at log time)
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
});

const foodLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  entries: [entrySchema],
  dailyTotals: {
    calories: { type: Number, default: 0 },
    protein:  { type: Number, default: 0 },
    carbs:    { type: Number, default: 0 },
    fat:      { type: Number, default: 0 },
  },
});

foodLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// ── Static methods ─────────────────────────────────────────────────────────

/**
 * Get or create a FoodLog for a given userId and date.
 */
foodLogSchema.statics.getOrCreateLog = async function (userId, date) {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00.000Z`);
  d.setUTCHours(0, 0, 0, 0);
  const midnight = d;

  return await this.findOneAndUpdate(
    { userId, date: midnight },
    { $setOnInsert: { userId, date: midnight, entries: [] } },
    { returnDocument: 'after', upsert: true }
  );
};

/**
 * Add a food entry to a log.
 * Builds entry object, denormalizes nutrition, and recalculates totals.
 */
foodLogSchema.statics.addFoodEntry = async function (log, entryData) {
  const entry = {
    timeLabel: entryData.timeLabel,
    mealType: entryData.mealType,
    food: {
      nutritionId: entryData.nutrition ? entryData.nutrition._id : undefined,
      name: entryData.foodName,
      sourceType: entryData.sourceType || 'custom',
      sourceId: entryData.sourceId || undefined,
    },
    servings: Number(entryData.servings) || 1,
  };

  if (entryData.nutrition) {
    entry.nutrition = entryData.nutrition.nutrition;
    entry.defaultServing = entryData.nutrition.defaultServing;
  }

  log.entries.push(entry);
  await log.calculateTotals();
  return log;
};

/**
 * Remove a food entry from a log by ID.
 * Filters out the entry and recalculates totals.
 */
foodLogSchema.statics.removeFoodEntry = async function (log, entryId) {
  log.entries = log.entries.filter((e) => e._id.toString() !== entryId);
  await log.calculateTotals();
  return log;
};

// Recalculates dailyTotals and per-entry computed values, then persists.
// Formula: (nutrition[field] / 100) * defaultServing.amount * servings
foodLogSchema.methods.calculateTotals = async function () {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  for (const entry of this.entries) {
    const n = entry.nutrition || {};
    const amount = (entry.defaultServing && entry.defaultServing.amount) || 100;
    const servings = entry.servings || 1;

    const entryComputed = {};
    for (const field of ['calories', 'protein', 'carbs', 'fat']) {
      const value = ((n[field] || 0) / 100) * amount * servings;
      entryComputed[field] = value;
      totals[field] += value;
    }

    entry.computed = { ...entryComputed };
  }

  this.dailyTotals = { ...totals };
  await this.save();
  return this;
};

module.exports = mongoose.model('FoodLog', foodLogSchema);
