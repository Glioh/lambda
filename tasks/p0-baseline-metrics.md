# P0-2: Baseline Metrics and Routing Risk Benchmark

Date: April 27, 2026

## 1. Purpose
This baseline captures the current pre-refactor behavior of Lambda's build-trigger path before the routing migration introduces separate Chat and Build modes. Today both `projects.create` and `messages.create` immediately dispatch `code-agent/run` after persisting the user's prompt, so this document establishes the comparison point for submit latency, end-to-end build latency, trigger frequency, failure handling, and credit consumption before any intent routing is added.

## 2. Measurement Methodology
This benchmark is based on static code inspection of the current implementation in `src/modules/projects/server/procedures.ts`, `src/modules/messages/server/procedures.ts`, `src/inngest/functions.ts`, `src/inngest/client.ts`, `src/inngest/utils.ts`, `src/inngest/types.ts`, `prisma/schema.prisma`, `src/lib/usage.ts`, and `src/trpc/init.ts`. Timing numbers are estimated ranges rather than live measurements: local Prisma reads/writes are treated as sub-100 ms in the common case, `inngest.send(...)` is treated as a short API dispatch, E2B sandbox creation is treated as a multi-second external call, and OpenAI `gpt-5-mini` agent/model calls are treated as the dominant variable latency source. This is static analysis, not live instrumentation.

## 3. Submit Path Timing (First Response Latency)

### 3a. projects.create path
Code path: `src/modules/projects/server/procedures.ts:49-90`.

1. `usageProtectedProcedure` runs before the mutation body and consumes one credit via `consumeCredits()` in `src/trpc/init.ts:30-52` and `src/lib/usage.ts:24-32`.
Estimated latency: 20-100 ms for auth lookup plus `RateLimiterPrisma.consume(...)`.

2. `prisma.project.create(...)` persists the `Project` row and a nested initial `Message` with `role: "USER"` and `type: "RESULT"` in one call (`src/modules/projects/server/procedures.ts:59-73`).
Estimated latency: 20-80 ms.

3. The caller then waits for `await inngest.send({ name: "code-agent/run", data: { value, projectId } })` (`src/modules/projects/server/procedures.ts:75-82`).
Estimated latency: 100-400 ms for outbound dispatch to Inngest.

4. The caller does not wait for any worker execution. `codeAgentFunction` starts asynchronously in `src/inngest/functions.ts:27-287`, so sandbox creation, LLM work, fragment generation, and final assistant write all happen after the tRPC response returns.

5. If `inngest.send(...)` throws, the code enters a `try/catch`, deletes the newly created project with `prisma.project.delete({ where: { id: createdProject.id } })`, and rethrows (`src/modules/projects/server/procedures.ts:83-87`). Because `Message.project` is declared `onDelete: Cascade` in `prisma/schema.prisma:37-38`, that rollback also removes the nested initial message.
Estimated rollback penalty on failure: another 20-80 ms.

Estimated first-response latency:
- p50: about 150-450 ms
- p95: about 300-900 ms

### 3b. messages.create path
Code path: `src/modules/messages/server/procedures.ts:36-79`.

1. `usageProtectedProcedure` again consumes one credit before entering the resolver (`src/trpc/init.ts:30-52`).
Estimated latency: 20-100 ms.

2. `prisma.project.findUnique(...)` verifies project ownership (`src/modules/messages/server/procedures.ts:47-52`).
Estimated latency: 10-50 ms.

3. `prisma.message.create(...)` persists the follow-up user message with `role: "USER"` and `type: "RESULT"` (`src/modules/messages/server/procedures.ts:61-68`).
Estimated latency: 20-60 ms.

4. The caller then waits for `await inngest.send(...)` with the same `code-agent/run` event payload shape (`src/modules/messages/server/procedures.ts:70-76`).
Estimated latency: 100-400 ms.

5. The caller does not wait for the worker. As with project creation, sandbox setup and agent execution happen after the mutation has already returned.

6. There is no `try/catch` around `inngest.send(...)` here. If dispatch fails, the USER message created at `src/modules/messages/server/procedures.ts:61-68` remains in the database with no rollback path. That gap is real and current.

Estimated first-response latency:
- p50: about 150-500 ms
- p95: about 300-950 ms

## 4. Build Completion Latency (Worker)
Worker entrypoint: `src/inngest/functions.ts:27-287`.

- `get-sandbox-id`: `step.run("get-sandbox-id")` calls `Sandbox.create("lambda")` and then `sandbox.setTimeout(SANDBOX_TIMEOUT)` where `SANDBOX_TIMEOUT = 30 minutes` (`src/inngest/functions.ts:31-35`, `src/inngest/types.ts:1`). This is the slowest deterministic setup step because it depends on E2B provisioning.
Estimated latency: 2-10 s.

