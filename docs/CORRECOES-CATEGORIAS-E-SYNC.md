# Categorias, planejamento e sincronização — 09/10/2026

- Planejamento e categorias separados somente em Entradas e Saídas. Catálogo padrão com 3 entradas e 10 saídas; emojis editáveis e cards responsivos.
- Categorias antigas equivalentes consolidadas uma vez, somando os orçamentos por mês e direção. Mesada, Inquilino e demais receitas anteriores passam a Outros ganhos; Ressarcimentos passa a Ressarcimento. Despesas antigas sem finalidade clara permanecem sem categoria para revisão. Categorias personalizadas continuam permitidas.
- Exclusão de categoria via `panco_delete_category`, com confirmação na interface. Quando há vínculos, exige substituição compatível, transfere movimentos, assinaturas e regras, soma orçamentos e só então exclui a categoria. Operação transacional com RLS, bloqueio por usuário e validação de proprietário. Não recria categorias excluídas no login seguinte.
- Filtro bancário compartilhado no cliente e no SQL inclui `RES APLIC AUT MAIS` e `APL APLIC AUT MAIS`. Preserva dados brutos e saldo informado pelo banco; exclui da listagem, calendário, totais e previsão.
- A [referência da Pluggy](https://v2.docs.pluggy.ai/en/reference/transaction/transactions-retrieve) define `billForecastDate` como `YYYY-MM`. O normalizador agora envia `bill_forecast_month`; a ingestão prioriza uma fatura existente ou calcula o vencimento com o dia do cartão. Sem esse dia, sinaliza revisão, sem inventar vencimento no dia 1. Datas completas antigas continuam aceitas.

## Validação

21 testes unitários; PostgreSQL/PGlite com migrations completas e cenário de atualização; catálogo exato, soma de orçamentos, exclusão com/sem vínculos, isolamento entre usuários, não recriação e período de fatura. Tipagem web e testes de cache sem recarga. Conferência responsiva em 320, 390, 768 e 1440 px.

Na migração de produção, hashes comparativos confirmaram preservação dos 861 lançamentos (exceto categoria/data de atualização), das quatro contas e dos totais planejados por mês/direção.
