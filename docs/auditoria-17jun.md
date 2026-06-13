# Re-auditoria Sobrou 2.0 — preparação para apresentação de 17/06

> Auditoria somente leitura, feita em 11/06/2026 sobre o estado atual do `main`
> (último commit: `c06f626` — integração Sentry). Todos os apontamentos citam
> arquivo e linha verificados no código real. Nenhuma chave, DSN ou token está
> reproduzido neste documento.

---

## 1. Visão geral da arquitetura

O app é um cliente React Native (Expo SDK 54, JavaScript puro) que fala direto com o Supabase — não existe camada de API própria: cada tela consulta e grava nas 6 tabelas (`empresas`, `membros`, `produtos`, `lancamentos_sobras`, `producao`, `lotes`) via PostgREST, e a segurança multi-tenant depende inteiramente de RLS no banco. A estrutura é enxuta e fácil de navegar (8 telas, 1 service, 1 context, 1 utils), mas as telas são monólitos que misturam acesso a dados, regra de negócio e UI — `LancamentoScreen.js` tem 2.625 linhas, `PainelScreen.js` 2.140 e `ProdutosScreen.js` 1.862. É uma arquitetura honesta para um produto de uma pessoa em produção numa padaria real: simples, funcional, com boas decisões pontuais de resiliência — porém sem transações no fluxo crítico e com autorização de papéis visível apenas no cliente.

---

## 2. Pontos fortes (o que está bem feito de verdade)

- 🟢 **Timeout global de rede.** Todo fetch do Supabase passa por `fetchWithTimeout` com abort em 15s (`src/services/supabase.js:103-119`). Nenhuma chamada fica pendurada para sempre — isso é mais do que muito app em produção tem.
- 🟢 **Sessão em SecureStore com chunking.** O adapter quebra o token em pedaços de 1800 bytes para contornar o limite do SecureStore, com limpeza de chunks órfãos (`src/services/supabase.js:58-101`). Solução correta para um problema real que a maioria ignora.
- 🟢 **Boot resiliente.** `App.js` faz warm-up ping em paralelo ao `getSession` (`App.js:104-114`) e o `checkEmpresa` tem 2 tentativas com timeout de 6s e delay entre elas (`App.js:50-98`).
- 🟢 **Multi-tenancy consistente no cliente.** Todas as queries filtram por `empresa_id` — verificado em todas as telas. Nenhuma query de dados de negócio sem o filtro.
- 🟢 **RPCs para casos que precisam furar RLS** (`vincular_convite` em `src/screens/OnboardingScreen.js:37-38`, `criar_empresa` em `OnboardingScreen.js:87-88`) em vez de afrouxar as policies das tabelas. Padrão certo.
- 🟢 **KPI de prejuízo com custo nulo bem resolvido** (mudança recente). `calcularPrejuizo` separa itens com e sem custo (`src/utils/lancamentos.js:30-46`); a UI mostra "custo não informado" quando nenhum item tem custo e o badge "N itens sem custo" quando é parcial (`src/screens/InicioScreen.js:410-426`). Honesto com o usuário, sem mostrar R$ 0,00 enganoso.
- 🟢 **Validação do formulário de lançamento com erro por campo** e scroll automático até o campo com problema (`src/screens/LancamentoScreen.js:747-807` + `scrollToField` em 728-731).
- 🟢 **Guarda de saída com sacola pendente.** Listener `beforeRemove` impede sair da tela com itens não confirmados (`src/screens/LancamentoScreen.js:319-337`).
- 🟢 **Preview antes de importar XLSX** (`src/screens/ProdutosScreen.js:426-431`) e import em batches com contador de progresso (`ProdutosScreen.js:442-452`).
- 🟢 **Postura de versão deliberada.** SDK 54 pinned, dependências em versões estáveis e coerentes entre si (`package.json`). Para um app em produção, congelar e só atualizar com motivo é a postura certa.
- 🟢 **Sentry integrado corretamente** para crash: `Sentry.wrap(App)` (`App.js:243`), plugin no `app.json` e Metro config com source maps (`metro.config.js:1-3`).

---

## 3. Pontos fracos / riscos

### 🔴 Críticos

**3.1 — O fluxo de salvar lançamento não é atômico (é AQUI que a fila de retry vai mexer)**
`handleSave` (`src/screens/LancamentoScreen.js:747-903`) faz até **4 escritas sequenciais sem transação**:

