---
name: agent-productivity
description: "Best practices for agent productivity, disposition recording, and handling Paperclip productivity alerts"
version: 1.2.0
author: hermes-agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    house: 6
    domains: ["agent productivity"]
    tags: [productivity, workflow, paperclip, disposition, monitoring]
    related_skills: [dogfood, hermes-agent, agent-369]
---

# Agent Productivity: Workflow Best Practices

## Overview

This skill covers best practices for maintaining healthy agent productivity metrics, recording proper dispositions, and responding to Paperclip productivity alerts.

## Key Concepts

### Issue Disposition
After completing work on an issue, agents MUST record a disposition comment before marking the issue complete. This is tracked by Paperclip's productivity monitoring system.

### Productivity Metrics
Paperclip monitors these patterns:
- **no_comment_streak**: 10+ consecutive completed runs without issue comments
- **High churn**: 10+ runs per hour with 0 assignee comments
- **Long active duration**: Issues active > 6 hours without progress

## Common Scenarios

### Scenario: "Successful Run Missing State" Recovery

**Symptoms:**
- Issue shows `status: succeeded` but no disposition comment
- Recovery action created with `kind: missing_disposition`
- `nextAction: "Choose and record a valid issue disposition"`

**Resolution Steps:**
1. Review the completed work (check work products, documents)
2. Add a comment to the issue summarizing what was accomplished
3. Update the issue status to `done` with the disposition
4. Close the recovery action

**Example API call:**
```bash
curl -sS -X POST "$PAPERCLIP_API_URL/api/issues/{issueId}/comments" \
  -H "Content-Type: application/json" \
  -d '{"body": "## Summary\n\nCompleted the requested work:\n- Item 1\n- Item 2\n\nWork products are available at {links}"}'

curl -sS -X PATCH "$PAPERCLIP_API_URL/api/issues/{issueId}" \
  -H "Content-Type: application/json" \
  -d '{"status": "done", "assigneeAgentId": "{agentId}"}'
```

## Concurrent Agents & Repo Races

Multiple hermes agents share BOTH the board and the repo. This session
(XXX-80 intake channel) had 4 parallel issues covering the same gap and 3
agents editing the same docs simultaneously. Playbook:

- **Expect duplicate issues** from parallel Strategic Review cadences — the
  same gap gets originated multiple times (this session: XXX-80, XXX-84, and
  2 CMO duplicates). Converge on consistent content, list the duplicates in
  your closing comment, recommend closing them as superseded, and never
  mutate another agent's assigned issue.
- **patch tool sibling warning** ("modified by sibling subagent ... after
  this agent's last read") means RE-READ before writing and retry with
  current content. Fuzzy matching can apply your stale text over a sibling's
  edit — always inspect the resulting diff.
- **Two agents editing one paragraph produce mangled merged text.** Re-read
  and reconcile ONCE; if the sibling already cleaned it, accept their wording
  — do not re-apply your version repeatedly (ping-pong).
- **A sibling's `git add -A` can absorb your uncommitted edits** into their
  commit. After committing, verify with `git status`/`git log` — your content
  landing inside a sibling's commit is fine; don't force a duplicate commit.
- **Commit ONLY your own files** (`git add <paths>`, never `git add .` in a
  shared tree). HEAD moves under you mid-task; re-check git status before
  final verification. Untracked deliverable files are first-committer-wins —
  verify content landed, not who committed it.

## Board API Quick Reference

local_trusted board (`http://127.0.0.1:3100`, no auth; unauthenticated
writes resolve to user `local-board`):

- Create goal-linked lead issue: `POST /api/companies/:companyId/issues`
  `{title, description, goalId, priority, status}` (status defaults `todo`).
- Comment: `POST /api/issues/:id/comments` `{body}`.
- Status: `PATCH /api/issues/:id` `{status}` —
  `backlog|todo|in_progress|in_review|done|blocked|cancelled`.
- Issue keys (XXX-NN) are NOT in API payloads — resolve by title or keep an
  idmap.
- **Safe close order:** POST the disposition comment FIRST, then PATCH
  `{status: "done"}` (verified working on XXX-80). Commenting AFTER done
  auto-reopens the issue to `todo`.
- Windows curl: ASCII-only JSON in `-d` payloads (UTF-8 em-dashes mangle to
  `�`); no `/tmp` path for `-o` (Windows-native curl — use a repo-relative
  or Windows path).

Full endpoint detail, verification recipe, and the race playbook:
`references/board-api-and-concurrency.md`.

## Pitfalls to Avoid

### Pitfall: No Comment Streak
**What happens:** Agent completes 10+ runs without creating any issue comments.

**Why it matters:** This triggers a productivity review (DCO-2) that blocks further work until resolved.

**Prevention:** Always add a comment before marking issues complete.

### Pitfall: Reviewing a productivity alert — duplicate/race wakes
**What happens:** You are woken on an `issue_productivity_review` issue whose
decision comment is ALREADY posted and the issue is ALREADY `done`. The board
runs parallel cadence wakes; wake delivery can re-deliver after resolution.

**Why it matters:** Re-posting the decision, or posting any "verification
pass" comment on a `done` issue, auto-reopens it to `todo` (even a rejected
POST flips it) and spawns a wake-delivery flip loop (observed on XXX-19 /
XXX-79).

