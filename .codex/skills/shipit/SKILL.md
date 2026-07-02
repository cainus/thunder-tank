---
name: shipit
description: Use when the user says `/shipit`, "ship it", "commit and push", or otherwise asks to publish local changes. This skill prepares a commit, commits the intended changes, and pushes them to the `main` branch. Use it whenever the user wants to ship current work instead of just describing what to do.
---

# Shipit

Use this skill to actually ship the current local work to `main`.

## Workflow

1. Inspect the current git state first.
   - Check the branch.
   - Check which files are modified, added, or deleted.
   - Review the diff summary so you can describe the scope back to the user.

2. Confirm the publishing scope with the user before making git changes.
   - Summarize what will be committed.
   - Ask for a commit message if they have one.
   - If they do not provide one, propose a concise commit message based on the changes.
   - Explicitly confirm that you should commit and push to `main`.

3. After confirmation, perform the git workflow.
   - Stage the intended files.
   - Create the commit with the confirmed message.
   - Push to the `main` branch.
   - After a successful push, remove the current task worktree and delete its branch if they are safe to remove.

4. Report the result clearly.
   - Share the commit hash and branch pushed.
   - Mention whether the worktree and branch were deleted.
   - Mention any files intentionally left out.
   - If push fails, explain the error and the next corrective step.

## Guardrails

- Do not push without explicit user confirmation in the current conversation.
- Do not assume every changed file should be included; summarize the scope first.
- If the current branch is not `main`, tell the user and ask whether they want to merge/cherry-pick or push directly to `main`.
- If there are no changes, say so and stop.
- Only delete the worktree and branch after a successful push to `main`.
- Only delete the branch if it is not `main` and is not needed by another checked-out worktree.
- If deleting the current worktree from inside itself is awkward, explain that cleanup must be run from another worktree or shell and provide the exact commands.
- If there are conflicts, failed hooks, or rejected pushes, do not hide them; report them and ask how to proceed.
