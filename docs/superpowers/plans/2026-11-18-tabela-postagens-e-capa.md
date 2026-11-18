# Tabela de postagens + Aprovação de capa — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar a planilha "POSTAGENS INSTA 2025" (Drive, só leitura) numa aba priorizada e reativar a Aprovação de capa com corte pela Thereza, datas de cada escolha e confirmação do social media.

**Architecture:** Rota de servidor baixa o arquivo pelo Drive (`driveFetch`, escopo `drive.readonly` já existente), lê com `exceljs` e entrega linhas já normalizadas por uma função pura (`parsePostagens`). A aba de capa reaproveita `CoverApprovalPanel mode="capa"`; o link público ganha upload de corte validado pelo token e o painel ganha "Confirmar capas".

**Tech Stack:** Next.js 16 App Router, Supabase (service role nas rotas), Cloudflare R2, exceljs, `node --test` (Node 24, type stripping) para a função pura.

**Spec:** `docs/superpowers/specs/2026-11-18-tabela-postagens-e-capa-design.md`

## Global Constraints
- Interface em pt-BR; tom visual de DESIGN.md (tokens `brand-plum`, `ink`, `surface`, `border`, `rounded-panel`/`rounded-control`).
- Ler `node_modules/next/dist/docs/` antes de usar API do Next (AGENTS.md).
- Planilha só leitura agora; nada escreve no Drive.
- Arquivo: nome contendo `POSTAGENS INSTA 2025`; env opcional `POSTAGENS_SHEET_ID` tem precedência. Aba lida: `POSTAGENS`.
- Rotas internas exigem `getActiveMember()`; rotas do link público validam `TOKEN = /^[A-Za-z0-9_-]{16,128}$/` e usam `createAdminClient()`.
- Migração SQL nova em `supabase/migrations/`, rodada manualmente; rotas devem continuar funcionando se ela ainda não rodou (padrão `isMissingColumn` → colunas legadas).
- Toda ação nova nas pastas vai para `logCoverActivity()`.
- Sem segredos em arquivos versionados.

## Review Focus
1. Planilha com células mescladas/vazias, linhas sem CASA, datas como número serial, `Date`, texto `dd/mm/aaaa` ou lixo ("None") → linha aparece, data inválida vira vazio, nada quebra.
2. Drive desconectado/expirado (401) ou arquivo não encontrado → aba mostra aviso claro com botão de reconectar / instrução, não tela branca.
3. Arquivo ser Planilha Google (export) **ou** .xlsx (download) → ambos funcionam.
4. Link público: upload de corte com token inválido, pasta inexistente, foto que não pertence à pasta, URL fora do R2 → 404/400, nada gravado.
5. Confirmar capas antes da resposta da Thereza ou duas vezes → botão desabilitado antes da resposta; segunda confirmação apenas atualiza data, sem duplicar registro estranho.

---

## File Structure
- Create `src/lib/postagens.ts` — tipos + `parsePostagens()` + `excelDate()` + `prioritize()` (puro, sem imports com `@/`).
- Create `src/lib/postagens.test.ts` — testes `node --test`.
- Create `src/app/api/postagens/route.ts` — localiza/baixa arquivo, lê com exceljs, devolve JSON.
- Create `src/components/postagens/PostagensTable.tsx` — aba.
- Modify `src/app/page.tsx` — plataformas, aba `postagens`, aba `capa`, retorno do Drive.
- Modify `tsconfig.json` — excluir `**/*.test.ts`. `package.json` — script `test`.
- Create `supabase/migrations/20261118_capa_thereza.sql`.
- Create `src/app/api/capa-link/[token]/crop/route.ts`.
- Modify `src/app/capa/[token]/page.tsx`, `src/app/api/capa-link/[token]/route.ts`, `src/lib/covers.ts`, `src/lib/covers-server.ts`, `src/app/api/capa/[id]/route.ts`, `src/components/drive/CoverApprovalPanel.tsx`, `CLAUDE.md`.

---

### Task 1: Parser da planilha (função pura)

**Files:** Create `src/lib/postagens.ts`, `src/lib/postagens.test.ts`; Modify `tsconfig.json` (exclude), `package.json` (`"test": "node --test src/**/*.test.ts"`).

