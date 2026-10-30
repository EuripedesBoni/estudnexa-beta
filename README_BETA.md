# ESTUDNEXA 4.0 — Beta privado

**Novo nome de trabalho** para o MedAtlas. A busca pública inicial não garante disponibilidade jurídica do nome. Verificar INPI, domínios e lojas antes da marca definitiva.

## Já implementado

- Mantém autenticação e dados individuais de estudo no projeto Supabase existente. Não altera nomes internos de armazenamento.
- Página Meu perfil: nome público, universidade, período, cidade, biografia, interesses, visibilidade e foto até 2 MB.
- Comunidade: publicações com disciplinas, resumos/perguntas, comentários, curtidas, anexos PDF/imagem até 8 MB e denúncias.
- Novas tabelas Supabase com RLS aplicadas: student_profiles, community_posts, community_comments, community_likes, community_reports.
- Buckets privados student-avatars e community-materials criados, com restrições de formato/tamanho e uploads por pasta do usuário.
- **O site público atual MedAtlas NÃO foi substituído por este beta.**

## Como testar com segurança

Faça backup dos estudos atuais antes de uma atualização. Teste o beta em uma página separada ou em uma cópia do repositório; configure o novo endereço em Authentication → URL Configuration para receber e-mails de confirmação/recuperação. Nunca envie chave service_role, senha administrativa, tokens ou códigos de recuperação para o GitHub.

**Atenção:** esta versão usa o mesmo banco de dados do MedAtlas. Faça um teste controlado com a própria conta antes de convidar outras pessoas. Não exclua o projeto do Supabase.

## Pendências para lançamento público

1. Verificação aprofundada de marca/INPI e disponibilidades em lojas e domínios.
2. SMTP externo confiável e política de cadastro em massa/antispam.
3. Revisão da LGPD, contato do responsável, termos de uso e consentimento da comunidade.
4. Moderação efetiva de denúncias, remoção de materiais não autorizados e prevenção contra spam.
5. Exclusão de arquivos físicos após excluir uma conta; limites por usuário e de armazenamento.
6. Testes de RLS com **duas contas reais**, uploads, visibilidade e atualização entre dois aparelhos.
7. Revisão de segurança da senha e configuração Auth.
8. Implementar atualização de publicações e perfis de outros estudantes, se desejado.

A confirmação de que a tabela existe e a auditoria automática inicial do Supabase não substitui testes de segurança.
