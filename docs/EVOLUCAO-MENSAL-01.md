# Evolução mensal — entrega 1

Publicação incremental de outubro de 2026. Infraestrutura, IDs, contas e integrações existentes foram reutilizados.

## Entregue

- Cache em memória por sessão; leitura em segundo plano mantém as telas montadas.
- Categoria otimista com rollback e bloqueio da linha durante gravação; respostas antigas não substituem a edição.
- Primeiro salvamento manual confirma a gravação antes de fechar o formulário; releitura acontece em segundo plano.
- Seletor compartilhado de mês/ano na web (visão geral, planejamento, transações e calendário).
- RPC `monthly_overview`: estimado/real de receitas e despesas, resultados e diferenças por categoria.
- Grupos essenciais/não essenciais e ordem editáveis em Categorias.
- Inicialização idempotente das categorias solicitadas, mantendo IDs e nomes existentes. Categorias amplas não são convertidas silenciosamente; aparecem em Gastos a organizar.
- Categorias arquivadas com histórico ou orçamento continuam aparecendo no relatório.
- Realtime para categorias e planejamento; nenhum serviço Pluggy foi substituído.

## Contrato financeiro desta etapa

O saldo bancário é preservado. Resultado mensal é receita menos despesa e não se confunde com o saldo da conta. Planejamento é em BRL; realizado inclui movimentações confirmadas regulares, exclui projeções/transferências e o filtro de resgates. A data do provedor segue o calendário UTC recebido; a data manual usa o fuso do perfil. Parcelas e fechamento continuam usando o contrato existente, até a fase específica de crédito. O futuro relatório de caixa e a competência editável não estão implementados nesta entrega.

## Compatibilidade e migração

Antes da expansão: 204 colunas e 21 funções financeiras conferidas com a instalação recriada. PK/FK/unique/check conferidos; NOT NULL tem representação diferente no catálogo da versão local e foi conferido pelas colunas. O histórico remoto não contém 001–005, portanto não executar db push indiscriminadamente nem reaplicar essas migrations. A expansão foi aplicada como migration isolada e aditiva. A regularização do histórico pelo CLI permanece uma tarefa operacional separada.

Migration: `20261008201655_monthly_planning_foundation.sql`. Ela preserva registros existentes e adiciona campos, duas RPCs e publicação Realtime. A inicialização de categorias ocorre no próximo carregamento autenticado, uma única vez por usuário. A flag de inicialização impede reintroduzir categorias apagadas/arquivadas e desfazer decisões posteriores de agrupamento.

## Validação

- Unitários existentes e SQL passaram; banco vazio e upgrade sobre banco de testes preenchido.
- Testes SQL de seed repetido, IDs preservados, edição de grupo preservada, totais, fuso, pendentes/cancelados/projeções, pagamentos vinculados, moeda, arquivadas e isolamento entre usuários.
- Typechecks compartilhado, web e Expo.
- Navegador offline: 320/390/768/1440 px, quatro telas, salvamento de orçamento, navegação e ausência de overflow/erros JS.
- `tests/browser-cache.cjs`: React real com respostas controladas, categoria otimista, falha/rollback, respostas fora de ordem, filtros/scroll, token refresh e isolamento após logout.
- Para repetir o teste de navegador, disponibilize Playwright e esbuild; execute `node tests/browser-cache.cjs`. Opcionalmente use PANCO_PLAYWRIGHT_MODULE para o módulo e PANCO_CHROME para o executável Chromium/Chrome. Nenhum dado real é usado nesse teste.
- Depois da migration, fingerprints de transações/contas/cartões/faturas/investimentos/categorias/orçamentos anteriores permaneceram iguais. RPC validada em produção sob papel authenticated, em transação somente leitura.

## Próximas etapas do plano

Conciliação geral manual/importada e proteção por campo; categorização por IA; edição em massa; catálogo de pagamentos; fechamento estimado e parcela por total; contribuições e histórico de investimento; dívidas; relatórios completos; metas; recomendações baseadas em dados. Essas funcionalidades não devem ser descritas como concluídas por esta entrega.
