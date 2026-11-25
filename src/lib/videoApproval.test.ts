import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, STAGES, groupOf, stageOf, stagePath, timelineEvents } from './videoApproval.ts';

const v = (version: number, decision = '', extra: Record<string, string> = {}) => ({
  version, decision, created_at: `2026-11-${10 + version}T12:00:00Z`, created_by_label: 'Ana', note: '', feedback: '', responded_at: '', responded_by_label: '', ...extra,
});

test('STAGES na ordem da linha do tempo', () => {
  assert.deepEqual(STAGES.map((s) => s.id), ['aguardando', 'alteracao', 'reenviado', 'aprovado', 'reprovado']);
});

test('stageOf separa aguardando de reenviado pela versão', () => {
  assert.equal(stageOf('pending', 1), 'aguardando');
  assert.equal(stageOf('pending', 0), 'aguardando');
  assert.equal(stageOf('pending', 2), 'reenviado');
  assert.equal(stageOf('changes_requested', 1), 'alteracao');
  assert.equal(stageOf('approved', 3), 'aprovado');
  assert.equal(stageOf('rejected', 1), 'reprovado');
  assert.equal(stageOf('', 1), 'aguardando');
});

test('stagePath mostra o caminho de cada versão', () => {
  assert.deepEqual(stagePath('pending', [v(1)]), ['aguardando']);
  assert.deepEqual(stagePath('changes_requested', [v(1, 'changes_requested')]), ['aguardando', 'alteracao']);
  assert.deepEqual(stagePath('pending', [v(1, 'changes_requested'), v(2)]), ['aguardando', 'alteracao', 'reenviado']);
  assert.deepEqual(
    stagePath('approved', [v(1, 'changes_requested'), v(2, 'changes_requested'), v(3, 'approved')]),
    ['aguardando', 'alteracao', 'reenviado', 'alteracao', 'reenviado', 'aprovado'],
  );
  assert.deepEqual(stagePath('rejected', [v(1, 'rejected')]), ['aguardando', 'reprovado']);
});

test('stagePath sem versões usa a situação atual', () => {
  assert.deepEqual(stagePath('pending', []), ['aguardando']);
  assert.deepEqual(stagePath('approved', []), ['aguardando', 'aprovado']);
});

test('timelineEvents: envio, resposta com comentário e espera', () => {
  const events = timelineEvents([
    v(1, 'changes_requested', { feedback: 'Trocar a música', responded_at: '2026-11-12T15:00:00Z' }),
    v(2, '', { note: 'música trocada' }),
  ]);
  assert.deepEqual(
    events.map((e) => [e.kind, e.stage, e.version, e.text]),
    [
      ['enviado', 'aguardando', 1, ''],
      ['resposta', 'alteracao', 1, 'Trocar a música'],
      ['enviado', 'reenviado', 2, 'música trocada'],
      ['esperando', 'reenviado', 2, ''],
    ],
  );
  assert.equal(events[1].at, '2026-11-12T15:00:00Z');
  assert.equal(events[0].by, 'Ana');
});

test('timelineEvents termina sem espera quando a última versão foi respondida', () => {
  const events = timelineEvents([v(1, 'approved', { responded_at: '2026-11-12T15:00:00Z' })]);
  assert.deepEqual(events.map((e) => e.kind), ['enviado', 'resposta']);
});

test('groupOf junta as etapas em Aguardando aprovação, Ajuste e Aprovado', () => {
  assert.deepEqual(GROUPS.map((g) => g.id), ['aguardando', 'ajuste', 'aprovado']);
  assert.equal(groupOf('aguardando'), 'aguardando');
  assert.equal(groupOf('reenviado'), 'aguardando');
  assert.equal(groupOf('alteracao'), 'ajuste');
  assert.equal(groupOf('reprovado'), 'ajuste');
  assert.equal(groupOf('aprovado'), 'aprovado');
  assert.deepEqual(GROUPS.flatMap((g) => g.stages).sort(), STAGES.map((s) => s.id).sort());
});
