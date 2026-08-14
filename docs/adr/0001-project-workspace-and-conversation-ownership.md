# ADR 0001: Project Workspace and Conversation Ownership

- Status: Accepted
- Date: 2026-08-12

## Context

The application uses `Project` for the workspace routed at `/projects/[projectId]`. A project is the user-facing chat workspace and may contain multiple conversations. Conversations contain messages, attachments, context checkpoints, generated results, and related execution state.

Current code is divided among `projects`, `messages`, `attachments`, and `context`, while important completion behavior also lives in the Next.js chat route. Existing file placement and imports show coupling, but do not define correct domain ownership.

The intended product model is:

- A project is a chat workspace.
- A project may contain multiple conversations.
- Each conversation owns its messages, attachments, context, and conversation-specific results.
- The project owns its conversations and project-level artifacts.
- Deleting a project deletes every conversation and everything else it owns.

## Decision

### Domain model

`Project Workspace` is the top-level domain concept. The existing `Project` record represents that workspace until naming changes are separately designed and scheduled.

Each project may contain multiple conversations. A conversation is owned by exactly one project. It cannot outlive its project or be reassigned independently unless a future ADR introduces an explicit transfer feature.

Each conversation has an isolated message and context lifecycle. Messages or context from one conversation must never be used in another conversation implicitly.

### Ownership and deletion

A project exclusively owns:

- its conversations;
- project-level generated files and application output;
- project-level previews, sandbox state, and execution metadata;
- project title and activity metadata;
- usage records existing solely for that project, subject to required billing or audit retention.

Each conversation exclusively owns:

- its messages;
- attachments, including attachments submitted with its initial message;
- context windows, checkpoints, summaries, and compaction state;
- conversation-specific generated results and execution metadata;
- conversation title and activity metadata, if those features are conversation-scoped.

Deleting a conversation deletes its messages, attachments, context state, and conversation-specific results. Deleting a project deletes every conversation and all other project-owned data and artifacts.

Database-owned deletion should be atomic where practical. External storage, provider, or sandbox cleanup must be idempotent and retryable. Immutable billing, security, or audit records may be retained when required, but must not retain live workspace content unnecessarily.

### Cardinality

```text
Project Workspace 1 ── * Conversations
Conversation      1 ── * Messages
Message           1 ── * Attachments
Conversation      1 ── * Context checkpoints
Project Workspace 1 ── * Generated artifacts
```

Every conversation must reference exactly one project. Whether a new project may temporarily contain zero conversations is an implementation detail. Normal user-facing project creation should create its initial conversation atomically.

### Transaction boundaries

Application use cases own transaction boundaries. Transport handlers and generic data helpers do not open independent nested transactions.

Operations requiring explicit atomicity include:

- creating a project with its initial conversation, message, and attachments;
- creating another conversation within an existing project;
- editing or retrying from a message when later messages, attachments, checkpoints, or generated state must be invalidated together;
- claiming and applying title or activity updates without overwriting newer state;
- deleting a conversation and its database-owned children;
- deleting a project and all database-owned conversations and children.

Helpers participating in a transaction must accept the active Prisma transaction client.

AI calls, streaming responses, and external cleanup cannot remain inside a database transaction. Their application services must define partial-failure, retry, idempotency, and compensation behavior.

### Context lifecycle

Context exists to serve one conversation. Checkpoints and summaries belong to that conversation and follow its deletion and invalidation rules. Context must be selected using both project and conversation identity where needed to prevent cross-conversation leakage.

The focused context subsystem may remain separated into token counting, window planning, compaction, and constants. Lifecycle ownership does not require flattening those responsibilities into one file.

### Attachment lifecycle

Attachments belong to a conversation and, once persisted, to a specific message. Initial-message and later-message attachments use the same browser-safe public input contract.

Attachment preparation, validation, rendering, and persistence may remain a cohesive capability. Physical separation does not grant attachments an independent lifecycle.

### Dependency direction

```text
Next.js/tRPC transport
        ↓
project and conversation application use cases
        ↓
domain policies and public capability contracts
        ↓
Prisma, AI provider, storage, and sandbox adapters
```

Rules:

- Transport authenticates and validates transport input.
- Application use cases enforce project membership, conversation ownership, authorization, and business policy.
- UI code must not import server implementation code.
- Infrastructure adapters must not own prompts or domain policy.
- Cross-capability imports must use declared public contracts rather than deep imports.
- Generic utilities must not depend on application modules, Prisma, Clerk, or Next.js server APIs.
- Folder placement alone does not establish ownership; lifecycle and transaction rules do.

## Implementation strategy

This ADR does not authorize a broad directory collapse or rename. Work proceeds through behavior-preserving changes:

1. Add characterization tests for streaming, cancellation, timeout, compaction, attachments, persistence races, and conversation isolation.
2. Establish one browser-safe attachment input contract.
3. Extract HTTP parsing and SSE encoding from the Next.js route.
4. Extract a typed completion use case that requires both project and conversation identity.
5. Keep timeout, cancellation, accumulated output, and persistence coordination cohesive until tests reveal stable seams.
6. Isolate provider transport behind an application-owned interface.
7. Split completion, compaction, and title prompts by owning use case.
8. Extract named project and conversation use cases from large tRPC procedures.
9. Move files only when semantic ownership and dependency evidence justify each move.
10. Enforce dependency rules for new code with narrow temporary exceptions for known legacy violations.
11. Reassess physical module layout after transaction and import boundaries are visible.

Each commit should make one behavior-preserving change. Domain, database, and route renames must not be mixed into chat-route extraction.

## Consequences

### Positive

- Multiple conversations can share one project without sharing messages or context.
- Product lifecycle and deletion semantics are explicit.
- Authorization and transaction boundaries gain clear owners.
- Attachments and context retain focused implementations without becoming independent domains.
- Refactoring can be judged against domain behavior rather than folder aesthetics.

### Tradeoffs

- Current schema and routes may not yet represent conversation identity explicitly.
- Existing `Project` and `chat` terminology may remain ambiguous during migration.
- Some capabilities may remain physically separate despite shared lifecycle ownership.
- External deletion requires retryable cleanup beyond one database transaction.
- Billing or audit retention may require carefully scoped deletion exceptions.

## Deferred decisions

- Whether routes, database models, and code identifiers should distinguish `Project`, `Workspace`, and `Conversation` more explicitly.
- Whether a project may exist without any conversations.
- Exact physical folder structure after application services are extracted.
- Durable idempotency mechanisms for completion persistence and external cleanup.
- Retention requirements for usage, billing, security, and audit records.

Any change to conversation ownership, cross-conversation isolation, or owned-child lifecycle requires a new ADR that supersedes this decision.
