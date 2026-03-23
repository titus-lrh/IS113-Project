'use strict';

const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { connect, disconnect } = require('../helpers/db');
const FoodNutrition = require('../../models/FoodNutrition');

before(async () => {
  await connect();
  await FoodNutrition.ensureIndexes();
});

after(async () => {
  await disconnect();
});

afterEach(async () => {
  await FoodNutrition.deleteMany({});
});

test('creates a valid FoodNutrition document with all required fields', async () => {
  const doc = await FoodNutrition.create({
    foodKey: 'avocado raw',
    name: 'Avocado Raw',
    sourceType: 'custom',
    sourceId: 'avocado-raw-001',
    nutrition: { calories: 160, protein: 2, carbs: 9, fat: 15, fiber: 7 },
    defaultServing: { amount: 100, unit: 'g' },
  });

  assert.ok(doc._id);
  assert.equal(doc.foodKey, 'avocado raw');
  assert.equal(doc.name, 'Avocado Raw');
  assert.equal(doc.sourceType, 'custom');
  assert.equal(doc.nutrition.calories, 160);
  assert.equal(doc.defaultServing.unit, 'g');
  assert.ok(doc.createdAt instanceof Date);
});

test('fails validation when foodKey is missing', async () => {
  const doc = new FoodNutrition({ sourceType: 'custom', sourceId: 'test-001' });
  await assert.rejects(
    () => doc.validate(),
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.foodKey, 'expected foodKey to be in errors');
      return true;
    }
  );
});

test('fails validation when sourceType is not in enum', async () => {
  const doc = new FoodNutrition({ foodKey: 'test food', sourceType: 'invalid_source', sourceId: 'test-001' });
  await assert.rejects(
    () => doc.validate(),
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors.sourceType, 'expected sourceType to be in errors');
      return true;
    }
  );
});

test('defaults aiGenerated to true when not provided', async () => {
  const doc = await FoodNutrition.create({ foodKey: 'chicken breast', sourceType: 'custom', sourceId: 'chicken-001' });
  assert.equal(doc.aiGenerated, true);
});

test('unique compound index on { sourceType, sourceId } prevents duplicates', async () => {
  await FoodNutrition.create({ foodKey: 'apple cake', sourceType: 'themealdb', sourceId: '52772' });
  await assert.rejects(
    () => FoodNutrition.create({ foodKey: 'apple cake v2', sourceType: 'themealdb', sourceId: '52772' }),
    (err) => {
      assert.equal(err.code, 11000, 'expected duplicate key error code 11000');
      return true;
    }
  );
});

test('text index on foodKey allows $text search', async () => {
  await FoodNutrition.create({ foodKey: 'grilled chicken breast', sourceType: 'custom', sourceId: 'c1' });
  await FoodNutrition.create({ foodKey: 'pasta carbonara', sourceType: 'custom', sourceId: 'c2' });

  const results = await FoodNutrition.find({ $text: { $search: 'chicken' } });
  assert.equal(results.length, 1);
  assert.equal(results[0].foodKey, 'grilled chicken breast');
});
