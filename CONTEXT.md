# Lambda

Lambda organizes a user's work into Project Workspaces containing Chats.

## Language

**Project Workspace**:
A user-owned workspace that contains Chats and project-level artifacts.
_Avoid_: Project

**Chat**:
A user-visible discussion owned by exactly one Project Workspace. It owns its messages, attachments, context, and chat-specific results.
_Avoid_: Conversation, thread

**Branch**:
A Chat created from a parent Chat at a Branch Point. It evolves independently and may itself have child Branches.

**Branch Point**:
The Message in a parent Chat where a Branch begins and the two Chats diverge.
