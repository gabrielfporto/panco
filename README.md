# Panco — finanças pessoais

Aplicativo pessoal com Next.js, Expo, Supabase e Pluggy. O site é estático e pode ser publicado no GitHub Pages com domínio próprio. Autenticação, dados e integrações ficam no Supabase.

## Abrir localmente

Requer Node.js 22+ e pnpm 10.28.2.

```sh
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Abra `http://localhost:3000`. Sem configuração, a tela de login oferece **Explorar demonstração**. Ela usa dados fictícios e perde alterações ao recarregar; não cria cadastro real nem acessa a Pluggy.

```sh
pnpm build
pnpm preview
pnpm mobile
```

`build` gera `apps/web/out/`; `preview` serve esses arquivos. `mobile` inicia o Expo. O aplicativo nativo usa SDK 57 / React Native 0.86.3; a exportação Android é um bundle JavaScript, não um APK.

## Colocar no ar e conectar suas contas

Siga [PUBLICAR.md](PUBLICAR.md), na ordem indicada. O guia cobre banco, login, cadastro, Secrets, GitHub Pages e domínio.

- **Cadastro:** e-mail, senha de pelo menos 8 caracteres, nome preferido e telefone com DDD. Confirmação por e-mail; telefone é um dado do perfil, sem login por SMS.
- **Adicionar conta → Conta manual:** nome, tipo e saldo atual. Aceita saldo zero ou negativo.
- **Adicionar conta → Conectar com Pluggy:** cole o Item ID do banco. O backend consulta o Item com suas credenciais, registra a conexão e importa as contas/cartões associados. O ID de uma conta individual não substitui o Item ID.
- **Sincronizar contas:** atualiza todos os Items já cadastrados. Se houver falha após importar parte dos dados, tente novamente; registros e páginas concluídas ficam salvos sem duplicação.

As integrações e a IA aceitam apenas o UUID configurado em `PANCO_OWNER_ID`, com e-mail confirmado. Outros usuários, se o cadastro permanecer aberto, só podem acessar seus próprios dados por RLS e não podem usar suas credenciais Pluggy. Para uso individual, desative novos cadastros no Supabase depois de criar o seu. Não remova a autorização do backend.

## Onde preencher as credenciais

| Configuração | Local |
| --- | --- |
| URL e chave pública Supabase | `apps/web/.env.local` e Variables do GitHub Actions |
| URL e chave pública Supabase para Expo | `apps/mobile/.env` |
| Client ID / client secret Pluggy | **Supabase → Edge Functions → Secrets** |
| UUID do seu usuário (`PANCO_OWNER_ID`) | Secrets do Supabase, após seu cadastro |
| Chave/modelo de IA e segredo de webhook | Secrets do Supabase |

Os arquivos `.env.example` têm campos vazios e instruções. Se preferir CLI, copie `supabase/functions/.env.example` para `.env` e preencha localmente. `.env` não deve ir ao GitHub. Nunca use prefixos `NEXT_PUBLIC_` ou `EXPO_PUBLIC_` para secrets, nem coloque o client secret em um formulário do site.

## Pluggy pessoal

Conecte suas instituições no Meu Pluggy e disponibilize os Items proxy na aplicação correspondente do Dashboard Pluggy. Use as credenciais dessa aplicação. Em seguida, adicione cada **Item ID proxy** pelo Panco. `PLUGGY_ITEM_IDS` é opcional, mantido para compatibilidade; não precisa mais editar uma lista de IDs no servidor a cada banco novo.

O Panco não depende dos produtos pagos de enriquecimento: usa `merchant.name` quando disponível e descrição como fallback, com categorias e recorrências próprias. Dados disponíveis dependem do banco/conector. Não há atualização bancária forçada por `PATCH /items`.

### Webhook opcional

Depois de adicionar o Item no Panco, registre na Pluggy a URL `https://SEU_PROJECT_REF.supabase.co/functions/v1/pluggy-webhook` para `transactions/created`, `transactions/updated`, `transactions/deleted` e `item/updated`.

Configure o header `x-panco-webhook-secret` com o mesmo valor forte de `PLUGGY_WEBHOOK_SECRET`. O header antigo `x-auro-webhook-secret` continua aceito para migração. O webhook só processa Items previamente cadastrados para o proprietário, nunca cria vínculos a partir de notificações desconhecidas.

