'use strict';

const FoodLog = require('../models/FoodLog');

/**
 * Get or create a FoodLog for a given userId and date.
 */
async function getOrCreateLog(userId, date) {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00.000Z`);
  d.setUTCHours(0, 0, 0, 0);
  const midnight = d;

  const existing = await FoodLog.findOne({ userId, date: midnight });
  if (existing) return existing;
  return FoodLog.create({ userId, date: midnight, entries: [] });
}

/**
 * Add a food entry to a log.
 * Builds entry object, denormalizes nutrition, and recalculates totals.
 */
async function addFoodEntry(log, entryData) {
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

  // Denormalize nutrition onto entry for self-contained calculation
  if (entryData.nutrition) {
    entry.nutrition = entryData.nutrition.nutrition;
    entry.defaultServing = entryData.nutrition.defaultServing;
  }

  log.entries.push(entry);
  await log.calculateTotals();
  return log;
}

/**
 * Remove a food entry from a log by ID.
 * Filters out the entry and recalculates totals.
 */
async function removeFoodEntry(log, entryId) {
  log.entries = log.entries.filter((e) => e._id.toString() !== entryId);
  await log.calculateTotals();
  return log;
}

module.exports = { getOrCreateLog, addFoodEntry, removeFoodEntry };
