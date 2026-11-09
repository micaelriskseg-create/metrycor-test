# Metrycor

Plataforma de gestão para corretoras de seguros. **Fase 1:** fundação, autenticação, dashboard, CRM (Kanban personalizável), leads, clientes e tarefas.

> Projeto em desenvolvimento. Os dados de demonstração são inteiramente fictícios.

## Como rodar
Requisitos: **Node.js ≥ 22.13** (usa `node:sqlite`; não há dependências npm).

```bash
npm start          # http://localhost:3000
npm test           # testes automatizados da API
npm run reset-demo # recria o banco de demonstração
```

Login de demonstração: `admin` / `admin` (também `ana.demo`, `bruno.demo`, `carla.demo`, mesma senha).
Essa conta só é criada fora de `METRYCOR_ENV=production`; a senha pode ser trocada com `DEMO_ADMIN_PASSWORD`. Veja `.env.example`.

## Estrutura
| Caminho | Conteúdo |
|---|---|
| `server.js` | API, autenticação, regras de negócio, dados de demonstração |
| `migrations/` | Migrations SQL versionadas |
| `public/` | Interface web (JS puro) |
| `test.js` | Testes (autenticação, CRM, funil, isolamento entre corretoras, tarefas) |
| `prototype/index.html` | Protótipo visual de todos os módulos (dados simulados; abre direto no navegador) |

## Implementado
Login/registro (CPF/CNPJ validados), perfis e permissões no servidor, isolamento por corretora, funil personalizável com campos obrigatórios por etapa, Kanban com arrastar e soltar, ficha do lead com histórico, clientes, tarefas, dashboard com dados reais do banco.

## Pendente
Recuperação de senha por e-mail, Gestão Financeira, Apólices (upload + IA), WhatsApp, Relatórios, integração Meta, Kanban de tarefas no sistema real, migração para PostgreSQL/Supabase com RLS, ajuste de fuso horário.

## Decisões
- SQLite no lugar de PostgreSQL/Supabase/Next.js (ambiente de desenvolvimento sem rede). Valores monetários em centavos inteiros.
- Prêmio, corretagem e comissão no dashboard são **previstos** (oportunidades ganhas), não recebidos.
- Conversão = ganhas ÷ (ganhas + perdidas) fechadas no período.
- Nenhuma integração externa está conectada.