A importação usa `GET /v2/transactions`, cursor `next`/`after`, e `GET /transactions/{id}` para consulta individual. Cada chamada processa até duas páginas; o cliente continua enquanto `more=true`. Webhooks grandes retornam 503 após salvar a continuação; se o provedor esgotar as tentativas, execute a sincronização pelo app.

### Contrato `/sync`

Todas as chamadas exigem JWT do proprietário confirmado:

```json
{}
```

Lista Items cadastrados. Para registrar/validar um Item e importar contas:

```json
{"itemId":"ITEM_ID","register":true}
```

Para atualizar snapshots, omita `register`. Para importar transações ou faturas da conta já vinculada:

```json
{"itemId":"ITEM_ID","accountId":"ACCOUNT_ID"}
{"itemId":"ITEM_ID","accountId":"ACCOUNT_ID","bills":true}
{"itemId":"ITEM_ID","investments":true}
```

Repetir a chamada de transações enquanto `more=true`. O servidor verifica a associação conta/Item.

## Atualizar uma instalação anterior

Preservamos os nomes das quatro migrations e das funções SQL internas `auro_*` para não quebrar bancos já existentes. Se as migrations 001–004 já foram aplicadas, execute somente `005_profile.sql`. Se o banco for novo, execute as cinco em ordem. O Secret antigo `AURO_OWNER_ID` também é aceito; `PANCO_OWNER_ID` tem prioridade. O nome exibido no site e no aplicativo agora é Panco.

## Regras financeiras implementadas

- Transação sempre vinculada a **uma conta ou um cartão**, nunca nenhum ou ambos. FKs compostas impedem relações entre proprietários diferentes.
- Dinheiro em `numeric` no PostgreSQL; centavos `bigint` no domínio compartilhado. Os gráficos e a formatação usam números apenas para apresentação.
- Parcelas futuras ficam marcadas como projeções. Reimportar a mesma transação não duplica registros. Reconciliação comprovada substitui a projeção, preservando uma ocorrência por plano/parcela.
- O Open Finance não fornece um ID universal de compra parcelada. Uma correspondência automática requer plano único e data original de compra coincidente. Situações ambíguas retiram as projeções duvidosas do cálculo, preservam o lançamento real e aparecem para conciliação na tela Transações. A previsão sinaliza registros para revisar.
- Quando falta `merchant.name`, a regra usa a descrição normalizada; não há promessa de identificação de marcas por enriquecimento pago.
- `billId` e datas bancárias prevalecem. Sem eles, usa-se a data da transação e os dias configurados. Compra após fechamento entra no ciclo seguinte. Adiamento explícito atua uma vez, sem avançar novamente em cada consulta. Dias 29–31 são limitados ao último dia do mês. A data original não é substituída pelo dia da importação.
- Fatura fechada não é fatura paga. O valor bancário prevalece sobre a estimativa. O total já pago é o maior entre pagamentos informados pelo banco e pagamentos locais reconciliados, evitando somá-los duas vezes.
- A previsão parte dos snapshots atuais elegíveis. Soma receitas pendentes, desconta despesas pendentes e saldo de faturas a vencer. Ajusta lançamentos confirmados posteriores ao snapshot, considera atrasados por padrão e separa moedas. Não reconstrói saldo histórico. Pressupõe que `balance_as_of` representa o instante do saldo e que lançamentos pendentes ainda não estão incluídos nele; confira o comportamento da sua instituição.
- Compras de cartão entram no fluxo de caixa pela fatura. Pagamentos pendentes vinculados não descontam novamente; pagamentos confirmados já considerados no saldo reduzem apenas a fatura restante.
- A tela Assinaturas mostra custo mensal equivalente. O botão **Programar cobranças deste mês** materializa ocorrências idempotentes. Pausar/cancelar cancela projeções futuras existentes. Para retomar cobranças já canceladas, ajuste a próxima data na edição antes de programar novamente. Uma possível correspondência bancária sinaliza a projeção para conciliação, sem somar os dois valores.
- Proventos usam movimentos `INTEREST`; aplicações, resgates e amortizações não são renda passiva. Valores sem `netAmount` são identificados como brutos. Movimentos sem ID estável não são importados automaticamente, para evitar falsa deduplicação; podem ser cadastrados manualmente. O provento não gera receita bancária duplicada.