**Interfaces — Produces:**
```ts
export interface PostagemRow {
  line: number;              // nº da linha na planilha
  atualizado: string;        // coluna ATUALIZADO (condomínio)
  casa: string;
  ultimaPostagem: string | null;   // ISO 'YYYY-MM-DD'
  observacoes: string;
  qualif: string;            // QUALIF CORRETORAS
  entradaSite: string | null;      // ISO
  postagens: string[];       // todas as POSTAGEM com data, em ordem crescente, ISO
  bloqueada: boolean;        // /n[aã]o (publicar|postar|pode publicar)/i em qualif ou observacoes
}
export function excelDate(value: unknown): string | null;
export function parsePostagens(rows: unknown[][]): PostagemRow[]; // rows[0] = cabeçalho
export function prioritize(rows: PostagemRow[], today: string): (PostagemRow & { diasSemPostar: number | null })[];
```
- Colunas achadas pelo cabeçalho (sem acento, minúsculo, trim): `atualizado`, `casa`, `ultima postagem`, `observacoes`, `qualif corretoras`, `data entrada site`, e **todas** as colunas `postagem`.
- `ultimaPostagem` = valor da coluna se válido, senão a maior de `postagens`.
- `prioritize`: não bloqueadas antes das bloqueadas; dentro de cada grupo, `ultimaPostagem` nula primeiro, depois mais antiga primeiro; empate por `casa` (localeCompare pt-BR). `diasSemPostar` = dias entre `ultimaPostagem` e `today`.

- [ ] **Step 1: Testes que falham** em `postagens.test.ts` (`import { test } from 'node:test'; import assert from 'node:assert/strict'; import { ... } from './postagens.ts'`):
  - `excelDate(46118)` → `'2026-04-06'`; `excelDate(new Date(Date.UTC(2026,0,2)))` → `'2026-01-02'`; `excelDate('15/02/2026')` → `'2026-02-15'`; `excelDate('None')`, `excelDate('')`, `excelDate(null)` → `null`.
  - `parsePostagens` com cabeçalho real `['ATUALIZADO','Suites','CASA','Base Feed','Ultima Postagem','','OBSERVAÇÕES','QUALIF CORRETORAS','PROPRIETÁRIO','Data entrada site','POSTAGEM','POSTAGEM','POSTAGEM']` e linhas:
    - `['ALTOS DE ITAPOROROCA',4,'Altos 06',null,46235,'SIM','',  'PARA VENDA','',45882,46040,46173,46235]` → `postagens` = `['2026-01-18','2026-05-31','2026-08-01']`, `entradaSite` `'2025-08-13'`, `bloqueada` false.
    - `['ala','',null,46330]` (sem casa) → ignorada.
    - `['X',6,'Altos 13','',null,'SIM','Não postar por enquanto','NÃO PUBLICAR','',null,45995]` → `bloqueada` true, `ultimaPostagem` `'2025-12-04'` (vinda das postagens).
  - `prioritize` com A (nunca postada), B (2026-01-01), C (2026-06-01), D (bloqueada, nunca) e today `'2026-11-18'` → ordem `A,B,C,D`; `diasSemPostar` de B = 321.
