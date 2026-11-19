import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVER_LABEL, type CoverCollectionDetail, type CoverPhoto } from './covers.ts';
import { approvalRecord, approvedFolderName, fileStamp, savedFileName } from './coverDrive.ts';

const photo: CoverPhoto = {
  driveId: 'a', name: 'IMG_10.JPG', width: null, height: null, favorite: true, approved: true, edited: null,
  addedBy: 'Ana', addedAt: null, favoritedBy: 'Ana', favoritedAt: '2026-11-17T12:00:00Z', favoritedByApprover: false,
  approvedBy: APPROVER_LABEL, approvedAt: '2026-11-18T17:32:00Z', editedBy: null, editedAt: null,
};

test('fileStamp usa a hora da Bahia, sem / nem :', () => {
  assert.equal(fileStamp('2026-11-18T17:32:00Z'), '18-11-2026 14h32');
  assert.equal(fileStamp('2026-11-19T02:05:00Z'), '18-11-2026 23h05');
});

test('approvedFolderName traz a data da resposta', () => {
  assert.equal(approvedFolderName('2026-11-18T17:32:00Z'), 'Capas aprovadas por Thereza em 18-11-2026 14h32');
});

test('savedFileName marca o corte da Thereza e mantém a original', () => {
  assert.equal(savedFileName(photo), 'IMG_10.JPG');
  const cut = { ...photo, edited: { url: 'https://r2/uploads/x.jpg', width: 1080, height: 1350, label: '4:5' }, editedBy: APPROVER_LABEL };
  assert.equal(savedFileName(cut), 'IMG_10 - corte Thereza.jpg');
  assert.equal(savedFileName({ ...cut, editedBy: 'Ana' }), 'IMG_10 - corte.jpg');
});

test('approvalRecord registra quando cada capa foi aprovada e cortada', () => {
  const cut: CoverPhoto = {
    ...photo, driveId: 'b', name: 'IMG_11.jpg',
    edited: { url: 'https://r2/uploads/y.jpg', width: 1080, height: 1350, label: 'Instagram · Feed 4:5' },
    editedBy: APPROVER_LABEL, editedAt: '2026-11-18T17:30:00Z',
  };
  const collection = {
    respondedAt: '2026-11-18T17:33:00Z', feedback: 'Amei', confirmedBy: 'Ana', confirmedAt: '2026-11-19T12:00:00Z',
    photos: [photo, cut, { ...photo, driveId: 'c', name: 'fora.jpg', approved: false }],
  } as CoverCollectionDetail;
  const text = approvalRecord(collection, 'Casa 110 · Vila dos Coqueiros', 'Bia', '2026-11-19T13:00:00Z');
  assert.match(text, /Resposta enviada em 18\/11\/2026 às 14:33/);
  assert.match(text, /Comentário: "Amei"/);
  assert.match(text, /Capas confirmadas por Ana em 19\/11\/2026 às 09:00/);
  assert.match(text, /Salvo no Drive por Bia em 19\/11\/2026 às 10:00/);
  assert.match(text, /2 capas:/);
  assert.match(text, /1\. IMG_10\.JPG\n {3}Aprovada por Thereza em 18\/11\/2026 às 14:32/);
  assert.match(text, /2\. IMG_11 - corte Thereza\.jpg[\s\S]*Cortada por Thereza em 18\/11\/2026 às 14:30 \(Instagram · Feed 4:5\)/);
  assert.doesNotMatch(text, /fora\.jpg/);
});
