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

test('matchSavedHouse liga a linha da planilha à casa salva pelo número e uma palavra em comum', async () => {
  const { matchSavedHouse } = await import('./house.ts');
  const houses = [
    { id: 1, houseName: 'Naoca', houseNumber: '05', neighborhood: 'Itapororoca' },
    { id: 2, houseName: 'Casa Flora', houseNumber: '11', neighborhood: 'Aldeia de Itapororoca' },
    { id: 3, houseName: 'Bangalô', houseNumber: 'B-02', neighborhood: 'Espelho' },
    { id: 4, houseName: 'Casa Azul', houseNumber: '05', neighborhood: 'Pedro Grande' },
    { id: 5, houseName: 'Villa Mar', houseNumber: '', neighborhood: 'Quadrado' },
  ];
  assert.equal(matchSavedHouse('Aldeia de Itapororoca 05', 'ALDEIA DE ITAPORORORA', houses), 1);
  assert.equal(matchSavedHouse('Aldeia de Itapororoca 11', 'ALDEIA DE ITAPOROROCA', houses), 2);
  assert.equal(matchSavedHouse('Bangalô B-02', 'ESPELHO - OUTEIRO DAS BRISAS', houses), 3);
  assert.equal(matchSavedHouse('Pedro Grande 05', 'PEDRO GRANDE', houses), 4);
  assert.equal(matchSavedHouse('Villa Mar', 'QUADRADO', houses), 5);
  // número sem palavra em comum, ou casa sem capas: nada
  assert.equal(matchSavedHouse('Outeiro 05', 'OUTEIRO', houses), null);
  assert.equal(matchSavedHouse('Aldeia de Itapororoca 07', 'ALDEIA DE ITAPOROROCA', houses), null);
});