1. insert em `producao` (linha 817)
2. insert em `lotes` (linha 833)
3. insert em `lancamentos_sobras` (linha 868)
4. update de baixa em `lotes` (linha 877)

Se a rede cair entre o passo 1 e o 3 (cenário comum: wifi de padaria), o banco fica em estado parcial — produção registrada, sobra não. O usuário vê o erro, aperta salvar de novo e **duplica a produção e o lote**. Não há chave de idempotência: como o abort de 15s pode disparar *depois* do servidor já ter gravado, até um único insert "que falhou" pode na verdade ter sido gravado, e o retry manual duplica o lançamento.

O mesmo padrão existe na sacola (`LancamentoScreen.js:501-521`): N inserts em loop; falha no item k deixa k itens gravados e o usuário sem saber o que entrou. Agravante: o retry da sacola regrava do zero.

*Por que é crítico:* é o coração do app, o pitch do produto é confiabilidade do registro de sobras, e qualquer dev na apresentação vai perguntar "e se cair a rede no meio?". A resposta hoje é "estado parcial + risco de duplicata". **Recomendação central: antes de construir a fila de retry no cliente, mover essas escritas para uma RPC transacional única (ex.: `salvar_lancamento`) que receba um `client_uuid` para idempotência. A fila de retry fica trivial e segura em cima disso; sem isso, a fila vai automatizar a duplicação.**

**3.2 — Autorização por papel existe só no cliente (a confirmar no banco)**
No código, `isAdmin` é estado React derivado de uma query em `membros.papel` (`src/screens/EquipeScreen.js:65`, `src/screens/ProdutosScreen.js:34`) e só esconde botões/early-returns de UI (`EquipeScreen.js:372,401,439,469`; `ProdutosScreen.js:270`). As escritas sensíveis vão direto na tabela: convite/insert em `membros` com papel escolhido pelo cliente (`EquipeScreen.js:248-256`), delete de membro (`EquipeScreen.js:284-288`), update de `empresas.nome` (`EquipeScreen.js:194-197`).

Como a anon key é pública por design (`src/services/supabase.js:5-7` — correto para mobile), qualquer **operador** autenticado pode, com um curl, inserir a si mesmo como `admin` em `membros`, remover colegas ou renomear a empresa — **a menos que as policies de RLS chequem `papel`, e isso não é verificável pelo repositório** (não há nenhum SQL versionado no projeto). Se a trava existe no banco, este item cai para 🟢 e vira um ponto forte a exibir no dia 17. Se não existe, é a vulnerabilidade nº 1 do produto.

### 🟡 Médios

**3.3 — Boot offline desloga o usuário.** Se há sessão salva mas o `refreshSession()` falha (ex.: app aberto sem internet), o código trata qualquer erro como sessão inválida e faz `signOut` local (`App.js:129-138`). Erros de rede do auth são retryable; deslogar o padeiro às 5h da manhã porque o wifi caiu obriga a re-login quando voltar a conexão. Deveria distinguir erro de rede (manter sessão, tentar depois) de token realmente inválido.

**3.4 — Timeout no boot manda usuário existente para o Onboarding.** Se as 2 tentativas de `checkEmpresa` estouram timeout, o código assume `hasEmpresa = false` (`App.js:65-67`) e renderiza `OnboardingScreen`. Lá, se `vincular_convite` também falhar por rede, o formulário de "criar empresa" aparece (`OnboardingScreen.js:42-46`) — um usuário que **já tem** empresa pode criar uma segunda sem querer. Depende de `criar_empresa` ter guarda no servidor (não verificável pelo repo).

**3.5 — Schema e policies não estão versionados.** Não existe nenhum arquivo `.sql`/migration no repositório. As 6 tabelas, o `get_my_empresa_id()`, as policies de RLS e as 2 RPCs vivem só no dashboard do Supabase. Para apresentar a devs (e para vender), o banco precisa ser reproduzível: um diretório `supabase/migrations` resolveria e permitiria revisar a segurança em código.

**3.6 — Consulta cross-empresa por e-mail no convite.** `EquipeScreen.js:238-243` busca `membros` por e-mail **sem filtro de `empresa_id`** para reaproveitar `user_id`/nome de quem já tem conta em outra empresa. Sob RLS escopada por empresa, isso retorna vazio (a feature silenciosamente não funciona cross-empresa); se retorna dados, é vazamento entre tenants. Nos dois cenários, o código não faz o que aparenta.

