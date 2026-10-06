# Validação do Panco — 6 de outubro de 2026

- Typecheck do domínio, funções Supabase e aplicativo Expo: aprovado.
- 13 testes automatizados de domínio, transporte Pluggy, cadastro/idempotência de Items e autorização: aprovados. HTTP e Auth simulados, sem serviços externos.
- PostgreSQL/PGlite: cinco migrations aplicadas e consultas de verificação aprovadas. Perfil recebe nome e telefone; permanecem os testes de RLS, integridade, projeções, conciliação, pagamentos, duplicidade, cursor e rollback.
- Build Next.js estático: aprovado na raiz e em subpasta `/panco-test`. Após um bloqueio de escrita em arquivos temporários no Windows, a versão final foi gerada a partir da mesma fonte em `work/web-release`, em uma pasta de build limpa.
- Exportação Android Expo: aprovada, 635 módulos. Não é um APK e não houve execução em aparelho físico.
- Navegador: campos de login/cadastro, conta manual com saldo zero, conta manual com saldo negativo de R$ 125,50, opção Pluggy por Item ID, navegação e layout de 390 px conferidos. Sem transbordamento horizontal; console sem erros na verificação da subpasta.
- Lockfile e manifests: validação frozen/offline aprovada. Workflow GitHub Pages incluído, mas não executado no GitHub.

## O que ainda depende da configuração do proprietário

Não foram fornecidas credenciais nem uma conta Supabase/GitHub para implantação. O login real, envio do e-mail de confirmação, chamadas Pluggy, webhooks, Realtime e IA não foram testados contra serviços reais. O endereço local usa demonstração com dados fictícios. O domínio público não foi configurado/publicado.

Siga PUBLICAR.md para ativar esses serviços. Só o UUID configurado como PANCO_OWNER_ID pode usar as integrações. Client secret e service role ficam no backend. O usuário pode criar o próprio cadastro pela tela; depois do primeiro cadastro, o guia recomenda desativar novos cadastros por se tratar de uso individual.
