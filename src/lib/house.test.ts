import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighborhoodOptions } from './house.ts';

test('neighborhoodOptions junta os padrões com os já usados, sem repetir', () => {
  assert.deepEqual(neighborhoodOptions([]), ['Quadrado', 'Rio da Barra']);
  assert.deepEqual(neighborhoodOptions(['quadrado', ' Itapororoca ', null, '', 'Rio  da Barra', 'Itapororoca']), ['Itapororoca', 'Quadrado', 'Rio da Barra']);
});