- `get-previous-messages`: `step.run("get-previous-messages")` reads up to the five most recent messages for the project via `prisma.message.findMany({ orderBy: { createdAt: "desc" }, take: 5 })`, then reverses them before passing them into agent state (`src/inngest/functions.ts:37-62`).
Estimated latency: 20-100 ms.

- `createNetwork / agent loop`: `createNetwork(...)` runs a single `codeAgent` with `maxIter: 15` (`src/inngest/functions.ts:195-209`). The router keeps returning `codeAgent` until `network.state.data.summary` is set. That summary is only populated when `onResponse` sees `<task_summary>` in the last assistant text message (`src/inngest/functions.ts:180-191`). If the sentinel never appears, the network can use the full 15-iteration budget before `network.run(...)` returns (`src/inngest/functions.ts:211`).
Estimated latency: 8-40 s p50 for a few LLM/tool turns, 30-120 s p95 when the loop approaches the `maxIter: 15` guard or repeatedly uses sandbox tools.

- `terminal` / file tools inside the loop: the agent may call `terminal`, `createOrUpdateFiles`, and `readFiles`; each reconnects to the same E2B sandbox through `getSandbox(sandboxId)` and performs external sandbox I/O inside `step.run(...)` (`src/inngest/functions.ts:83-178`, `src/inngest/utils.ts:1-8`). These calls are part of the agent-loop estimate above and are the main source of variance beyond model latency.

- `fragmentTitleGenerator.run`: after the network finishes, a separate `gpt-5-mini` agent generates a fragment title from `result.state.data.summary` (`src/inngest/functions.ts:213-236`). This is not inside `step.run(...)`, so it is not durable.
Estimated latency: 1-4 s.

- `responseGenerator.run`: another `gpt-5-mini` agent generates the user-facing assistant message from the same summary (`src/inngest/functions.ts:224-239`). This is also not durable.
Estimated latency: 1-5 s.

- `get-sandbox-url`: `step.run("get-sandbox-url")` reconnects to the sandbox, calls `sandbox.getHost(3000)`, and formats `https://${host}` (`src/inngest/functions.ts:245-249`).
Estimated latency: 20-100 ms.

- `save-result`: `step.run("save-result")` writes either an assistant `ERROR` message or an assistant `RESULT` message with a nested `Fragment` containing `sandboxUrl`, `title`, and `files` (`src/inngest/functions.ts:251-278`, `prisma/schema.prisma:40-53`).
Estimated latency: 20-100 ms.

Estimated total build completion latency:
- p50: about 15-35 s
- p95: about 40-140 s

The p95 range is driven by external services, not Prisma: E2B sandbox provisioning can consume several seconds before any model work starts, and the `gpt-5-mini` agent loop can continue until the `<task_summary>` sentinel is produced or the 15-iteration guard is exhausted.

## 5. Event Frequency: Messages vs Builds
Current behavior is a strict 1:1 trigger ratio. `projects.create` always sends `code-agent/run` after the initial project/message write (`src/modules/projects/server/procedures.ts:59-82`), and `messages.create` always sends `code-agent/run` after every follow-up message write (`src/modules/messages/server/procedures.ts:61-76`). There is no routing layer, no intent classifier, no chat-only path, and no "build confirmation" branch in the current implementation. Every submitted message is treated as a build request.

## 6. Error Rates and Failure Modes
- `inngest.send` failure in `projects.create`: handled with rollback. The mutation wraps dispatch in `try/catch`; on failure it deletes the just-created project (`src/modules/projects/server/procedures.ts:75-87`), which also removes the nested message because of `onDelete: Cascade` on `Message.project` (`prisma/schema.prisma:37-38`).

- `inngest.send` failure in `messages.create`: not handled. The message is inserted first and `inngest.send(...)` is awaited without a surrounding `try/catch` (`src/modules/messages/server/procedures.ts:61-76`), so a failed dispatch leaves a persisted USER message with no worker run attached.

- E2B `Sandbox.create` failure: `step.run("get-sandbox-id")` has no local `try/catch` (`src/inngest/functions.ts:31-35`). If E2B provisioning fails, the function fails before any assistant message is written.

- Agent max-iterations reached without `<task_summary>` sentinel: the router only stops when `network.state.data.summary` is non-empty (`src/inngest/functions.ts:200-207`), and that field is only set when `onResponse` sees `<task_summary>` in the assistant output (`src/inngest/functions.ts:185-188`). If the model never emits the sentinel, `network.run(...)` can terminate after `maxIter: 15` with an empty summary. `isError` then evaluates true because `!result.state.data.summary` (`src/inngest/functions.ts:241-243`), and `save-result` writes `"Something went wrong. Please try again."` as an assistant error message (`src/inngest/functions.ts:251-260`).

