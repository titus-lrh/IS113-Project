'use strict';

const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { connect, disconnect } = require('../helpers/db');
const FoodNutrition = require('../../models/FoodNutrition');

// We mock global fetch before requiring the service so the service picks up the mock.
// Each test can override globalThis.fetch as needed.

before(async () => {
  await connect();
  await FoodNutrition.ensureIndexes();
});

after(async () => {
  await disconnect();
});

afterEach(async () => {
  await FoodNutrition.deleteMany({});
  mock.restoreAll();
});

// Helper: build a fake fetch that returns a GPT-style response
function makeFetch(nutrition) {
  return async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(nutrition) } }],
    }),
  });
}

const SAMPLE_NUTRITION = {
  calories: 52,
  protein: 0.3,
  carbs: 14,
  fat: 0.2,
  fiber: 2.4,
  defaultServing: { amount: 182, unit: 'g' },
};

// ── fetchNutritionFromGPT ──────────────────────────────────────────────────

test('fetchNutritionFromGPT: returns parsed nutrition from GPT', async () => {
  globalThis.fetch = makeFetch(SAMPLE_NUTRITION);
  // Require fresh copy so mock is already in place
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { fetchNutritionFromGPT } = require('../../services/nutritionService');

  const result = await fetchNutritionFromGPT('apple');
  assert.equal(result.calories, 52);
  assert.equal(result.protein, 0.3);
  assert.equal(result.defaultServing.amount, 182);
  assert.equal(result.defaultServing.unit, 'g');
});

test('fetchNutritionFromGPT: retries once on JSON parse failure then succeeds', async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount++;
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              // First call returns non-JSON, second returns valid JSON
              content: callCount === 1 ? 'not json at all' : JSON.stringify(SAMPLE_NUTRITION),
            },
          },
        ],
      }),
    };
  };
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { fetchNutritionFromGPT } = require('../../services/nutritionService');

  const result = await fetchNutritionFromGPT('apple');
  assert.equal(callCount, 2);
  assert.equal(result.calories, 52);
});

test('fetchNutritionFromGPT: throws after two consecutive parse failures', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
  });
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { fetchNutritionFromGPT } = require('../../services/nutritionService');

  await assert.rejects(
    () => fetchNutritionFromGPT('apple'),
    (err) => {
      assert.ok(err.message, 'should throw an error');
      return true;
    },
  );
});

test('fetchNutritionFromGPT: throws when fetch response is not ok', async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'rate limit' }) });
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { fetchNutritionFromGPT } = require('../../services/nutritionService');

  await assert.rejects(() => fetchNutritionFromGPT('apple'));
});

// ── getNutrition ──────────────────────────────────────────────────────────

test('getNutrition: returns cached FoodNutrition doc without calling GPT', async () => {
  // Pre-seed cache
  await FoodNutrition.create({
    foodKey: 'themealdb-52772',
    name: 'Apple Cake',
    sourceType: 'themealdb',
    sourceId: '52772',
    nutrition: { calories: 320, protein: 4, carbs: 52, fat: 11 },
    defaultServing: { amount: 100, unit: 'g' },
  });

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ choices: [] }) };
  };
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { getNutrition } = require('../../services/nutritionService');

  const doc = await getNutrition('themealdb', '52772', 'Apple Cake');
  assert.equal(fetchCalled, false, 'GPT should NOT be called on cache hit');
  assert.equal(doc.nutrition.calories, 320);
  assert.equal(doc.sourceId, '52772');
});

test('getNutrition: calls GPT on cache miss and saves new FoodNutrition', async () => {
  globalThis.fetch = makeFetch(SAMPLE_NUTRITION);
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { getNutrition } = require('../../services/nutritionService');

  const doc = await getNutrition('themealdb', '99999', 'apple');
  assert.ok(doc._id, 'should return a saved document');
  assert.equal(doc.sourceType, 'themealdb');
  assert.equal(doc.sourceId, '99999');
  assert.equal(doc.nutrition.calories, 52);

  // Verify it's actually persisted
  const found = await FoodNutrition.findOne({ sourceType: 'themealdb', sourceId: '99999' });
  assert.ok(found, 'should be persisted in DB');
  assert.equal(found.nutrition.calories, 52);
});

test('getNutrition: cache hit on second call after GPT miss', async () => {
  let fetchCallCount = 0;
  globalThis.fetch = async () => {
    fetchCallCount++;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(SAMPLE_NUTRITION) } }] }),
    };
  };
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { getNutrition } = require('../../services/nutritionService');

  await getNutrition('custom', null, 'banana');
  // Second call — should hit cache
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { getNutrition: getNutrition2 } = require('../../services/nutritionService');
  await getNutrition2('custom', null, 'banana');

  assert.equal(fetchCallCount, 1, 'GPT should only be called once');
});

test('getNutrition: foodKey is normalized (lowercase, trimmed)', async () => {
  globalThis.fetch = makeFetch(SAMPLE_NUTRITION);
  delete require.cache[require.resolve('../../services/nutritionService')];
  const { getNutrition } = require('../../services/nutritionService');

  const doc = await getNutrition('custom', null, '  Apple  ');
  assert.equal(doc.foodKey, 'apple');
});
