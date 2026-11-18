import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CROP_BYTES, checkCropUpload } from './coverCrop.ts';

const jpeg = (size = 2000) => { const b = new Uint8Array(size); b.set([0xff, 0xd8, 0xff]); return b; };

test('checkCropUpload aceita JPEG 1080x1350 dentro do limite', () => {
  assert.equal(checkCropUpload({ bytes: jpeg(), width: 1080, height: 1350 }), null);
});

test('checkCropUpload recusa arquivo que não é JPEG', () => {
  assert.equal(checkCropUpload({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]), width: 1080, height: 1350 }), 'not_jpeg');
});

test('checkCropUpload recusa arquivo grande ou vazio', () => {
  assert.equal(checkCropUpload({ bytes: jpeg(MAX_CROP_BYTES + 1), width: 1080, height: 1350 }), 'too_large');
  assert.equal(checkCropUpload({ bytes: new Uint8Array(0), width: 1080, height: 1350 }), 'not_jpeg');
});

test('checkCropUpload recusa medidas fora do Instagram', () => {
  assert.equal(checkCropUpload({ bytes: jpeg(), width: 0, height: 1350 }), 'bad_size');
  assert.equal(checkCropUpload({ bytes: jpeg(), width: 5000, height: 1350 }), 'bad_size');
});
