import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinFolders, parseDriveFolders } from './driveScope.ts';

const tree: Record<string, string[]> = { foto: ['casa'], casa: ['bairro'], bairro: ['raiz'], outra: ['raiz'] };
const parents = async (id: string) => tree[id] ?? [];

test('pasta liberada e o que está abaixo', async () => {
  assert.equal(await isWithinFolders('casa', new Set(['casa']), parents), true);
  assert.equal(await isWithinFolders('foto', new Set(['casa']), parents), true);
});

test('item fora mesmo com nome igual', async () => {
  assert.equal(await isWithinFolders('outra', new Set(['casa']), parents), false);
  assert.equal(await isWithinFolders('bairro', new Set(['casa']), parents), false);
});

test('erro ao ler pais = bloqueado', async () => {
  assert.equal(await isWithinFolders('foto', new Set(['casa']), async () => null), false);
  assert.equal(await isWithinFolders('foto', new Set(['casa']), async () => { throw new Error('x'); }), false);
});

test('lista vazia não libera nada', async () => {
  assert.equal(await isWithinFolders('casa', new Set(), parents), false);
});

test('parseDriveFolders', () => {
  assert.equal(parseDriveFolders(null), null);
  assert.equal(parseDriveFolders(undefined), null);
  assert.deepEqual(parseDriveFolders([]), []);
  assert.deepEqual(parseDriveFolders([{ id: '1AbCdEfGhIjK', name: 'Teste' }, { id: 'x' }, 5]), [{ id: '1AbCdEfGhIjK', name: 'Teste' }]);
});
