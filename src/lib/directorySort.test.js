import test from 'node:test'
import assert from 'node:assert/strict'
import { sortPublicEstablishments } from './directorySort.js'

const establishments = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
  { id: 'c', name: 'Charlie' },
]
const summaries = {
  a: { average: 4.2, count: 2 },
  b: { average: 4.8, count: 1 },
  c: { average: null, count: 5 },
}

test('preserves recommendation order by default', () => {
  assert.deepEqual(sortPublicEstablishments(establishments, summaries).map((item) => item.id), ['a', 'b', 'c'])
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
