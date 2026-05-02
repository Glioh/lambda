# Phase 1 Delivery Master Plan

Date: April 23, 2026  
Source Inputs: discovery findings + initial product/routing/architecture answers

## 1. Purpose
This document is the master execution plan for migrating Lambda from generation-first behavior to a chat-first assistant with explicit `Chat` and `Build` modes, safe routing, confirmation-gated expensive workflows, async tool runs, and artifact-first persistence.

It is written so each ticket can be delegated to a sub-agent independently.

## 2. Product Requirements Checklist (Must All Be Satisfied)
- Chat-first primary experience.
- Explicit modes (`Chat`, `Build`).
- Auto-detection + explicit user override.
- Tool execution visibility via status carousel.
- Chat is not source of truth for generated outputs.
- Dedicated run/task model with lifecycle tracking.
- Immutable artifact versions per run.
- Clarifying questions before tool execution when needed.
- Hard rule: never auto-run expensive workflows without explicit confirmation.
- Sync chat path for fast first token + streaming depth.
- Async tools via Inngest.
- Router -> Worker architecture.
- Thread-level memory in Phase 1.
- Failed run UX with error summary + retry.
- In-place migration acceptable.
- Split budget policy (generous chat, strict tools).
- Observability for routing decisions, success/failure rates, per-step latency.

## 3. Architecture Target
```text
User Input
  -> Router (rule-first + constrained model adjudication)
      -> Chat Path (sync)
      -> Build Path (requires confirmation)
           -> Run Created
           -> Inngest Worker (async)
                -> Artifact Version + Files (source of truth)
                -> Assistant response references artifact
```

## 3a. P0-1 Status (Issue #20)

| Deliverable | Status |
|-------------|--------|
| `tasks/p0-inngest-audit.md` | ✅ Done |
| Trigger inventory (2 callsites) | ✅ Done |
| Worker step breakdown (12 steps) | ✅ Done |
| DB side-effect table | ✅ Done |
| Keep/Change matrix (16 rows) | ✅ Done |
| Current-flow sequence diagram (Mermaid) | ✅ Done |
| Target router-worker sequence diagram (Mermaid) | ✅ Done |
| Gap/risk register (9 items, P0/P1/P2 severity) | ✅ Done |

---

## 4. Delivery Phases
- Phase 0: Discovery lock + baseline metrics.
- Phase 1: Routing foundation + mode contracts + confirmation gates.
- Phase 2: Split execution paths (sync chat, async build).
- Phase 3: Data model separation (messages vs runs vs artifacts).
- Phase 4: Memory/context compression (thread-level only).
- Phase 5: Observability, budget controls, rollout safety.

---

## Phase 0: Discovery Lock + Baseline

### Ticket P0-1: Current-System Inngest Audit and Keep/Change Matrix
**Outcome**: Unambiguous map of what remains unchanged vs must be adapted.

**Why this exists**
- Requirement explicitly states this analysis is the first step.
- Prevents unnecessary rewrites of stable worker components.

**Scope**
- Audit all trigger points into Inngest.
- Audit all data writes performed by current worker.
- Document coupling between message creation and worker dispatch.

**Implementation Tasks**
1. Inventory current triggering paths:
   - `projects.create`
   - `messages.create`
2. Inventory worker responsibilities in `src/inngest/functions.ts`.
3. Map all persistent side effects:
   - message creation
   - fragment creation
   - sandbox URL generation
4. Build keep/change matrix with rationale:
   - Keep: worker execution environment, tool interfaces where possible.
   - Adapt: event payload, status tracking, output persistence model.
   - Replace: implicit “every message triggers build.”
5. Create sequence diagrams:
   - Current flow.
   - Target router-worker flow.

**Deliverables**
- `tasks/p0-inngest-audit.md`
- Keep/change matrix table.
- Current vs target sequence diagrams.

**Dependencies**: none

**Acceptance Criteria**
- Every worker entry point is documented.
- Every DB side effect of worker is documented.
- Keep/change matrix signed off for next phase.

**Validation**
- Manual architecture review with checklist.

**Risks**
- Missing hidden entry points.