O MVP assume uma fatura regular por cartão/mês de vencimento. Faturas extraordinárias no mesmo mês exigem ampliar essa chave. Estimativas de parcelas usam o valor observado e não adivinham diferenças de arredondamento/juros nas últimas parcelas.

## Assistente

Configure `OPENAI_API_KEY` e `OPENAI_MODEL` no servidor com um modelo disponível na sua conta. O custo de IA é separado do plano do Pluggy. Nenhuma chamada é feita sem configuração.

A função usa Responses API com function calling estrito e duas ferramentas de leitura: `spending_summary` e `forecast`. Os argumentos são validados; consultas usam o JWT do usuário e RLS. Cards são montados com resultados reais das ferramentas e renderizados por componentes React/React Native. Não há execução de SQL, HTML ou JSX enviados pelo modelo. Até seis mensagens anteriores são enviadas como contexto, com `store:false`; o histórico não é salvo no banco.

## Estrutura

```text
apps/web/                       Next.js, Tailwind, componentes por feature
apps/mobile/                    Expo, telas nativas, estilos Panco
packages/core/src/
  features/transactions/        Datas, ciclos e normalização Pluggy
  money.ts                      Cálculo monetário exato
  theme.ts                      Tokens compartilhados
packages/react-features/src/    Hook, contratos e demonstração para web/mobile
supabase/functions/
  _shared/                      HTTP, autorização, adapter Pluggy e ingestão
  sync/                         Importação autenticada em lotes
  pluggy-webhook/                Eventos autenticados por header
  assistant/                    Function calling com consultas autorizadas
supabase/migrations/            Schema, RPCs, triggers e consistência
tests/                         Domínio, adapter HTTP e PostgreSQL embarcado
```

Web/desktop compartilham a interface responsiva; mobile usa componentes nativos. As regras e consultas ficam nos módulos compartilhados/RPCs. A UI mobile oferece todos os módulos de consulta, criação simples, categorização e gestão básica; conciliação detalhada, lançamentos parcelados manuais, edição completa de categorias e cadastro manual de proventos ficam na web nesta versão. O parcelamento importado funciona para ambos por ser processado no backend.

## Verificação

```sh
pnpm test
pnpm test:sql
pnpm typecheck
pnpm build
pnpm --filter @panco/mobile exec expo export --platform android
```

Os testes SQL usam PostgreSQL embarcado via PGlite, com `auth.users`, roles e `auth.uid()` simulados, executando as migrations reais. Isso valida SQL/constraints/RLS/transações, mas não substitui o deploy e os testes com Supabase Auth, Realtime e Edge Runtime hospedados.

Testado: dinheiro decimal, fechamento e ano bissexto, fallback sem merchant, paginação `next`, bloqueio de host externo, isolamento de dados, conta XOR cartão, previsão/pagamento sem dupla contagem, idempotência, conciliação de parcela, preservação de categoria manual, eventos antigos, cancelamento, programação de assinaturas, rollback de cursor e lease concorrente, além do perfil criado pelo cadastro.

Não foram usados dados ou credenciais reais. Login hospedado, entrega de webhook, conta Pluggy, chamadas de IA e execução em aparelho físico dependem da configuração do proprietário. A interface é uma base funcional pessoal, não uma integração bancária já conectada.

## Fontes oficiais

- [Meu Pluggy — configuração de API pessoal](https://meu.pluggy.ai/api-guide)
- [Pluggy — o que inclui o plano gratuito](https://v2.docs.pluggy.ai/en/docs/get-started/contact)
- [Pluggy — paginação atual de transações](https://v2.docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor)
- [Pluggy — eventos e headers de webhook](https://v2.docs.pluggy.ai/en/reference/webhooks)
- [Pluggy — parcelas e reconciliação](https://v2.docs.pluggy.ai/en/docs/products/credit-card-installments)
- [Pluggy — movimentos de investimentos](https://v2.docs.pluggy.ai/en/docs/products/investment-transactions)
- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [OpenAI — function calling](https://developers.openai.com/api/docs/guides/function-calling)
