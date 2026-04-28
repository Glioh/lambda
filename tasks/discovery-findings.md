# Discovery Findings (Phase 1)

Date: April 23, 2026

## Executive Summary
Phase 1 should be chat-first with explicit modes (`Chat` and `Build`).
Website/app generation remains core, but it should run only when explicitly requested or when intent is high-confidence and user-confirmed.
Primary success metric is retention (`D7`, `D30`).

## Product Direction
1. Primary experience: conversational assistant (general Q&A, planning, iteration).
2. Website generation: secondary, intentional workflow.
3. Launch jobs-to-be-done:
   - General Q&A / problem solving
   - Editing and iterating generated content/code
   - Brainstorming/planning into artifacts
4. Success metric (90 days): retention over pure generation volume.

## UX & Interaction Findings
1. Intent handling:
   - Auto-detect user intent by default.
   - Allow explicit user override (`build a website`, mode selection).
2. Tool visibility:
   - Keep and extend the status carousel for run progress.
3. Artifact handling:
   - Chat is not source of truth.
   - Artifacts should be stored in dedicated project/artifact/version models.
4. Context strategy:
   - Rolling context window + summaries:
     - recent turns (10-20)
     - conversation summary
     - active artifact summary
     - selected working files
5. Costly actions:
   - Require confirmation before expensive workflows.
   - Support editable draft state before execution.
6. Performance:
   - Optimize for fast first token, then stream deeper output.

## Routing & Agent Policy
1. Default policy: chat-first, tool-second.
2. Build triggers:
   - Explicit build intent, or
   - High-confidence structured build intent.
3. Clarification policy:
   - Ask clarifying questions before tool execution when needed.
4. Hard safety rule:
   - Never auto-run expensive workflows without confirmation.
5. Routing pattern:
   - Rule-based gate first, model decision inside constraints.

## Architecture Findings
1. Execution split:
   - Chat responses should be synchronous for responsiveness.
   - Tool workflows should run async via Inngest.
2. Orchestration model:
   - `Router -> Worker`
   - Router chooses chat vs tool path.
3. Flow separation:
   - Separate chat flow and tool-run flow; share orchestration context where useful.
4. Immediate technical discovery needed:
   - Inspect current Inngest integration first to decide what can remain unchanged.

## Data Model Findings
1. Keep `Message`; add `Task/Run` entity.
2. Suggested run lifecycle states:
   - `queued`, `running`, `success`, `failed`, `cancelled`
3. Artifact versioning:
   - Immutable per run.
4. Memory scope roadmap:
   - Phase 1: thread-level
   - Later: project-level, user-level
5. Failure UX:
   - Must include error summary and retry action.

## Migration & Rollout
1. Backward compatibility is low priority (pre-launch).
2. In-place schema changes are acceptable.
3. Gradual rollout preferred but parallel systems are acceptable during transition.

## Risk, Cost, and Observability
1. Primary risk: routing mistakes.
   - False positive tool runs = costly + trust damage.
   - False negative tool runs = poor UX.
2. Budget strategy:
   - Generous chat budget.
   - Stricter build/tool budget.
3. Required observability:
   - Routing decision logs
   - Tool success/failure rates
   - Latency per step

## Implementation Priorities (Recommended Order)
1. Discovery pass on current Inngest flow and boundaries.
2. Introduce router layer (chat vs build decision).
3. Add confirmation gate for expensive tool runs.
4. Add `Run` model and run state tracking.
5. Decouple artifact storage from chat messages.
6. Add summaries/memory compaction.
7. Add routing/run observability dashboards and alerts.