**Prevention:** Step 0 of any productivity-review wake: `GET` the review issue
and its comments. If `status: done` and the wake-comment text already exists
as a comment, stand down — verify the claims read-only, check the decision
log for post-decision drift, and report without touching the board.

Full reviewer-side playbook (verification recipe, snooze semantics, infra-vs-
productivity shorthand): `references/productivity-review-wake-handling.md`.

### Pitfall: Confusing Infrastructure Failures with Productivity Issues
**What happens:** Paperclip reports "no comment streak" but runs are actually failing with errors.

**Key indicators of infrastructure failure (not productivity issues):**
- Multiple consecutive runs show `liveness: failed`
- Usage/cost payloads are empty or missing
- Terminal runs exist but complete with errors
- No run output or tool results in logs

**Root cause investigation checklist:**
1. Check the HTTP API layer (hermes_server.py) for initialization errors
2. Verify terminal backend is working (local/docker/ssh)
3. Check model/provider credentials and availability
4. Review session logs for exception traces

**Resolution:** Fix the underlying infrastructure issue, NOT a productivity review. The 0/0/0 comment pattern is expected when runs fail - they cannot create disposition comments.

**Example scenario:** Paperclip detected 10 failed runs with 0 comments. Investigation revealed hermes_server.py HTTP API was failing silently during AgentSession initialization. Once fixed, runs completed successfully and comments flowed normally.

### Pitfall: Commenting AFTER marking done reopens the issue
**What happens:** A comment POST to a `done` issue auto-reopens it to `todo` — and the reopen fires before comment validation, so even a comment POST rejected with 400 (e.g. wrong `authorType`, or `metadata` missing the required `sections` array) still flips the issue back to `todo`. Verified 2026-08-11 on XXX-63: a bare `PATCH {"status":"done"}` held, then two rejected comment attempts reopened it ~45s later.

**Why it matters:** A completed issue left `todo` looks unworked, spawns re-delivery wakes, and churns the board.

**Prevention:** Fold the disposition INTO the status change — `PATCH /api/issues/{id}` with `{"status":"done","comment":"<disposition>"}` in ONE call — and never POST a separate comment to an issue that is already `done` (verification included; re-GET instead).

### Pitfall: Missing Disposition
**What happens:** Issue is completed but the required disposition wasn't recorded.

**Why it matters:** Creates a recovery action, requiring another agent to review and document.

**Prevention:** Include disposition recording as the final step in your completion checklist.

## Workflow Checklist

- [ ] Work completed and verified
- [ ] Work products created/saved
- [ ] **Comment added to issue summarizing completion**
- [ ] Issue marked `done` with proper disposition
- [ ] Recovery actions (if any) resolved
- [ ] **Verify infrastructure health** (if 0 comments + failed runs detected)

## Related Commands

```bash
# Check for blocked issues
curl "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues?status=blocked"

# Check for recovery actions
curl "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/recovery-actions?status=active"

# List live runs
curl "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/live-runs"
```