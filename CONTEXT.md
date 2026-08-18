# Lambda

Lambda is an AI workspace application.

A user owns Project Workspaces. Each Project Workspace contains one or more Chats.
Chats contain Messages and may branch into other Chats.

## Canonical language

### Project Workspace

A user-owned workspace containing Chats and project-level artifacts.

Use: `Project Workspace`
Avoid using `Project` when referring to the product/domain concept unless referring
to the current legacy database/code identifier.

### Chat

A user-visible discussion owned by exactly one Project Workspace.

A Chat owns:

- Messages
- Attachments associated with those Messages
- Chat history
- Context checkpoints and summaries
- Chat-specific execution/results

Use: `Chat`
Avoid: `Conversation`, `thread`

### Message

A user or assistant turn belonging to exactly one Chat.

Messages must not be shared implicitly between Chats.

### Branch

A Chat created from another Chat at a Branch Point.

A Branch evolves independently from its parent after the branch point and may
itself have child Branches.

### Branch Point

The Message in the parent Chat where a Branch begins.

## Domain model

Target domain model:

Project Workspace
├── Chat
│   ├── Messages
│   │   └── Attachments
│   ├── Context / checkpoints
│   └── child Branches
│
└── Chat
    └── independent Messages / context

Important:

- A Project Workspace may contain many Chats.
- A Chat belongs to exactly one Project Workspace.
- A Message belongs to exactly one Chat.
- Chat history and context are isolated by Chat.
- One Chat must never implicitly consume Messages or context from another Chat.
- Deleting a Chat deletes its Chat-owned data.
- Deleting a Project Workspace deletes its Chats and Project-owned data.

## Current architectural direction

Lambda is moving toward one repository with two independently runnable applications:

lambda/
├── apps/
│   ├── web/        # Next.js / React
│   └── api/        # Fastify / TypeScript
├── packages/
└── prisma/

Runtime direction:

Web
 ↓
HTTP / SSE
 ↓
Fastify
 ↓
Services
 ↓
Repositories / Integrations
 ↓
PostgreSQL / external providers

Responsibilities:

- Next.js owns the web application.
- Fastify owns Lambda's application HTTP API. Normal application operations use
  REST-style HTTP routes, streaming operations use SSE, and client contracts are
  defined by explicit API schemas rather than tRPC router inference.
- Services own Lambda behavior and business rules.
- Repositories own persistence mechanics.
- Integrations own communication with external vendors/protocols.
- Prisma must remain backend-only.
- Authentication libraries must remain behind a Lambda-owned auth boundary.
- Local development uses real authenticated accounts through the configured auth provider. Lambda does not maintain a fake-user or no-auth development bypass.

## Architecture principles

1. Preserve behavior while migrating architecture.
2. Keep the architecture simple today and extensible tomorrow.
3. Prefer conventional, obvious folder names and responsibilities.
4. Do not introduce abstractions without a current reason for them.
5. Do not let framework/vendor types leak into Lambda services.
6. Own Lambda product semantics; use mature infrastructure for commodity mechanics.
7. Verify exact installed dependency versions and current documentation before
   implementing architecture-sensitive library code.
8. Each migration step must leave Lambda runnable and testable.

## Source of truth

For detailed architecture decisions, read:

- `docs/adr/0001-project-workspace-and-conversation-ownership.md`
- `docs/adr/0002-chat-is-the-canonical-term.md`
- `docs/adr/0003-standardize-application-api-on-fastify-http.md`

If this file conflicts with an accepted ADR, the ADR wins.

Do not infer future architecture solely from current legacy file placement or
database names.