**3.7 — Convite é um insert direto em `membros` com `user_id` nulo** (`EquipeScreen.js:246-256`), vinculado depois pelo `vincular_convite` na criação da conta. Não há verificação de posse do e-mail: quem criar conta com o e-mail convidado entra na empresa. Para o modelo atual (dono convida funcionário presencialmente) é aceitável, mas é uma pergunta certa dos devs: e-mail digitado errado = estranho dentro dos seus dados.

**3.8 — Valores da sacola gravados só no primeiro item.** `valor_cheio`/`valor_recebido` da venda vão apenas na linha `i === 0` (`LancamentoScreen.js:512-513`); os demais itens ficam com `null`. Funciona para o KPI de hoje, mas é uma modelagem frágil: excluir/editar justamente o primeiro item apaga o valor da venda inteira, e qualquer relatório por produto atribui toda a receita a um item arbitrário. O correto seria uma tabela `vendas` (cabeçalho) com itens filhos.

**3.9 — Mensagens de erro cruas na cara do usuário.** Fora do login (que tem `translateError`, `LoginScreen.js:91`), erros do Supabase são exibidos no original em inglês técnico: `setError(insErr.message)` (`LancamentoScreen.js:873`), `Alert.alert('Erro', error.message)` (`EquipeScreen.js:200,228,259` etc.). Um abort de timeout vira algo como "AbortError: Aborted" na tela do padeiro.

**3.10 — Sentry só vê crashes, não vê falhas de negócio.** Não há nenhum `Sentry.captureException`/`captureMessage` no código — os erros de Supabase morrem em `console.error`. Justamente as falhas que importam para o produto (lançamento que não salvou, RPC que falhou) não geram telemetria. Integração barata: capturar exceção nos catches do fluxo de salvar.

**3.11 — `xlsx` 0.18.5 do npm tem advisories conhecidas** (prototype pollution / ReDoS; as correções da SheetJS saíram só no CDN deles, não no npm). `package.json:33`. Risco real é moderado — só admin importa (`ProdutosScreen.js:270`) e o arquivo vem do picker do próprio usuário — mas `npm audit` acusa, e os devs do dia 17 vão rodar `npm audit`. Vale ter a resposta pronta (mitigação atual) ou trocar a fonte do pacote pelo tarball oficial da SheetJS. **Não** é preciso mexer no `detectarFormato` para isso.

**3.12 — `@expo/ngrok` em `dependencies`** (`package.json:12`). É ferramenta de túnel de desenvolvimento; deveria estar em `devDependencies` (ou global). Não vai parar no bundle do app, mas é o tipo de coisa que reviewer aponta em 30 segundos.

**3.13 — Boot duplicado em todas as telas; `EmpresaContext` subutilizado.** Existe um `EmpresaProvider` que resolve `userId`/`empresaId` (`src/context/EmpresaContext.js`), mas o único consumidor é o `AppHeader` (`src/components/AppHeader.js:21`). Cada tela refaz `getUser` + query em `membros` no mount (`LancamentoScreen.js:166-222`, `InicioScreen.js:82-124`, `EquipeScreen.js:67-109`, `PainelScreen.js:156+`, `ProdutosScreen.js:77+`) — são 5 implementações do mesmo boot, com tratamentos de erro ligeiramente diferentes. Consolidar no context elimina ~150 linhas e uma classe inteira de inconsistência.

**3.14 — Resiliência desigual entre telas.** `LancamentoScreen` tem `withTimeout` de 10s por query com mensagens dedicadas (`LancamentoScreen.js:64-87`); as outras telas dependem só do timeout global de 15s e algumas funções de load nem têm try/catch (ex.: `loadProdutosVencendoHoje`, `LancamentoScreen.js:275-291`, faz a query sem `withTimeout` nem catch — se rejeitar, vira unhandled rejection silenciosa; `loadPlanejamentoAmanha` idem, linhas 628-648). O padrão bom existe, só não foi aplicado uniformemente.

### 🟢 Observações OK (sem ação)