- Empty files map in `save-result`: `isError` also becomes true when `Object.keys(result.state.data.files || {}).length === 0` (`src/inngest/functions.ts:241-243`). In that case the worker still runs both post-network LLM calls first, then discards them and writes an assistant error message. So "no generated files" is treated as failure even if a summary exists.

- LLM failures in `fragmentTitleGenerator` / `responseGenerator`: both `.run(...)` calls occur outside `step.run(...)` (`src/inngest/functions.ts:234-239`). They are therefore non-durable in this implementation. A thrown error here fails the worker after the expensive network loop has already completed, and a retry would recompute these model outputs rather than replay a checkpointed result.

- `save-result` on Inngest retry: the final Prisma write is inside `step.run("save-result")` (`src/inngest/functions.ts:251-278`), so a normal retry after that step has been checkpointed should not re-execute the write. That gives it better retry behavior than the two post-network LLM calls. However, there is no application-level unique key tying the assistant message/fragment to an explicit run id in `prisma/schema.prisma`, so if the process fails after Prisma commits but before Inngest records the step as completed, duplicate assistant result rows remain possible.

## 7. Build Trigger Frequency Analysis
Every user write path dispatches the same build event immediately, so the current trigger baseline is 1 build per 1 submitted message. That is wasteful for the upcoming chat-first architecture because routine clarifying questions, short follow-ups, or conversational turns cannot stay in a lightweight response path; each one spends a credit, allocates worker capacity, and may create a fresh E2B sandbox before the system has even determined whether a build is warranted.

## 8. Rate Limiting / Credit Budget
Credit policy is defined in `src/lib/usage.ts`:
- Free: `FREE_POINTS = 10` (`src/lib/usage.ts:5`)
- Pro: `PRO_POINTS = 100` (`src/lib/usage.ts:6`)
- Window: `DURATION = 30 * 24 * 60 * 60` seconds, or 30 days (`src/lib/usage.ts:7`)
- Cost per invocation: `GENERATION_COST = 1` (`src/lib/usage.ts:8`)

Both `projects.create` and `messages.create` use `usageProtectedProcedure` (`src/modules/projects/server/procedures.ts:49`, `src/modules/messages/server/procedures.ts:36`), and that middleware always calls `consumeCredits()` before entering the mutation body (`src/trpc/init.ts:30-33`). Because there is no chat-only route, 100% of the current credit budget is consumed by build-triggering submissions.

## 9. Summary Table
| Metric | Current Baseline | Notes |
|--------|-----------------|-------|
| First response latency (submit path) | `projects.create`: p50 150-450 ms, p95 300-900 ms; `messages.create`: p50 150-500 ms, p95 300-950 ms | Caller waits for DB write(s) + `inngest.send(...)`, not for worker completion |
| Build completion latency p50 est. | 15-35 s | Dominated by E2B sandbox provisioning plus several `gpt-5-mini` calls |
| Build completion latency p95 est. | 40-140 s | Worst case approaches `maxIter: 15` and repeats sandbox tool usage |
| Build trigger ratio | 1:1 (every message) | No intent routing |
| Credit utilization | 100% builds | No chat-only path |

## 10. Reproducible Measurement Steps
1. Start local development with `npm run dev` and start Inngest locally with `npx inngest-cli@latest dev` so `code-agent/run` executes against the current worker in `src/inngest/functions.ts`.
2. In the Inngest dev server, observe each `code-agent/run` invocation and confirm the durable step sequence: `get-sandbox-id`, `get-previous-messages`, repeated tool steps during the network, `get-sandbox-url`, and `save-result`.
3. In the browser, capture submit-path timing from DevTools Network for the `projects.create` and `messages.create` tRPC requests. That measures the user-visible first response latency because those mutations return before worker completion.
4. In server logs and the Inngest UI, capture worker timing around E2B sandbox creation and the full job runtime. To verify failure scenarios, simulate a dispatch failure during `messages.create`, force E2B sandbox creation failure, and test a run that never emits `<task_summary>` or never writes files so `isError` takes the assistant error path.

## 11. Post-Refactor Comparison Points
- Trigger ratio should drop because chat messages should stop dispatching `code-agent/run`.
- First response latency for chat should be under 2 s because the chat path should avoid sandbox creation and the long agent loop entirely.
- Credit utilization should split between chat and build rather than charging every submitted message as a build.
- Fewer unnecessary E2B sandbox creations should reduce external-call latency and shrink the current failure surface around sandbox provisioning and long-running agent loops.