- [ ] **Step 2:** `npm test` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar. Serial Excel: `Date.UTC(1899,11,30) + n*86400000`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(postagens): parser da planilha de postagens`.

### Task 2: Rota `GET /api/postagens`

**Files:** Create `src/app/api/postagens/route.ts`; `npm i exceljs`.

**Interfaces:**
- Consumes: `parsePostagens`, `prioritize` (Task 1); `driveFetch`, `DriveNotConnectedError`, `getDriveAccessToken` (`src/lib/google/drive.ts`); `getActiveMember`.
- Produces: `GET` → `200 { file: { id, name, modifiedTime }, rows: ReturnType<typeof prioritize> }` | `401 {error:'unauthorized'}` | `409 {error:'drive_not_connected'}` | `404 {error:'file_not_found'}` | `422 {error:'sheet_not_found'}`. Header `Cache-Control: private, no-store`. `export const runtime = 'nodejs'`.

- [ ] **Step 1:** Localizar arquivo: `POSTAGENS_SHEET_ID` ou `driveFetch('/files', { q: "name contains 'POSTAGENS INSTA 2025' and trashed = false", fields: 'files(id,name,mimeType,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '5', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives' })`; preferir mimeType de planilha (Google Sheets ou xlsx).
- [ ] **Step 2:** Baixar bytes: Google Sheets → `/files/{id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; xlsx → `/files/{id}?alt=media&supportsAllDrives=true`.
- [ ] **Step 3:** `new ExcelJS.Workbook().xlsx.load(buffer)`; aba cujo nome normalizado é `postagens`; converter para `unknown[][]` usando `cell.value` (tratar objetos `{result}` de fórmula e `{richText}` → texto).
- [ ] **Step 4:** Verificar: `npm run dev`, logado, `curl` com cookie ou abrir `/api/postagens` no navegador → JSON com ~800+ linhas; desconectar Drive (ou token inválido) → 409.
- [ ] **Step 5:** Commit `feat(postagens): rota que lê a planilha do Drive`.

### Task 3: Aba "Tabela de postagens" e limpeza das Plataformas

**Files:** Create `src/components/postagens/PostagensTable.tsx`; Modify `src/app/page.tsx` (lista `platforms` ~l.376, `DashboardTab` l.99, render das abas ~l.910).

**Interfaces:** Consumes `GET /api/postagens` (Task 2). Produces `export function PostagensTable(): JSX.Element`.

- [ ] **Step 1:** `page.tsx`: remover Facebook/YouTube/LinkedIn (e ícones sem uso). Seção Plataformas = Instagram (`setPlatform`) + botão "Tabela de postagens" (ícone `Table2`) que faz `setActiveTab('postagens')`. Adicionar `'postagens'` a `DashboardTab` e renderizar `<PostagensTable />`.
- [ ] **Step 2:** `PostagensTable`: cabeçalho com nome do arquivo + "Atualizado no Drive em …" + botão Atualizar; filtros: busca por casa, select Atualizado, select Qualif. corretoras, checkbox "Mostrar bloqueadas" (padrão ligado, ficam no fim esmaecidas). Colunas: Prioridade (nº) · Casa (+ Atualizado abaixo) · Última postagem + selo "há X meses"/"Nunca postada" · Observações · Qualif. · Entrada no site · Postagens (`1ª dd/mm/aa → última dd/mm/aa · N`, clique expande lista). Mobile: cartões em vez de tabela.
- [ ] **Step 3:** Estados: carregando; 409 → cartão "Google Drive desconectado" com link `/api/auth/google/login`; 404 → "Planilha não encontrada no Drive (nome POSTAGENS INSTA 2025)"; erro genérico.
- [ ] **Step 4:** Verificar no navegador (localhost): plataformas só Instagram + Tabela; ordem bate com a regra; filtros combinam; layout em 375px sem rolagem horizontal da página. `npm run lint`.
- [ ] **Step 5:** Commit `feat(postagens): aba Tabela de postagens`.

### Task 4: Migração + reativar aba Aprovação de capa

**Files:** Create `supabase/migrations/20261118_capa_thereza.sql`; Modify `src/app/page.tsx`, `src/lib/covers.ts`, `src/lib/covers-server.ts`.

**Interfaces — Produces:**
- SQL: `cover_collection_photos` + `edited_by text`, `edited_at timestamptz`; `cover_collections` + `confirmed_by text`, `confirmed_at timestamptz`.
- `CoverPhoto` + `editedBy: string | null; editedAt: string | null`; `CoverCollectionDetail` + `confirmedBy: string | null; confirmedAt: string | null`.
- `PHOTO_COLUMNS_V2` / `COLLECTION_COLUMNS_V2` com fallback para as atuais quando `isMissingColumn`.

- [ ] **Step 1:** Escrever migração (idempotente, `add column if not exists`).
- [ ] **Step 2:** Atualizar `toPhoto`, `loadCollection`, `toSummary` com fallback.
- [ ] **Step 3:** `page.tsx`: `'capa'` em `DashboardTab`; item "Aprovação de capa" (ícone `ImageUp`) logo após "Grade do feed" na sidebar e no nav do topo; render `<CoverApprovalPanel mode="capa" />`; NotificationBell passa `target` direto (sem mapear capa→fotos); retorno do Google usa `sessionStorage[DRIVE_RETURN_KEY]` (`'capa'|'fotos'`, padrão `'fotos'`) em vez de fixar `'fotos'`.
- [ ] **Step 4:** Verificar: aba abre com as 3 pastas de teste; login Google iniciado da aba capa volta para ela. `npm run build`.
- [ ] **Step 5:** Commit `feat(capa): volta a aba Aprovação de capa`.

### Task 5: Thereza corta a capa no link

**Files:** Create `src/app/api/capa-link/[token]/crop/route.ts`; Modify `src/app/capa/[token]/page.tsx`, `src/app/api/capa-link/[token]/route.ts`.

**Interfaces:**
- `POST /api/capa-link/[token]/crop` body `{ step: 'url', fileId }` → `{ uploadUrl, publicUrl }` (chave `uploads/capa-<collectionId>-<rand>.jpg`, `image/jpeg`, 900 s); body `{ step: 'save', fileId, edited: { url, width, height, label } }` → grava via `cleanEdited` + `edited_by = APPROVER_LABEL`, `edited_at = now()`, loga `logCoverActivity(..., 'corte da aprovadora', { foto })`; `{ step:'save', fileId, edited:null }` volta ao original. 404 se token/pasta inválidos ou `fileId` não pertencer à pasta (pasta = fotos da coleção **ou** filhos da pasta do Drive já aceitos por `thumb/[fileId]` — reutilizar a mesma checagem).
- Reaproveitar criação do S3Client extraindo `signR2Upload(key, contentType)` de `src/app/api/upload-url/route.ts` para `src/lib/r2.ts`.

- [ ] **Step 1:** Extrair `signR2Upload` e usar nas duas rotas.
- [ ] **Step 2:** Implementar rota de corte.
- [ ] **Step 3:** Página `/capa/[token]`: botão "Cortar" em cada capa → `InstagramImageEditor` com `src=/api/capa-link/{token}/thumb/{id}?s=2000`, `contentType='CARROSSEL'`, `initialFormatId='ig-carrossel-4x5'`; ao aplicar: pede URL, faz PUT, salva; miniatura passa a mostrar o corte com "Cortada por você · dd/mm hh:mm"; opção "Voltar à original".
- [ ] **Step 4:** Verificar: cortar no link → painel interno mostra o corte; token inválido → 404 (`curl -X POST .../capa-link/xxx/crop`).
- [ ] **Step 5:** Commit `feat(capa): Thereza corta a capa pelo link`.

### Task 6: Datas da Thereza + Confirmar capas

**Files:** Modify `src/lib/covers.ts` (`photoStamp`), `src/app/api/capa/[id]/route.ts` (PATCH), `src/components/drive/CoverApprovalPanel.tsx` (detalhe, ~l.718).

**Interfaces:** PATCH `/api/capa/[id]` aceita `{ confirm: true }` → só se `responded_at` não nulo e há capa aprovada; grava `confirmed_by = member.name`, `confirmed_at = now()`; `logCoverActivity(..., 'capas confirmadas', { capas: [nomes] })`. Permissão: a mesma que o PATCH já exige.

- [ ] **Step 1:** `photoStamp`: para fotos com ação da Thereza, linhas completas com data e hora: "Escolhida por Thereza em 18/11/2026 às 14:32", "Adicionada às capas por Thereza em …", "Cortada por Thereza em …" (formato `dd/mm/aaaa 'às' HH:mm`).
- [ ] **Step 2:** Detalhe da pasta (`mode==='capa'`): bloco "Resposta da Thereza" listando cada capa escolhida com as datas acima; botão "Confirmar capas" (desabilitado sem resposta); depois mostra "Confirmado por {nome} em …". Fila/grade: selo "Confirmada" quando `confirmedAt`.
- [ ] **Step 3:** Verificar fluxo completo no localhost: social media cria pasta, marca ★, corta, gera link → Thereza (aba anônima) escolhe, puxa foto de "Encontrar mais fotos", corta, envia → painel mostra datas → Confirmar → Registro e Histórico mostram as ações. `npm run lint && npm run build && npm test`.
- [ ] **Step 4:** Atualizar `CLAUDE.md` (aba capa ativa de novo, Tabela de postagens, migração 20261118, env `POSTAGENS_SHEET_ID`).
- [ ] **Step 5:** Commit `feat(capa): datas da Thereza e confirmação das capas`.