- **URL e anon key hardcoded no cliente** (`src/services/supabase.js:5-7`): correto para mobile — anon key é pública por design; a segurança deve estar no RLS (ver 3.2).
- **DSN do Sentry hardcoded** (`App.js:16-18`): DSN não é segredo; prática aceitável.
- **`produto_nome` denormalizado em `lancamentos_sobras`**: snapshot do nome no momento do lançamento é decisão defensável (histórico não muda se renomearem o produto).
- **Telas grandes não são bug**: são dívida de manutenção (itens 3.13/3.14), não risco de produção.

---

## 4. Está apto a lançar e vender?

**Código sólido?** Quase. A fundação é melhor do que o esperado para um dev iniciante — timeout global, SecureStore com chunking, multi-tenancy disciplinado, RPCs no lugar certo. Mas o **fluxo de salvar lançamento — o coração do produto — não é atômico nem idempotente** (3.1). Para um app cuja promessa é "transformar perda em informação confiável", esse é o gap que separa "funciona na Primor com wifi bom" de "aguenta qualquer padaria". A boa notícia: o conserto (RPC transacional + `client_uuid`) é pequeno, server-side, e é o pré-requisito correto para a fila de retry que você já planeja. Faça nessa ordem: RPC primeiro, fila depois.

**Produto vendável?** Para o plano Básico (1 estabelecimento), sim, com duas condições: (a) confirmar/instaurar a trava de papel no banco (3.2) — sem isso você não pode afirmar para um cliente que um operador não consegue se promover a admin; (b) resolver 3.1, porque churn de padaria vem de "lancei e sumiu/duplicou". Para o plano **Redes (5 unidades, R$ 199)**: o modelo de dados atual não suporta — todo o código assume 1 usuário → 1 empresa (`.limit(1).maybeSingle()` em `membros` em todas as telas) e não existe conceito de "unidade" separado de "empresa". Não venda esse plano antes de modelar isso.

**Minha leitura honesta para o dia 17:** apresente como "app em produção real, com fundação de resiliência acima da média e dois débitos conhecidos e mapeados (atomicidade do save e enforcement de papel no banco), com plano de correção definido". Dev respeita quem conhece os próprios gaps; o que queima é gap descoberto pela plateia.

---

## 5. Perguntas em aberto para os devs (dia 17)

1. **RLS de escrita:** minhas policies hoje filtram por `get_my_empresa_id()` — qual o padrão de vocês para também checar `papel = 'admin'` em INSERT/UPDATE/DELETE de `membros` e `empresas`? Policy com subquery, função `is_admin()`, ou claim no JWT?
2. **Atomicidade:** pretendo mover produção+lote+sobra+baixa para uma RPC `salvar_lancamento` transacional com `client_uuid` único para idempotência, e construir a fila de retry do app em cima dela. Vocês fariam assim ou preferem outra abordagem (ex.: outbox local com sincronização)?
3. **Fila de retry offline:** AsyncStorage como buffer da fila é suficiente ou vale SQLite (`expo-sqlite`) pela durabilidade? Como vocês tratam o caso "abortou no cliente mas o servidor gravou"?
4. **Convites:** inserir direto em `membros` com `user_id` nulo e vincular no signup (sem token/verificação de posse do e-mail) é aceitável para o meu caso, ou vocês exigiriam uma tabela `convites` com token de uso único?
5. **Modelagem da venda em sacola:** hoje o valor da venda fica no primeiro item (`null` nos demais). Vale criar tabela `vendas` (cabeçalho/itens) agora ou só quando os relatórios exigirem?
6. **Versionamento do banco:** qual o fluxo mínimo de migrations para Supabase que vocês recomendam para dev solo (supabase CLI + `supabase/migrations` no repo)?
7. **`xlsx` 0.18.5 do npm:** com import restrito a admin e arquivo vindo do picker, vocês considerariam o risco aceitável ou trocariam para a build oficial da SheetJS fora do npm?
8. **Boot offline:** deslogar quando `refreshSession` falha por rede (vs. manter sessão e operar em modo leitura/fila) — como vocês tratam isso em apps de operação diária?
9. **Multi-unidade (plano Redes):** dado o modelo atual (1 user → 1 empresa), vocês modelariam "unidade" como tabela filha de `empresas` ou como empresas irmãs num grupo?

---

*Relatório gerado por auditoria somente leitura em 11/06/2026. Nenhum arquivo de código foi alterado.*
