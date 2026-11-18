import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROP_RATIOS, clampOffset, coverScale, sourceRect } from './simpleCrop.ts';

test('CROP_RATIOS tem só os do carrossel do Instagram', () => {
  assert.deepEqual(CROP_RATIOS.map((r) => [r.id, r.width, r.height]), [['4x5', 1080, 1350], ['1x1', 1080, 1080]]);
});

test('coverScale cobre a moldura inteira', () => {
  // foto 3000x2000 numa moldura 400x500: altura manda
  assert.equal(coverScale(3000, 2000, 400, 500, 1), 0.25);
  assert.equal(coverScale(3000, 2000, 400, 500, 2), 0.5);
});

test('clampOffset não deixa borda vazia', () => {
  // imagem exibida 750x500 numa moldura 400x500
  assert.deepEqual(clampOffset({ x: 50, y: 20 }, 750, 500, 400, 500), { x: 0, y: 0 });
  assert.deepEqual(clampOffset({ x: -1000, y: 0 }, 750, 500, 400, 500), { x: -350, y: 0 });
  assert.deepEqual(clampOffset({ x: -100, y: 0 }, 750, 500, 400, 500), { x: -100, y: 0 });
});

test('sourceRect converte a moldura para pixels da foto', () => {
  assert.deepEqual(sourceRect({ x: -100, y: 0 }, 0.25, 400, 500), { sx: 400, sy: 0, sw: 1600, sh: 2000 });
});
