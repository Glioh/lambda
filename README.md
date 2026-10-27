# Lambda

Lambda uses npm workspaces for its independently runnable web and API applications.

## Getting Started

Use Node.js 24 LTS, install dependencies, then start both applications:

```bash
npm install
npm run dev
```

Web runs at [http://localhost:3000](http://localhost:3000). API runs at
[http://localhost:4000](http://localhost:4000), with health available at
`GET /api/health`.

Run either application independently with `npm run dev:web` or `npm run dev:api`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## API structure

`apps/api/src` uses flat architectural layers:

| Location | Responsibility |
| --- | --- |
| `routes/` | HTTP endpoints and route-specific types |
| `database/` | Prisma client, transaction composition, and persistence layer |
| `database/repositories/` | Resource-specific database queries |
| `services/` | Application behavior and business validation |
| `integrations/` | External provider calls, including title generation |
| `contracts/` | TypeBox schemas used by Fastify and the OpenAPI/client pipeline |
| `plugins/` | Fastify setup, authentication hooks, and public/protected route registration |
| `auth/` | Lambda principal/resolver definitions and the Clerk adapter |

`app.ts` constructs services and passes them into routes through the protected API
plugin. Routes do not construct repositories or call vendors. Services use repositories
and injected integration functions. `database/client.ts` owns Prisma,
`database/database.ts` composes repositories and transaction boundaries, and
`database/repositories/` owns persistence operations. `server.ts` owns process startup
and shutdown. Shared application errors live in `common/errors.ts`, and server configuration in
`config.ts`.

`attachments.ts` owns attachment constants, types, and validation. `contracts/` owns
the shared `MessageInput` shape. `message.service.ts` and `project.service.ts` each
keep private message/attachment application validation. Rollback query helpers remain
private to the message repository.
Fastify request state and accessors live in `plugins/auth.plugin.ts`; Clerk-specific
resolution lives in `auth/clerk.ts`.

Keep types and helpers with their owners. Use `routes/types.ts` only for types shared
by HTTP modules. Add directories when responsibilities grow, not merely to separate
types or utilities. Tests live under `apps/api/test`, grouped by source ownership, and
the test command discovers them automatically.

Run `npm run format`, `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm run test --workspace @lambda/api`, and `npm run check:api-generated` when
changing the API. Structural refactors should leave generated contracts unchanged.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
