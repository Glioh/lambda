# ADR 0003: Standardize Lambda Application APIs on Fastify HTTP

- Status: Accepted
- Date: 2026-08-18

## Decision

Lambda application operations use Fastify-owned HTTP routes. Normal CRUD and
application operations use REST-style HTTP semantics. Streaming AI responses use
SSE. WebSocket or other realtime protocols are added only when a real feature
requires one.

tRPC is intentionally removed from Lambda's target architecture. Client type
safety comes from explicit API request/response schemas and contracts rather than
router inference. TanStack Query remains the web query and cache layer, used over
a typed HTTP client.

The target flow is:

```text
apps/web
  -> HTTP / SSE
  -> apps/api / Fastify
  -> services
  -> repositories / integrations
  -> PostgreSQL / external providers
```

Fastify routes are transport-only. They own authentication, input validation,
HTTP status and error mapping, serialization, and SSE mechanics where applicable.
Business behavior lives in services. Persistence lives in repositories. External
systems live in integrations.

## Why

Fastify is becoming a true standalone API boundary, and Lambda will eventually
support a separate mobile repository. Maintaining tRPC, HTTP, and SSE creates two
normal application API styles. One explicit HTTP contract is easier to understand,
document, test, reuse, and expose to future clients. Converting directly now
avoids moving tRPC into Fastify only to remove it later.

## Consequences

- The web client keeps TanStack Query and consumes Kubb-generated Fetch
  clients and query factories from the Fastify-generated OpenAPI document.
- API contracts are authored as TypeBox schemas under
  `apps/api/src/contracts` and are used by Fastify for params, query, bodies,
  successful responses, and useful expected errors.
- `apps/api/openapi.json` is generated from the registered Fastify routes,
  validated by Redocly, and consumed by Kubb to generate
  `packages/api-client/src/generated`.
- Generated OpenAPI and client output are committed; CI checks that generation
  produces no diff.
- Timestamps such as `createdAt` and `updatedAt` are serialized as ISO-8601
  strings over HTTP.
- A consistent error envelope is preferred, for example
  `{ "statusCode": 404, "code": "NOT_FOUND", "error": "Not Found", "message": "Project not found." }`.
- OpenAPI is a generated, language-independent consumer boundary. There is no
  separately maintained contract package or hand-written OpenAPI file.
- When integration fails because a dependency is too old, update it to a
  compatible supported version rather than adding a compatibility shim.
- Unauthorized resource access may remain an indistinguishable 404 where needed
  to prevent resource-existence disclosure.
- `npm run generate:api` is the single contract-to-client generation command;
  generated OpenAPI and client files are committed and CI checks for drift.
- Shared schemas represent meaningful reusable API concepts, not every structural
  composition. Give `$id`s to reusable DTOs and contracts such as `Project`,
  `ProjectListItem`, `Message`, and `ErrorResponse`; inline trivial operation
  composition such as `Type.Array(schemaRef(ProjectListItemSchema))` and simple
  nullable unions. Do not create `FooListResponseSchema` merely to name `Foo[]`.

## Relationship to earlier ADRs

This ADR supersedes transport-specific tRPC guidance elsewhere in the repository.
It does not supersede ADR 0001's valid domain, ownership, isolation, or transaction
decisions, or ADR 0002's canonical Chat terminology.