**Mitigation**
- Grep for `inngest.send` and event names, then verify route registration.

---

### Ticket P0-2: Baseline Metrics and Routing Risk Benchmark
**Outcome**: Baseline to compare post-refactor improvements.

**Why this exists**
- Success requires proving reduced false positives and better responsiveness.

**Scope**
- Capture baseline latency and run behavior before code changes.

**Implementation Tasks**
1. Instrument current chat submit path timing.
2. Instrument worker start/end and result state.
3. Record event frequency: messages vs builds.
4. Capture fail/success rate over representative local/staging runs.
5. Save benchmark report.

**Deliverables**
- `tasks/p0-baseline-metrics.md` with p50/p95 timings and failure rates.

**Dependencies**: P0-1

**Acceptance Criteria**
- Baseline includes:
  - First response latency.
  - Build completion latency.
  - Build trigger frequency.
  - Error rate.
- Report can be compared against post-phase metrics.

**Validation**
- Reproducible script/steps documented.

---

## Phase 1: Routing Foundation

### Ticket P1-1: Mode-Aware Input/Output Contracts (`Chat` vs `Build`)
**Outcome**: API contracts support explicit modes and routing metadata.

**Scope**
- Extend message/project submit contracts and response payloads.

**Implementation Tasks**
1. Add input fields:
   - `mode` (optional explicit override)
   - `draftForExecution` (optional)
2. Add routing metadata in response:
   - `decision`
   - `decisionSource` (`auto` or `explicit`)
   - `confidence`
   - `requiresConfirmation`
3. Maintain backwards compatibility:
   - If `mode` omitted, default to auto routing.
4. Add types shared across client + server.

**Deliverables**
- Updated router input/output schemas.
- Shared type definitions.

**Dependencies**: P0-1

**Acceptance Criteria**
- Explicit mode can be sent from UI.
- Legacy clients still work when `mode` absent.
- API returns routing metadata for observability/UI.

**Validation**
- Unit tests for schema parsing and fallback defaults.

---

### Ticket P1-2: Rule-First Router with Constrained Model Adjudication
**Outcome**: Deterministic routing that minimizes false-positive build execution.

**Scope**
- Build router module used by submit flows.

**Implementation Tasks**
1. Implement rule-first checks:
   - Explicit build intent (mode override from dropdown) -> build candidate.
   - ~~Explicit chat intent -> chat.~~ *(removed — no chat toggle exists in UI)*
2. Implement high-confidence structured intent detection.
3. Default ambiguous cases to chat (fallback, low confidence).
4. Optional model adjudication only in ambiguous middle band.
5. Enforce hard policy: expensive workflows cannot auto-execute without confirmation.
6. Emit routing decision logs with reason and confidence.

**Design decision**: Explicit chat mode removed. `RoutingInput.mode` narrowed to `"build"` only. `config.ts` deleted; rule constants live in `rules.ts` alongside matching functions.

**Deliverables**
- Routing service module (`router.ts`, `rules.ts`).
- Router decision schema.
- Rule constants in `rules.ts` (append new patterns there).

**Dependencies**: P1-1

**Acceptance Criteria**
- No auto execution of expensive build without confirm flag.
- Ambiguous prompts route to chat.
- Routing logs include reason/confidence/source.

**Validation**
- Test matrix of prompts:
  - explicit build
  - ambiguous (fallback chat)
  - high-confidence structured build

---

### Ticket P1-3: Clarification and Confirmation Gate (Server)
**Outcome**: Build flow cannot start until user confirms; underspecified requests trigger clarification.

