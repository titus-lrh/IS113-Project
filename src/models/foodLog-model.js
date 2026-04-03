'use strict';

const mongoose = require('mongoose');

function getComputedValue(baseValue, amount, servings) {
  return ((baseValue || 0) / 100) * amount * servings;
}

/**
  FoodLog model

  A FoodLog stores one user's entries for one calendar day (UTC midnight).

  Nutrition is copied onto each entry instead of only storing a reference because:
  - the schedule page needs fast read-time totals without extra joins
  - totals should stay stable even if the shared FoodNutrition cache changes later
  - each entry remains self-contained for rendering and recalculation
 */
const entrySchema = new mongoose.Schema({
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
  // nutrition stores the copied base values from FoodNutrition.
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

// One user can only have one FoodLog per UTC day.
foodLogSchema.index({ userId: 1, date: 1 }, { unique: true });

const FoodLogModel = mongoose.model('FoodLog', foodLogSchema);

/**
 * Recalculate per-entry computed values and the document's dailyTotals, then save.
 *
 * Formula:
 *   (nutrition[field] / 100) * defaultServing.amount * servings
 *
 * Example:
 * 130 calories per 100g, serving size 200g, servings 2
 * = (130 / 100) * 200 * 2 = 520 calories
 */
async function calculateTotals(log) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  for (const entry of log.entries) {
    const n = entry.nutrition || {};
    const amount = (entry.defaultServing && entry.defaultServing.amount) || 100;
    const servings = entry.servings || 1;

    const entryComputed = {};
    for (const field of ['calories', 'protein', 'carbs', 'fat']) {
      const value = getComputedValue(n[field], amount, servings);
      entryComputed[field] = value;
      totals[field] += value;
    }

    // computed stores the actual values for this entry after serving math.
    entry.computed = { ...entryComputed };
  }

  log.dailyTotals = { ...totals };
  await log.save();
  return log;
}

/**
  Get or create a FoodLog for a given userId and date.
  Convert the date to UTC midnight first so every request for the same day
  points at the same FoodLog document.
 */
exports.getOrCreateLog = async function (userId, date) {
  let normalizedDate;

  if (date instanceof Date) {
    normalizedDate = new Date(date);
  } else {
    normalizedDate = new Date(`${date}T00:00:00.000Z`);
  }

  normalizedDate.setUTCHours(0, 0, 0, 0);

  return FoodLogModel.findOneAndUpdate(
    { userId, date: normalizedDate },
    { $setOnInsert: { userId, date: normalizedDate, entries: [] } },
    { returnDocument: 'after', upsert: true }
  );
};

/**
  Add a food entry to a log.
  Build the entry object, copy nutrition onto it if we have it,
  then recalculate the day's totals.
 */
exports.addFoodEntry = async function (log, entryData) {
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
  return exports.calculateTotals(log);
};

/**
 * Remove a food entry from a log by ID.
 * The controller passes the embedded entry's _id here, not entryId.
 * After removal, totals are recomputed from the remaining entries.
 */
exports.removeFoodEntry = async function (log, entryId) {
  log.entries = log.entries.filter((entry) => entry._id.toString() !== entryId);
  return exports.calculateTotals(log);
};

exports.calculateTotals = calculateTotals;
exports.FoodLogModel = FoodLogModel;
