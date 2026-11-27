import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRatingMetrics } from './ratingMetrics.js';

test('calculates published rating metrics and satisfaction score deterministically', () => {
  const result = calculateRatingMetrics([5, 4, 4, 2, 1]);
  assert.deepEqual(result, {
    averageRating: 3.2,
    ratingCount: 5,
    positiveRatingPercentage: 60,
    distribution: {
      1: { count: 1, percentage: 20 },
      2: { count: 1, percentage: 20 },
      3: { count: 0, percentage: 0 },
      4: { count: 2, percentage: 40 },
      5: { count: 1, percentage: 20 },
    },
    customerSatisfactionScore: 55,
    eligibility: 'eligible',
  });
});

test('distinguishes no ratings from insufficient feedback', () => {
  assert.equal(calculateRatingMetrics([]).eligibility, 'no_ratings');
  assert.equal(calculateRatingMetrics([5], { minimumReviews: 5 }).eligibility, 'insufficient_feedback');
});

test('ignores invalid ratings and never creates a zero-star score', () => {
  const result = calculateRatingMetrics([0, 6, null, '3', 4]);
  assert.equal(result.ratingCount, 2);
  assert.equal(result.averageRating, 3.5);
  assert.equal(result.customerSatisfactionScore, 62.5);
});
