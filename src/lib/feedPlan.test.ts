import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribute, periodLabel, planSlots, postDates, replaceHouse, shortDay, swapSlots, validateLayout, type PlanHouse } from './feedPlan.ts';

// 22/11/2026 é domingo
test('planSlots: domingo é Reels, os outros dias são post', () => {
  const slots = planSlots('2026-11-20', 15);
  assert.equal(slots.length, 15);
  assert.deepEqual(slots.filter((slot) => slot.kind === 'reels').map((slot) => slot.date), ['2026-11-22', '2026-11-29']);
  assert.equal(postDates('2026-11-20', 15).length, 13);
});

test('planSlots atravessa o mês', () => {
  const slots = planSlots('2026-11-28', 5);
  assert.deepEqual(slots.map((slot) => slot.date), ['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
});

test('distribute: casas na ordem nos dias de post, sobra vai para a reserva', () => {
  const items = distribute([1, 2, 3], '2026-11-21', 2); // sáb 21, dom 22
  assert.deepEqual(items, [
    { collectionId: 1, slotDate: '2026-11-21', coverDriveId: null },
    { collectionId: 2, slotDate: null, coverDriveId: null },
    { collectionId: 3, slotDate: null, coverDriveId: null },
  ]);
});

const houses: PlanHouse[] = [
  { collectionId: 1, label: 'A', slotDate: '2026-11-20', coverDriveId: null, candidates: [{ driveId: 'a1', name: 'a1', editedUrl: null }] },
  { collectionId: 2, label: 'B', slotDate: '2026-11-21', coverDriveId: null, candidates: [{ driveId: 'b1', name: 'b1', editedUrl: null }] },
  { collectionId: 3, label: 'C', slotDate: null, coverDriveId: null, candidates: [{ driveId: 'c1', name: 'c1', editedUrl: null }] },
];

test('validateLayout aceita grade válida e recusa dia repetido, domingo, capa de outra casa ou casa faltando', () => {
  const ok = [
    { collectionId: 1, slotDate: '2026-11-21', coverDriveId: 'a1' },
    { collectionId: 2, slotDate: '2026-11-20', coverDriveId: null },
    { collectionId: 3, slotDate: null, coverDriveId: null },
  ];
  assert.deepEqual(validateLayout(ok, houses, '2026-11-20', 15), ok);
  assert.equal(validateLayout([{ ...ok[0], slotDate: '2026-11-20' }, ok[1], ok[2]], houses, '2026-11-20', 15), null);
  assert.equal(validateLayout([{ ...ok[0], slotDate: '2026-11-22' }, ok[1], ok[2]], houses, '2026-11-20', 15), null);
  assert.equal(validateLayout([{ ...ok[0], coverDriveId: 'b1' }, ok[1], ok[2]], houses, '2026-11-20', 15), null);
  assert.equal(validateLayout([ok[0], ok[1]], houses, '2026-11-20', 15), null);
  assert.equal(validateLayout('x', houses, '2026-11-20', 15), null);
});

test('swapSlots e replaceHouse', () => {
  const swapped = swapSlots(houses, '2026-11-20', '2026-11-21');
  assert.equal(swapped[0].slotDate, '2026-11-21');
  assert.equal(swapped[1].slotDate, '2026-11-20');
  const moved = swapSlots(houses, '2026-11-20', '2026-11-24');
  assert.equal(moved[0].slotDate, '2026-11-24');
  const replaced = replaceHouse(houses, '2026-11-20', 3);
  assert.equal(replaced[0].slotDate, null);
  assert.equal(replaced[2].slotDate, '2026-11-20');
});

test('rótulos de data', () => {
  assert.equal(shortDay('2026-11-20'), 'sex 20/11');
  assert.equal(periodLabel('2026-11-20', 15), '20/11 a 04/12');
});
