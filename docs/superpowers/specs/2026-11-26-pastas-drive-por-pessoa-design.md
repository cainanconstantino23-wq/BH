# Pastas do Drive por pessoa — desenho

Data: 26/11/2026

## Por quê
O dono quer chamar uma pessoa para testar o app sem que ela veja o Drive inteiro da equipe. Hoje há uma
conexão só do Drive e todo membro com "Ver publicações" enxerga tudo de "Compartilhados comigo".
Ele quer escolher, por pessoa, quais pastas ela pode ver — e continuar vendo tudo.

## Objetivos
- Na tela Equipe, cada membro tem "Acesso ao Drive": **Tudo** (padrão, como hoje) ou **Só estas pastas**.
- Membro restrito só vê as pastas escolhidas e o que está dentro delas (subpastas, fotos, vídeos), em todas
  as telas que usam o Drive.
- Bloqueio no servidor, também por ID direto (não só esconder na tela).

## Fora do escopo
- Restringir outros dados (posts, métricas, aprovações): continuam pelas 13 permissões de sempre.
- Mais de uma conexão do Drive / Drive próprio por pessoa.
- Links públicos da Thereza (/capa, /grade): não são membros, ficam como estão.

## Anti-objetivos
- Membro restrito conseguir ver qualquer arquivo fora das pastas escolhidas (nem miniatura, nem busca).
- Mudar o que os membros "Tudo" veem hoje.
- Alterar/mover qualquer coisa no Drive (regra do projeto continua: só criar).

## Abordagens consideradas
- **A. Pastas por pessoa (escolhida):** coluna no membro; quem está restrito vê só as pastas dele. Equipe segue normal.
- B. Pastas liberadas para o app todo: mais simples, mas restringe a equipe inteira durante o teste.
- (Descartada) Conta Google de teste conectada: sem código, mas tira o Drive de todo mundo enquanto durar.

## Como funciona
**Banco** — migração `20261126_drive_pastas_membro.sql`:
`team_members.drive_folders jsonb null` — `null` = Tudo; lista `[{ "id": "...", "name": "..." }]` = só essas.
Lista vazia = não vê nada do Drive. Alteração igual às permissões: `grant update (drive_folders)` para
authenticated; a política "team_members: gestor altera" já exige `gerenciar_pessoas`. O gatilho
`log_team_activity` ganha o caso `equipe.drive_alterado` (pastas de antes/depois) para o Histórico.
Uma pasta fora de "Compartilhados comigo" na lista não libera nada: a regra atual continua valendo antes.

**Servidor**
- `getActiveMember()` passa a trazer `driveFolders: { id, name }[] | null`.
- Nova regra em `src/lib/google/driveAccess.ts`: `canSeeDriveItem(member, id)` = regra atual (`isSharedWithMe`)
  **e**, se o membro é restrito, o item é uma das pastas escolhidas ou está abaixo dela (sobe pelas pastas de
  cima, com cache igual ao atual). `onlyVisible(member, ids)` para listas.
- Aplicar nas rotas da equipe que hoje usam `isSharedWithMe`/`onlyShared`: `/api/drive/list`, `/search`,
  `/thumb`, `/file`, `/video`, `POST /api/capa`, `/api/capa/[id]/selecionadas`, `/api/capa/[id]/pasta`
  e `collectionFolders()` quando chamado pela equipe.
- `/api/drive/list?folder=shared` para restrito: em vez de "Compartilhados comigo", devolve as pastas escolhidas
  como ponto de partida.
- `/api/postagens` (planilha, fora da regra do Drive): restrito recebe 403. *(decisão minha: a planilha tem a
  lista de todas as casas.)*
- `POST /api/capa/[id]/drive` (Salvar no Drive): a pasta de destino precisa ser visível ao membro.

**Tela Equipe** (`TeamPanel.tsx`), no cartão de cada membro, abaixo das permissões:
```
Acesso ao Drive   ( Tudo | Só estas pastas )
  [ buscar pasta pelo nome…        ]
  📁 Casa 110 Vila dos Coqueiros   ✕
  📁 Teste                          ✕
```
Busca usa `/api/drive/search` (com o acesso de quem está editando). Salvar grava direto em `team_members`
(mesmo `update()` do painel), e o Histórico mostra "Drive de Fulano: só Casa 110, Teste" / "Drive de Fulano: tudo".

## Efeito esperado (avisar o dono)
Casas já salvas no app apontam para pastas do Drive; para o membro restrito as fotos de casas fora das pastas
dele aparecem vazias/bloqueadas. É o comportamento correto da restrição.

## Deixado para quem constrói
Visual exato do seletor, textos de erro, testes de `canSeeDriveItem` (puro, com `meta` injetável).
