'use strict';

const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connect, disconnect } = require('../helpers/db');
const FoodLog = require('../../models/FoodLog');

before(async () => {
  await connect();
  await FoodLog.ensureIndexes();
});

after(async () => {
  await disconnect();
});

afterEach(async () => {
  await FoodLog.deleteMany({});
});

// Helper to get midnight UTC for a date string
const midnight = (dateStr) => new Date(`${dateStr}T00:00:00.000Z`);

test('creates a valid FoodLog with userId and date, dailyTotals default to 0', async () => {
  const userId = new mongoose.Types.ObjectId();
  const doc = await FoodLog.create({ userId, date: midnight('2026-03-20'), entries: [] });

  assert.ok(doc._id);
  assert.deepEqual(doc.userId.toString(), userId.toString());
  assert.equal(doc.dailyTotals.calories, 0);
  assert.equal(doc.dailyTotals.protein, 0);
  assert.equal(doc.dailyTotals.carbs, 0);
  assert.equal(doc.dailyTotals.fat, 0);
});

test('fails when userId is missing', async () => {
  const doc = new FoodLog({ date: midnight('2026-03-20') });
  await assert.rejects(
    () => doc.validate(),
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.userId, 'expected userId to be in errors');
      return true;
    }
  );
});

test('fails when date is missing', async () => {
  const doc = new FoodLog({ userId: new mongoose.Types.ObjectId() });
  await assert.rejects(
    () => doc.validate(),
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.date, 'expected date to be in errors');
      return true;
    }
  );
});

test('entry pushed into entries has auto-generated _id and mealType defaults to Other', async () => {
  const userId = new mongoose.Types.ObjectId();
  const log = await FoodLog.create({ userId, date: midnight('2026-03-20') });

  log.entries.push({ timeLabel: '08:00', food: { name: 'Banana' }, servings: 1 });
  await log.save();

  const saved = await FoodLog.findById(log._id);
  assert.equal(saved.entries.length, 1);
  assert.ok(saved.entries[0]._id, 'entry should have an auto-generated _id');
  assert.equal(saved.entries[0].mealType, 'Other');
});

test('unique index on { userId, date } prevents duplicates', async () => {
  const userId = new mongoose.Types.ObjectId();
  await FoodLog.create({ userId, date: midnight('2026-03-20') });
  await assert.rejects(
    () => FoodLog.create({ userId, date: midnight('2026-03-20') }),
    (err) => {
      assert.equal(err.code, 11000, 'expected duplicate key error code 11000');
      return true;
    }
  );
});

test('calculateTotals() correctly sums entries into dailyTotals', async () => {
  // Entry A: calories=200, protein=30, carbs=50, fat=10, amount=150g, servings=2
  // Entry B: calories=100, protein=15, carbs=25, fat=5,  amount=200g, servings=1
  // Expected calories: (200/100*150*2) + (100/100*200*1) = 600 + 200 = 800
  // Expected protein:  (30/100*150*2)  + (15/100*200*1)  = 90  + 30  = 120
  // Expected carbs:    (50/100*150*2)  + (25/100*200*1)  = 150 + 50  = 200
  // Expected fat:      (10/100*150*2)  + (5/100*200*1)   = 30  + 10  = 40
  const userId = new mongoose.Types.ObjectId();
  const log = await FoodLog.create({
    userId,
    date: midnight('2026-03-20'),
    entries: [
      { nutrition: { calories: 200, protein: 30, carbs: 50, fat: 10 }, defaultServing: { amount: 150, unit: 'g' }, servings: 2 },
      { nutrition: { calories: 100, protein: 15, carbs: 25, fat: 5  }, defaultServing: { amount: 200, unit: 'g' }, servings: 1 },
    ],
  });

  await log.calculateTotals();

  const updated = await FoodLog.findById(log._id);
  assert.equal(updated.dailyTotals.calories, 800);
  assert.equal(updated.dailyTotals.protein, 120);
  assert.equal(updated.dailyTotals.carbs, 200);
  assert.equal(updated.dailyTotals.fat, 40);

  // Each entry.computed is also populated per-entry
  // Entry A: 200/100*150*2=600 cal, 30/100*150*2=90 protein
  assert.equal(updated.entries[0].computed.calories, 600);
  assert.equal(updated.entries[0].computed.protein, 90);
  // Entry B: 100/100*200*1=200 cal, 15/100*200*1=30 protein
  assert.equal(updated.entries[1].computed.calories, 200);
  assert.equal(updated.entries[1].computed.protein, 30);
});

test('portion math: computed.calories = (nutrition.calories / 100) * defaultServing.amount * servings', async () => {
  // nutrition.calories=300, defaultServing.amount=100, servings=2 → 300/100*100*2 = 600
  const userId = new mongoose.Types.ObjectId();
  const log = await FoodLog.create({
    userId,
    date: midnight('2026-03-21'),
    entries: [
      { nutrition: { calories: 300, protein: 0, carbs: 0, fat: 0 }, defaultServing: { amount: 100, unit: 'g' }, servings: 2 },
    ],
  });

  await log.calculateTotals();

  const updated = await FoodLog.findById(log._id);
  assert.equal(updated.dailyTotals.calories, 600);
  assert.equal(updated.entries[0].computed.calories, 600);
});
