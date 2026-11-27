import test from 'node:test'
import assert from 'node:assert/strict'
import { sortPublicEstablishments } from './directorySort.js'

const establishments = [
  { id: 'a', name: 'Alpha', featured: false },
  { id: 'b', name: 'Bravo', featured: true },
  { id: 'c', name: 'Charlie', featured: false },
]
const summaries = {
  a: { average: 4.2, count: 2 },
  b: { average: 4.8, count: 1 },
  c: { average: null, count: 5 },
}

test('sorts recommended listings by featured status, then review evidence', () => {
  assert.deepEqual(sortPublicEstablishments(establishments, summaries).map((item) => item.id), ['b', 'c', 'a'])
})

test('sorts by rating and puts unrated establishments last', () => {
  assert.deepEqual(sortPublicEstablishments(establishments, summaries, 'rating').map((item) => item.id), ['b', 'a', 'c'])
})

test('sorts by review count and uses name as a deterministic tie breaker', () => {
  assert.deepEqual(sortPublicEstablishments(establishments, summaries, 'reviews').map((item) => item.id), ['c', 'a', 'b'])
})

test('sorts by name without changing the source array', () => {
  assert.deepEqual(sortPublicEstablishments(establishments, summaries, 'name').map((item) => item.id), ['a', 'b', 'c'])
  assert.deepEqual(establishments.map((item) => item.id), ['a', 'b', 'c'])
})
