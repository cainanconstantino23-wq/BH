import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVER_LABEL, approverLines, formatLongStamp, type CoverPhoto } from './covers.ts';

const base: CoverPhoto = {
  driveId: 'a', name: 'a.jpg', width: null, height: null, favorite: true, approved: false, edited: null,
  addedBy: 'Ana', addedAt: null, favoritedBy: 'Ana', favoritedAt: '2026-11-17T12:00:00Z', favoritedByApprover: false,
  approvedBy: null, approvedAt: null, editedBy: null, editedAt: null,
};

test('formatLongStamp mostra data e hora da Bahia', () => {
  assert.equal(formatLongStamp('2026-11-18T17:32:00Z'), '18/11/2026 às 14:32');
  assert.equal(formatLongStamp(null), '');
});

test('approverLines lista o que a Thereza fez, com data', () => {
  const photo: CoverPhoto = {
    ...base,
    approved: true, approvedBy: APPROVER_LABEL, approvedAt: '2026-11-18T17:32:00Z',
    favoritedByApprover: true, favoritedBy: APPROVER_LABEL, favoritedAt: '2026-11-18T17:30:00Z',
    edited: { url: 'u', width: 1080, height: 1350, label: 'x' }, editedBy: APPROVER_LABEL, editedAt: '2026-11-18T17:31:00Z',
  };
  assert.deepEqual(approverLines(photo), [
    'Adicionada às capas por Thereza em 18/11/2026 às 14:30',
    'Cortada por Thereza em 18/11/2026 às 14:31',
    'Escolhida por Thereza em 18/11/2026 às 14:32',
  ]);
});

test('approverLines ignora ações da equipe', () => {
  assert.deepEqual(approverLines({ ...base, approved: true, approvedBy: 'Ana', approvedAt: '2026-11-18T17:32:00Z', editedBy: 'Ana', editedAt: '2026-11-18T17:31:00Z' }), []);
});
