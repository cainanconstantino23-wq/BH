# Pastas do Drive por pessoa — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin escolhe, por membro da equipe, se ele vê o Drive inteiro (como hoje) ou só algumas pastas.

**Architecture:** Coluna `team_members.drive_folders` (null = tudo). `getActiveMember()` traz as pastas; uma regra pura
(`driveScope.ts`, testável) diz se um item está abaixo de uma pasta liberada; `driveAccess.ts` combina essa regra com a
atual (`isSharedWithMe`) e todas as rotas da equipe que tocam o Drive passam a usá-la. A tela Equipe ganha o editor.

**Tech Stack:** Next.js 16 (App Router), Supabase (RLS + gatilho), Google Drive API v3, React 19, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-26-pastas-drive-por-pessoa-design.md`

## Global Constraints
- Interface e mensagens em pt-BR; responder em português.
- `drive_folders`: `null` = Tudo; `[]` = nada do Drive; `[{ "id": string, "name": string }]` = só essas pastas e o que está abaixo.
- A regra atual (`isSharedWithMe`: Meu Drive e drives de equipe bloqueados) continua valendo **antes** da restrição por pessoa.
- Links públicos (`/api/capa-link/*`, `/api/grade-link/*`) não mudam.
- Drive: nunca alterar, mover ou excluir; só criar (regra do projeto).
- Migração em `supabase/migrations/`, rodada à mão no SQL Editor do Supabase (mesmo banco no localhost e produção).
- Testes: `npm test`; arquivos de teste importam com extensão `.ts` e não podem importar `server-only`.
- Trabalhar no branch `feat/drive-pastas-membro` criado a partir do atual.

## Review Focus
- Membro restrito pedindo miniatura/arquivo/vídeo por ID direto fora das pastas → 403 (Task 3).
- Pasta liberada que fica em "Meu Drive" (não compartilhada) → continua bloqueada (Task 2, teste `restrito não fura a regra base`).
- Atalho do Drive dentro da pasta liberada que aponta para fora dela → o destino é bloqueado, pois a regra sobe pelos pais do destino (Task 2, teste `item fora mesmo com nome igual`).
- Membro com `drive_folders = []` abrindo o navegador do Drive → lista vazia, sem erro (Task 3, `/list` devolve `entries: []`).
- Admin "Tudo" → comportamento idêntico ao de hoje em todas as rotas (Task 3, conferir no navegador).

---

### Task 1: Banco e membro com pastas

**Files:**
- Create: `supabase/migrations/20261126_drive_pastas_membro.sql`
- Modify: `src/lib/team-server.ts`

**Interfaces:**
- Produces: `ActiveMember.driveFolders: DriveFolder[] | null` (tipo `DriveFolder` vem da Task 2: `{ id: string; name: string }`).

- [ ] **Step 1: Escrever a migração**
  - `alter table public.team_members add column if not exists drive_folders jsonb;`
  - `grant update (drive_folders) on public.team_members to authenticated;`
  - `create or replace function public.log_team_activity()` copiando a versão de `20261108b_permissoes.sql` (linha 93 até o fim
    da função) e acrescentando, antes do `else return null`:
    `elsif new.drive_folders is distinct from old.drive_folders then act := 'equipe.drive_alterado'; info := jsonb_build_object('pessoa', target_name, 'pastas', new.drive_folders);`
- [ ] **Step 2:** Em `getActiveMember()`, selecionar `drive_folders` e preencher `driveFolders: parseDriveFolders(member.drive_folders)` (Task 2).
- [ ] **Step 3:** Pedir ao usuário para rodar a migração no SQL Editor; conferir com `select drive_folders from team_members limit 1;`.
- [ ] **Step 4: Commit** `feat(drive): coluna drive_folders por membro`

### Task 2: Regra pura de escopo

**Files:**
- Create: `src/lib/google/driveScope.ts`, `src/lib/google/driveScope.test.ts`
- Modify: `src/lib/google/driveAccess.ts`

**Interfaces:**
- Produces (driveScope.ts, sem `server-only`):
  - `type DriveFolder = { id: string; name: string }`
  - `parseDriveFolders(value: unknown): DriveFolder[] | null` — não-array → `null`; descarta itens sem `id`/`name` string ou com id fora de `/^[\w-]{10,}$/`.
  - `isWithinFolders(id: string, allowed: ReadonlySet<string>, parentsOf: (id: string) => Promise<string[] | null>, maxDepth = 12): Promise<boolean>` — verdadeiro se `id` ou algum ancestral (pelo primeiro pai, como `isSharedWithMe`) está em `allowed`; `parentsOf` null/erro = falso.
- Produces (driveAccess.ts):
  - `canSeeDriveItem(member: { driveFolders: DriveFolder[] | null } | null, id: string): Promise<boolean>` — `isSharedWithMe(id)` e, se `member?.driveFolders` não é null, `isWithinFolders` com cache de pais (mesmo TTL de 10 min do arquivo).
  - `onlyVisible(member, ids: string[]): Promise<string[]>` — mesma ordem.

- [ ] **Step 1: Testes que falham** em `driveScope.test.ts`:
```ts
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
});
test('parseDriveFolders', () => {
  assert.equal(parseDriveFolders(null), null);
  assert.deepEqual(parseDriveFolders([]), []);
  assert.deepEqual(parseDriveFolders([{ id: '1AbCdEfGhIjK', name: 'Teste' }, { id: 'x' }, 5]), [{ id: '1AbCdEfGhIjK', name: 'Teste' }]);
});
```
- [ ] **Step 2:** `npm test` → falha (módulo não existe).
- [ ] **Step 3:** Implementar `driveScope.ts`; em `driveAccess.ts` implementar `canSeeDriveItem`/`onlyVisible`. O teste `restrito não fura a regra base` fica garantido pela ordem: `isSharedWithMe` primeiro.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5: Commit** `feat(drive): regra de pastas liberadas por membro`

### Task 3: Aplicar nas rotas da equipe

**Files (Modify):** `src/app/api/drive/list/route.ts`, `search/route.ts`, `thumb/[id]/route.ts`, `file/[id]/route.ts`,
`video/[id]/route.ts`, `src/app/api/capa/route.ts:87`, `src/app/api/capa/[id]/selecionadas/route.ts:54`,
`src/app/api/capa/[id]/pasta/route.ts:26`, `src/app/api/capa/[id]/drive/route.ts:41`, `src/app/api/postagens/route.ts:102`

**Interfaces:** Consumes `canSeeDriveItem`, `onlyVisible` (Task 2), `member.driveFolders` (Task 1).

- [ ] **Step 1:** Trocar `isSharedWithMe(x)` → `canSeeDriveItem(member, x)` e `onlyShared(xs)` → `onlyVisible(member, xs)` nas rotas acima (thumb/file/video passam a precisar de `getActiveMember()` se ainda não usam — conferir; sem membro = 401).
- [ ] **Step 2:** `/api/drive/list` com `folder=shared` e `member.driveFolders !== null`: não consultar `sharedWithMe`; devolver
  `entries` = pastas liberadas que passam em `isSharedWithMe`, como `{ id, name, kind: 'folder' }`, `nextPage: null`.
- [ ] **Step 3:** `/api/capa/[id]/pasta`: filtrar `ids` de `collectionFolders()` com `onlyVisible(member, ids)`.
- [ ] **Step 4:** `/api/capa/[id]/drive`: se `!(await canSeeDriveItem(member, parent))` → `fail('blocked', 403)`.
- [ ] **Step 5:** `/api/postagens`: se `member.driveFolders !== null` → 403 `{ error: 'drive_restrito' }`.
- [ ] **Step 6:** `npx tsc --noEmit` e `npm run lint` sem erros novos.
- [ ] **Step 7:** Conferir no localhost com dois logins (um "Tudo", um com 1 pasta): o restrito vê só a pasta no navegador do
  Drive e na busca; colar na barra `/api/drive/thumb/<id de fora>` → 403; com `[]` → navegador vazio; o "Tudo" igual a antes.
- [ ] **Step 8: Commit** `feat(drive): rotas respeitam as pastas do membro`

### Task 4: Editor na tela Equipe e Histórico

**Files:**
- Create: `src/components/team/DriveFoldersEditor.tsx`
- Modify: `src/components/team/TeamPanel.tsx` (tipo `TeamMember`, select da linha ~157, cartão do membro, `describeActivity`)

**Interfaces:**
- Produces: `DriveFoldersEditor({ value, onSave, busy }: { value: DriveFolder[] | null; onSave: (next: DriveFolder[] | null) => void; busy: boolean })`.
- Consumes: `GET /api/drive/search?q=` → `{ folders: DriveFolderHit[] }`; `update()` de `PeoplePanel`.

- [ ] **Step 1:** Editor: controle segmentado "Tudo | Só estas pastas"; no modo restrito, campo "buscar pasta pelo nome…" (debounce
  300 ms, mínimo 2 letras, mostra `nome · parentName`), lista de pastas escolhidas com ✕, botão "Salvar acesso ao Drive".
  Mesmo visual dos controles do `PermissionEditor`.
- [ ] **Step 2:** No cartão de cada membro ativo (só para quem tem `gerenciar_pessoas`), mostrar o editor; salvar com
  `run(id, () => update(id, { drive_folders: next }), 'Acesso ao Drive de X atualizado.')`. Membro restrito mostra um selo
  "Drive: N pasta(s)".
- [ ] **Step 3:** `describeActivity`: caso `equipe.drive_alterado` → `Drive de {pessoa}: tudo` (pastas null) ou
  `Drive de {pessoa}: só {nomes separados por vírgula}` / `Drive de {pessoa}: nenhuma pasta`.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 5:** No localhost: escolher 1 pasta para o membro de teste, salvar, conferir Histórico e o efeito da Task 3; voltar para "Tudo".
- [ ] **Step 6: Commit** `feat(equipe): escolher pastas do Drive por pessoa`; atualizar o CLAUDE.md (seção Regras → Google Drive) com uma linha sobre `drive_folders`.
