# ADR 0002: Chat Is the Canonical Term

- Status: Accepted
- Date: 2026-08-13

Lambda uses **Chat** as the canonical term for the user-visible discussion owned by a Project Workspace, replacing **Conversation** in ADR 0001 and application-owned uses of **Conversation** or **thread**. This keeps product, domain, and code vocabulary aligned with the terminology users and the existing application already use. Exact third-party names such as `openai.chat.completions` remain unchanged and must be qualified by their adapter context to avoid confusing the provider operation with Lambda's Chat completion lifecycle. This terminology decision does not change the ownership, cardinality, isolation, or deletion rules established by ADR 0001.
