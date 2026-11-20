import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighborhoodOptions } from './house.ts';

test('neighborhoodOptions junta os padrões com os já usados, sem repetir', () => {
  assert.deepEqual(neighborhoodOptions([]), ['Quadrado', 'Rio da Barra']);
  assert.deepEqual(neighborhoodOptions(['quadrado', ' Itapororoca ', null, '', 'Rio  da Barra', 'Itapororoca']), ['Itapororoca', 'Quadrado', 'Rio da Barra']);
});

test('houseFromFolderName usa o apelido e o número, sem o proprietário', async () => {
  const { houseFromFolderName } = await import('./house.ts');
  assert.deepEqual(houseFromFolderName('Itapororoca Casa 10 (Naoca - Viviane Hentsch)', 'Itapororoca'), { name: 'Naoca', number: '10', neighborhood: 'Itapororoca' });
  assert.deepEqual(houseFromFolderName('Pedro Grande 17 (Casa Flora - Jacques)', 'Pedro Grande'), { name: 'Casa Flora', number: '17', neighborhood: 'Pedro Grande' });
  const owner = houseFromFolderName('Altos do Segredo 02 (Andréa Hirsch)', 'Altos do Segredo');
  assert.equal(owner.number, '02');
  assert.doesNotMatch(owner.name, /Hirsch/);
  assert.equal(houseFromFolderName('Trancoso 34 - Thales', 'Centro - Trancoso').neighborhood, 'Centro');
});
