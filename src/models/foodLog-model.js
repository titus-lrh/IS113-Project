'use strict';

const mongoose = require('mongoose');

/**
 * FoodLog model
 * -------------
 * A FoodLog stores one user's entries for one calendar day (UTC midnight).
 *
 * Why nutrition is copied onto each entry instead of only storing a reference:
 * - the schedule page needs fast read-time totals without extra joins
 * - totals should stay stable even if the shared FoodNutrition cache changes later
 * - each entry remains self-contained for rendering and recalculation
 */
const entrySchema = new mongoose.Schema({
  // This explicit entryId exists in addition to MongoDB's built-in subdocument _id.
  // Current controller code deletes entries by subdocument _id, so entryId acts more
  // like an unused extra identifier than the primary way entries are addressed.
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
  // Snapshot of nutrition at the time the entry was added.
  // This denormalized copy is what calculateTotals() uses later.
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

// One user can only have one FoodLog document per UTC day.
foodLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// ── Static methods ─────────────────────────────────────────────────────────

/**
 * Get or create a FoodLog for a given userId and date.
 * The date is normalized to UTC midnight so every request for the same calendar
 * day maps to one document and can use the unique compound index above.
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
 * Builds the embedded entry object, copies nutrition/default serving data onto it,
 * then recalculates both per-entry computed macros and the day's aggregate totals.
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
 * The controller passes the embedded subdocument _id here, not entryId.
 * After removal, totals are recomputed from the remaining entries.
 */
foodLogSchema.statics.removeFoodEntry = async function (log, entryId) {
  log.entries = log.entries.filter((e) => e._id.toString() !== entryId);
  await log.calculateTotals();
  return log;
};

/**
 * Recalculate per-entry computed values and the document's dailyTotals, then save.
 *
 * Formula:
 *   (nutrition[field] / 100) * defaultServing.amount * servings
 *
 * nutrition[field] is stored per 100g, defaultServing.amount converts that into
 * one app-level serving, and entry.servings scales it to what the user logged.
 */
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
