const emptyDistribution = () => ({
  1: { count: 0, percentage: 0 },
  2: { count: 0, percentage: 0 },
  3: { count: 0, percentage: 0 },
  4: { count: 0, percentage: 0 },
  5: { count: 0, percentage: 0 },
});

const round = (value) => Math.round(value * 100) / 100;

export function calculateRatingMetrics(values, { minimumReviews = 5 } = {}) {
  const ratings = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
  const ratingCount = ratings.length;
  const distribution = emptyDistribution();

  for (const rating of ratings) distribution[rating].count += 1;
  for (const rating of [1, 2, 3, 4, 5]) {
    distribution[rating].percentage = ratingCount === 0 ? 0 : round((distribution[rating].count / ratingCount) * 100);
  }

  if (ratingCount === 0) {
    return {
      averageRating: null,
      ratingCount: 0,
      positiveRatingPercentage: null,
      distribution,
      customerSatisfactionScore: null,
      eligibility: 'no_ratings',
    };
  }

  const averageRating = round(ratings.reduce((sum, rating) => sum + rating, 0) / ratingCount);
  const positiveRatingPercentage = round(((distribution[4].count + distribution[5].count) / ratingCount) * 100);
  const customerSatisfactionScore = round(((averageRating - 1) / 4) * 100);

  return {
    averageRating,
    ratingCount,
    positiveRatingPercentage,
    distribution,
    customerSatisfactionScore,
    eligibility: ratingCount >= minimumReviews ? 'eligible' : 'insufficient_feedback',
  };
}
