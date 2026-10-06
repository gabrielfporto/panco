# Publicar o Panco no seu GitHub e domínio

O pacote contém o código-fonte e o workflow `.github/workflows/pages.yml`. Coloque o **conteúdo do projeto na raiz do repositório**, incluindo a pasta oculta `.github`; não coloque tudo dentro de uma pasta adicional `Panco/`. O workflow gera os arquivos finais do site. O GitHub Pages hospeda a interface; Supabase executa login, banco e funções. Subir apenas o HTML não configura esses serviços.

## 1. Supabase: preparar banco e cadastro

1. Crie seu projeto Supabase. No SQL Editor, execute separadamente os cinco arquivos de `supabase/migrations/`, em ordem de 001 a 005. Não repita migrations já aplicadas. Para quem já usava a primeira versão, basta a 005 se 001–004 já estão aplicadas.
2. Em Authentication, habilite o provedor E-mail e **Allow new users to sign up**. Mantenha **Confirm email** ativo e senha mínima de 8 caracteres.
3. Em Authentication → URL Configuration, informe a URL completa do Panco em **Site URL** e em **Redirect URLs**. Se ainda testar localmente, adicione `http://localhost:3000/` e `http://127.0.0.1:3000/`. Depois inclua o endereço publicado, com o caminho do repositório se existir, por exemplo `https://USUARIO.github.io/REPOSITORIO/`.
4. Configure a entrega de e-mail. O serviço padrão do Supabase restringe destinatários aos endereços autorizados da equipe e tem limites; para outro e-mail, configure SMTP próprio antes do cadastro. Não desative a confirmação para contornar isso, pois a integração exige e-mail confirmado.
5. Em Project Settings → API, copie a URL e a **publishable key** (ou a chave anon legada). Apesar do nome da variável terminar em `ANON_KEY`, ela também aceita a chave publishable. Não use secret key nem service role.

Você pode testar primeiro localmente: copie `apps/web/.env.example` para `.env.local`, preencha as duas variáveis e execute `pnpm dev`. No Expo use `apps/mobile/.env`. Nunca publique esses arquivos locais.

## 2. GitHub Pages

1. Crie/abra seu repositório e envie os arquivos do projeto. Não envie `node_modules`, `.next`, `.env`, `work` ou `outputs` (o `.gitignore` já os exclui). Inclua `pnpm-lock.yaml`, `supabase/`, `apps/`, `packages/`, `scripts/`, `tests/` e `.github/`.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable key/anon pública.
3. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
4. Faça um push para `main` ou `master`, ou execute **Actions → Publicar Panco → Run workflow**. O workflow valida, gera e publica o site. Ele bloqueia publicação sem as duas variáveis para evitar lançar uma demonstração por engano.
5. Abra a URL indicada na execução. Se alterar essas variáveis posteriormente, rode o workflow novamente: elas entram no JavaScript durante o build.

Para domínio próprio: configure **Settings → Pages → Custom domain**, siga os registros DNS exibidos/documentados pelo GitHub e habilite **Enforce HTTPS** quando disponível. O workflow calcula o caminho base automaticamente pelo Pages, tanto para `USUARIO.github.io/REPOSITORIO` quanto para domínio próprio. Após trocar de domínio, rode o workflow novamente e atualize URLs de redirecionamento do Supabase e `ALLOWED_ORIGINS`.

O site público contém a tela de login e o código da interface. Seus dados financeiros são consultados no Supabase após autenticação e protegidos por RLS.

## 3. Criar seu cadastro no Panco

1. No Panco, escolha **Criar cadastro**.
2. Preencha nome preferido, e-mail, telefone com DDD e senha.
3. Confirme pelo link enviado ao e-mail e entre no app. A confirmação abre a URL do site configurada. No aplicativo nativo, confirme pelo navegador e depois volte ao app para entrar com senha.
4. Em Supabase → Authentication → Users, copie o **UUID** do usuário criado. Ele será o `PANCO_OWNER_ID`. Esse valor é o ID do usuário Supabase, não seu e-mail nem Item ID bancário.
5. Como só você usará, desative **Allow new users to sign up** depois de criar sua conta. Seu login continuará funcionando. A interface de cadastro continuará disponível, mas o Supabase recusará novos cadastros.