**Status**: ✅ Done (Issue #20)

**Scope**
- Pre-execution state transitions and endpoint contracts.

**Implementation Tasks**
1. Define pre-run states:
   - `clarification_required`
   - `waiting_confirmation`
2. Add server endpoints/actions:
   - `requestClarification`
   - `confirmRun`
   - `cancelRun`
3. Build draft-edit flow for expensive run requests.
4. Ensure transitions are idempotent.
5. Add audit log entries for confirmation actions.

**Deliverables**
- Confirmation/clarification handlers (`src/modules/routing/server/procedures.ts`).
- State transition table (`src/modules/routing/state.ts`).

**Dependencies**: P1-2

**Acceptance Criteria**
- Expensive build never starts without explicit user confirmation.
- User can edit draft before confirmation.
- User can cancel pending build safely.

**Validation**
- Integration tests for state transitions and retries.

---

### Ticket P1-3b: Clarification UI - Thread-side Rendering and Form
**Outcome**: Users see and respond to clarification prompts in the chat thread.

**Scope**
- UI components + query extension to display pending runs and clarification forms.

**Implementation Tasks**
1. Extend `messages.getMany` query to include `pendingRuns`.
2. Create `ClarificationCard` component with textarea + submit/cancel buttons.
3. Render clarification card in `MessagesContainer` for `clarification_required` runs.
4. Wire form submission to `trpc.routing.requestClarification`.
5. Handle loading/error states and refresh messages on success.

**Deliverables**
- Updated `src/modules/messages/server/procedures.ts` (include pendingRuns).
- New `src/modules/projects/ui/components/clarification-card.tsx`.
- Updated `src/modules/projects/ui/components/messages-container.tsx` (render clarification card).

**Dependencies**: P1-3

**Acceptance Criteria**
- Clarification card displays when message has `clarification_required` pending run.
- User can submit answer via textarea.
- Submission transitions run to `waiting_confirmation` and refreshes thread.
- Error handling via toasts.
- Cancel button cancels run safely.

**Validation**
- E2E test: user sees clarification prompt, submits answer, run transitions.

---

## Phase 2: Execution Path Split

### Ticket P2-1: Synchronous Chat Pipeline with Streaming
**Outcome**: Chat responses are fast, streaming, and independent of worker queue.

**Status**: ✅ Done (Issue #25)

**Scope**
- Build new synchronous chat path used when router decides chat.

**Implementation Tasks**
1. Add chat service endpoint/procedure for sync responses.
2. Implement streaming response transport.
3. Assemble minimal context for fast first token.
4. Persist chat user + assistant turns without run artifact coupling.
5. Add timeout/fallback behavior.

**Deliverables**
- New chat execution path.
- Updated UI consumption for streaming.

**Dependencies**: P1-2

**Acceptance Criteria**
- First token target under 1–2 seconds in typical local/staging scenario.
- Chat path does not dispatch Inngest job.
- Streaming emits progressive output.

**Validation**
- Load test with representative prompts.

---

### Ticket P2-2: Async Build Run Pipeline via Inngest (`Router -> Worker`)
**Outcome**: Confirmed builds create tracked runs and execute asynchronously.

**Scope**
- Introduce run creation and worker dispatch by run ID.

**Implementation Tasks**
1. Create run record on build decision.
2. Dispatch Inngest event with run ID and canonical input package.
3. Update worker to:
   - mark `running` on start
   - mark `success` or `failed` on completion
4. Prevent duplicate dispatch for same confirmed run.
5. Keep chat thread responsive while run executes.

**Deliverables**
- Run dispatch service.
- Worker state update hooks.

**Dependencies**: P1-3, P2-1

**Acceptance Criteria**
- Build path is always async.
- Run states are persisted and queryable.
- Duplicate run starts are blocked.

**Validation**
- Integration test for full queued->running->success/failed transitions.

---

### Ticket P2-3: Failure Summary, Retry, and Cancellation Semantics
**Outcome**: Operationally safe run lifecycle with recovery paths.

**Scope**
- Add standardized failure payload and retry/cancel behavior.

**Implementation Tasks**
1. Define failure taxonomy (tool error, timeout, infra, validation).
2. Persist user-readable error summary on failed runs.
3. Implement `retryRun` action:
   - creates new run
   - links lineage to prior run
4. Implement cancellation rules for queued/running runs.
5. Update UI contract for retry button and state-specific actions.

**Deliverables**
- Retry/cancel endpoints.
- Failure summary schema.

**Dependencies**: P2-2

**Acceptance Criteria**
- Failed runs always expose concise error summary.
- Retry creates new run with lineage.
- Cancelled run is terminal and visible in status UI.

**Validation**
- End-to-end tests for fail->retry and queued->cancel.

---

## Phase 3: Data Model and Artifact Separation

### Ticket P3-1: Schema Migration for `Message`, `Run/Task`, `Artifact`, `ArtifactVersion`, `ArtifactFile`
**Outcome**: Scalable persistence model where chat is separate from build outputs.

**Scope**
- In-place schema migration with minimal backward-compat obligations.

**Implementation Tasks**
1. Add `Run/Task` model and status enums.
2. Add artifact models:
   - artifact/project container
   - immutable versions
   - file tree/blobs
3. Link messages to runs by reference only.
4. Add indexes for query patterns:
   - thread runs
   - run status
   - latest artifact version
5. Create migration scripts and update Prisma client.

**Deliverables**
- Prisma schema update.
- Migration files.
- Data access layer updates.

**Dependencies**: P2-2

**Acceptance Criteria**
- Chat message storage no longer acts as output source of truth.
- Run lifecycle data persists independently.
- Artifact versions are addressable by run.

**Validation**
- Migration dry run + rollback plan documented.

---

### Ticket P3-2: Artifact Write Path and Immutable Version Creation
**Outcome**: Every successful build produces a stable artifact version.

**Scope**
- Refactor worker persistence from message-attached code blobs to artifact version records.

**Implementation Tasks**
1. On successful run:
   - create artifact version
   - write file tree/blobs
   - persist metadata (runId, timestamp)
2. On failure:
   - do not mutate latest successful version.
3. Ensure message contains reference/summary, not canonical file payload.
4. Add retrieval methods for latest and historical versions.

**Deliverables**
- Worker persistence refactor.
- Artifact retrieval APIs.

**Dependencies**: P3-1

**Acceptance Criteria**
- Successful build creates one immutable version.
- Historical versions remain unchanged.
- UI can fetch latest version independently from chat history.

**Validation**
- Tests for version immutability and retrieval correctness.

---

### Ticket P3-3: Hybrid UX Routing (Thread-First, Workspace-When-Needed)
**Outcome**: Chat remains default UX while larger build work can transition to workspace context.

**Scope**
- UX behavior changes using existing project UI surfaces.

**Implementation Tasks**
1. Keep thread as default view.
2. Add workspace activation rules for substantial builds.
3. Wire status carousel to run states.
4. Add deep links from chat assistant response to artifact version/workspace.
5. Preserve manual user control of fragment/artifact selection.

**Deliverables**
- UI state rules.
- Updated message and loading components.

**Dependencies**: P2-2, P3-2

**Acceptance Criteria**
- User can complete chat-only flows without workspace interruption.
- Build flow exposes progress and artifact access clearly.
- Workspace opens only when relevant.

**Validation**
- UX walkthrough scenarios with acceptance scripts.

---

## Phase 4: Memory and Context Compression

### Ticket P4-1: Thread-Level Memory Assembly (Phase 1 scope)
**Outcome**: Stable context quality with controlled token and latency usage.

**Scope**
- Implement memory assembler using thread-level components only.

**Implementation Tasks**
1. Build context pack structure:
   - recent 10–20 messages
   - conversation summary
   - active artifact summary
   - selected working files
2. Add summarization refresh rules (event-driven or periodic).
3. Ensure context assembly is non-blocking for first token.
4. Add guards for oversized contexts.

**Deliverables**
- Memory service module.
- Context assembly contract used by chat/build prep.

**Dependencies**: P2-1, P3-2

**Acceptance Criteria**
- Thread-level memory fully functional.
- Context remains under configured budget limits.
- No project/user-level global memory introduced in Phase 1.

**Validation**
- Token budget and latency profile test.

---

### Ticket P4-2: Build Context Packaging for Worker Efficiency
**Outcome**: Tool runs get only necessary context, reducing cost and failures.

**Scope**
- Build prep package used for confirmed runs.

**Implementation Tasks**
1. Define build package schema (requirements, delta intent, working set).
2. Include clarification answers and final confirmed draft.
3. Exclude irrelevant thread history by default.
4. Add package validation before dispatch.

**Deliverables**
- Build context packager.
- Validation and rejection reason handling.

**Dependencies**: P1-3, P4-1

**Acceptance Criteria**
- Worker inputs are concise and deterministic.
- Confirmed edits are always reflected in run payload.
- Tool token usage is lower than full-history baseline.

**Validation**
- Compare payload size and success rate vs baseline.

---

## Phase 5: Observability, Cost Controls, and Rollout

### Ticket P5-1: Routing and Run Observability Stack
**Outcome**: Full visibility into routing quality, reliability, and latency.

**Scope**
- Add event logs, metrics, and dashboards.

**Implementation Tasks**
1. Log routing decisions:
   - route chosen
   - reason
   - confidence
   - source
   - confirm-required flag
2. Log run lifecycle events and durations.
3. Track success/failure rates by error category.
4. Add dashboards and threshold alerts.

**Deliverables**
- Structured logging fields.
- Dashboard definitions.
- Alert rules.

**Dependencies**: P1-2, P2-2

**Acceptance Criteria**
- Required observability dimensions from discovery are live.
- Team can diagnose false positives and latency spikes quickly.

**Validation**
- Simulated event replay confirms dashboard accuracy.

---

### Ticket P5-2: Split Budget Controls (Chat Generous, Build Strict)
**Outcome**: Cost policy enforced by system controls.

**Scope**
- Separate quota and policy for chat and build paths.

**Implementation Tasks**
1. Add policy model for separate budgets.
2. Enforce budget checks at router and run confirmation stages.
3. Provide user-facing budget feedback messages.
4. Ensure budget exhaustion on build does not disable baseline chat utility.

**Deliverables**
- Budget policy configs.
- Budget enforcement middleware.

**Dependencies**: P2-1, P2-2

**Acceptance Criteria**
- Chat remains available under stricter tool limits.
- Build runs are constrained according to policy.
- Budget denial responses are clear and actionable.

**Validation**
- Budget simulation test matrix.

---

### Ticket P5-3: Gradual Rollout with Feature Flags and Kill Switches
**Outcome**: Safe adoption with rollback options.

**Scope**
- Controlled release across router, sync chat path, runs, artifact storage.

**Implementation Tasks**
1. Add feature flags for each major subsystem.
2. Support parallel old/new paths during validation window.
3. Define kill switch behavior for:
   - router mode
   - build dispatch
   - new artifact write path
4. Create go/no-go checklist tied to metrics.

**Deliverables**
- Flag rollout plan.
- Rollback runbook.

**Dependencies**: all prior phases

**Acceptance Criteria**
- Each subsystem can be independently toggled.
- Rollback does not require schema rollback.
- Parallel execution supported until confidence threshold met.

**Validation**
- Staging canary rollout and rollback drill.

---

## 5. Sub-Agent Delegation Guide

### Recommended Ticket Order (Critical Path)
1. P0-1
2. P0-2
3. P1-1
4. P1-2
5. P1-3
6. **P1-3b** (new: UI for clarification)
7. P2-1
8. P2-2
9. P3-1
10. P3-2
11. P2-3
12. P3-3
13. P4-1
14. P4-2
15. P5-1
16. P5-2
17. P5-3

### Safe Parallelization Opportunities
- P1-3b can run in parallel with P2-1 after P1-3 is complete (independent UI and sync-chat paths).
- P2-1 and P3-1 can overlap after P1-3b if write scopes are separated.
- P4-1 can begin once P2-1 has a stable context API.
- P5-1 logging scaffolding can begin early but finalize after router/run state contracts stabilize.

### Per-Ticket Required Output From Sub-Agent
- Summary of what changed.
- Exact files touched.
- Migration impact (if any).
- Tests added/updated.
- Known gaps or follow-up tasks.
- Evidence for acceptance criteria pass/fail.

## 6. Definition of Done (Global)
- All required product constraints are implemented and validated.
- No expensive workflow auto-runs without user confirmation.
- Chat-first behavior is default and responsive.
- Tool runs are tracked with lifecycle states and failure/retry UX.
- Artifacts are canonical in dedicated storage with immutable versioning.
- Observability and budget controls are active.
- Rollout is flaggable and reversible.
