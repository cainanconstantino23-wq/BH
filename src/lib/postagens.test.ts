import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excelDate, parsePostagens, prioritize, type PostagemRow } from './postagens.ts';

test('excelDate converte número serial, Date e texto dd/mm/aaaa', () => {
  assert.equal(excelDate(46118), '2026-04-06');
  assert.equal(excelDate(new Date(Date.UTC(2026, 0, 2))), '2026-01-02');
  assert.equal(excelDate('15/02/2026'), '2026-02-15');
});

test('excelDate devolve null para vazio e lixo', () => {
  for (const value of ['None', '', null, undefined, 'SIM', 0]) assert.equal(excelDate(value), null);
});

const HEADER = ['ATUALIZADO', 'Suites', 'CASA', 'Base Feed', 'Ultima Postagem', '', 'OBSERVAÇÕES', 'QUALIF CORRETORAS', 'PROPRIETÁRIO', 'Data entrada site', 'POSTAGEM', 'POSTAGEM', 'POSTAGEM'];

test('parsePostagens lê as colunas pelo cabeçalho e todas as POSTAGEM', () => {
  const rows = parsePostagens([
    HEADER,
    ['ALTOS DE ITAPOROROCA', 4, 'Altos 06', null, 46235, 'SIM', '', 'PARA VENDA', '', 45882, 46040, 46173, 46235],
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    line: 2,
    atualizado: 'ALTOS DE ITAPOROROCA',
    casa: 'Altos 06',
    ultimaPostagem: '2026-08-01',
    observacoes: '',
    qualif: 'PARA VENDA',
    entradaSite: '2025-08-13',
    postagens: ['2026-01-18', '2026-05-31', '2026-08-01'],
    bloqueada: false,
  });
});

test('parsePostagens ignora linha sem casa', () => {
  assert.equal(parsePostagens([HEADER, ['ala', '', null, 46330]]).length, 0);
});

test('parsePostagens marca bloqueada e tira a última postagem das datas', () => {
  const [row] = parsePostagens([HEADER, ['X', 6, 'Altos 13', '', null, 'SIM', 'Não postar por enquanto', 'NÃO PUBLICAR', '', null, 45995]]);
  assert.equal(row.bloqueada, true);
  assert.equal(row.ultimaPostagem, '2025-12-04');
});

const row = (casa: string, ultimaPostagem: string | null, bloqueada = false): PostagemRow => ({
  line: 0, atualizado: '', casa, ultimaPostagem, observacoes: '', qualif: '', entradaSite: null, postagens: [], bloqueada,
});

test('prioritize: nunca postadas, depois mais antigas, bloqueadas no fim', () => {
  const result = prioritize([row('C', '2026-06-01'), row('D', null, true), row('B', '2026-01-01'), row('A', null)], '2026-11-18');
  assert.deepEqual(result.map((r) => r.casa), ['A', 'B', 'C', 'D']);
  assert.equal(result[1].diasSemPostar, 321);
  assert.equal(result[0].diasSemPostar, null);
});