O telefone é salvo em seu perfil; não é verificado por SMS. A senha é gerenciada pelo Supabase Auth, não fica em uma tabela de perfil do Panco.

## 4. Pluggy: preencher no lugar certo

Em **Supabase → Edge Functions → Secrets**, adicione:

| Nome | O que preencher |
| --- | --- |
| `PLUGGY_CLIENT_ID` | Seu client ID da aplicação Pluggy |
| `PLUGGY_CLIENT_SECRET` | Seu client secret da mesma aplicação |
| `PANCO_OWNER_ID` | UUID copiado após o cadastro |
| `ALLOWED_ORIGINS` | Origem do seu site, sem barra final e sem caminho. Ex.: `https://panco.seudominio.com` ou `https://USUARIO.github.io` |
| `PLUGGY_WEBHOOK_SECRET` | Valor aleatório forte, se habilitar webhooks |
| `OPENAI_API_KEY` e `OPENAI_MODEL` | Opcionais, apenas para ativar o assistente real |

Para testar localmente, acrescente as origens locais em `ALLOWED_ORIGINS`, separadas por vírgula. Não envie o secret no chat, não coloque nas Variables do GitHub e não salve no frontend. O arquivo `supabase/functions/.env.example` contém o mesmo formulário em texto para preenchimento local, caso prefira usar a CLI.

## 5. Publicar as funções do backend

O repositório inclui `supabase/config.toml`, imports compartilhados e funções `sync`, `pluggy-webhook` e `assistant`. Use a CLI oficial Supabase (autenticada na sua conta) na raiz do projeto. Consulte `supabase --help`, `supabase link --help` e `supabase functions deploy --help` para sua versão.

```sh
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy sync
supabase functions deploy pluggy-webhook
supabase functions deploy assistant
```

Se preencheu um `.env` local em vez do painel, consulte `supabase secrets set --help` e carregue com:

```sh
supabase secrets set --env-file supabase/functions/.env
```

Não é necessário repetir as migrations pelo CLI se já foram aplicadas no SQL Editor. As funções usam `verify_jwt=false` no gateway porque validam a sessão explicitamente com `auth.getUser()` e exigem seu UUID; o webhook valida seu próprio header secreto. Não remova essa validação. Os secrets padrão do Supabase são injetados no backend.

## 6. Adicionar suas contas

1. Conecte seus bancos no Meu Pluggy e disponibilize os Items proxy na aplicação do Dashboard Pluggy correspondente às suas credenciais.
2. Copie o **Item ID** do banco.
3. No Panco, abra **Contas e cartões → Adicionar conta → Conectar com Pluggy**.
4. Cole o Item ID e clique **Conectar e importar**. Um Item pode importar conta corrente, cartões e investimentos disponíveis. Repita para os outros bancos.
5. Para dinheiro em espécie ou contas que você quer controlar por conta própria, escolha **Conta manual**, informe nome, tipo e saldo atual. Zero e valores negativos são aceitos.

Se aparecer “Configure PANCO_OWNER_ID”, falta o Secret do passo 4. Se a Pluggy retornar indisponível/404, confira se o Item pertence à aplicação dessas credenciais e se você usou o Item proxy correto. Se parte da importação falhar, use Sincronizar contas para retomar. Os dados manuais persistem no Supabase depois do login; no modo demonstração eles não persistem.

## Referências oficiais

- [Exportação estática do Next.js](https://nextjs.org/docs/app/guides/static-exports)
- [Workflow do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Domínio próprio no GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Cadastro Supabase](https://supabase.com/docs/reference/javascript/auth-signup)
- [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls)
- [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
- [Meu Pluggy](https://meu.pluggy.ai/api-guide)
- [Consultar Item](https://v2.docs.pluggy.ai/en/reference/items/items-retrieve)
