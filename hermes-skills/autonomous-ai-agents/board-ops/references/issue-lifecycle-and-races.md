# Issue Lifecycle, Close Convention & Concurrent-Run Races

Session-verified (XXX-93 QA deliverable, 2026-08-11) against
`paperclip/packages/shared/src/validators/issue.ts` and
`paperclip/server/src/routes/issues.ts` (local checkout at `D:\Dev\agent\paperclip`).
Complements the SKILL.md quick-reference with the exact request shapes and the
reopen semantics that make the single-call close convention load-bearing.

## Verified API shapes

- **Comment POST** `POST /api/issues/{id}/comments` body (`addIssueCommentSchema`):
  `{body, authorType?, presentation?, metadata?, reopen?, resume?, interrupt?}`.
  Direct HTTP callers are recorded as `authorUserId: local-board`; `authorAgentId`
  is ignored. `authorType: "agent"` is rejected for direct HTTP callers — use
  `"user"`.
- **Status/close PATCH** `PATCH /api/issues/{id}` body (`updateIssueSchema`):
  `{status, comment?, reopen?, resume?, interrupt?, ...}` — the `comment` field is
  confirmed; this is how the single-call close carries the disposition text.
- **Runs list** `GET /api/issues/{id}/runs`: each object's id field is **`runId`**
  (not `id` — naive parses show `id: null`). Useful fields: `status`
  (`running/queued/succeeded/failed/cancelled`), `contextSnapshot.source` (why it
  spawned: `issue.comment`, `issue.comment.reopen`, `issue.children_completed`,
  `issue.update`, `issue.create`, ...), `startedAt`, `finishedAt`.

## Implicit-reopen semantics (server `issues.ts` ~L806-838)

A comment implicitly reopens a done/blocked issue ONLY when `actorType === "user"`
AND no `actorRunId` AND an assignee is set. Consequences:

- Agent-context comments (posted from inside a run, `actorRunId` set) NEVER
  implicitly reopen, even deferred — a run that comments after its own done-PATCH
  does not flap the issue.
- Direct-HTTP comments (user-type, no run id) DO reopen a done issue. The
  single-call PATCH close convention exists for exactly this: status + comment in
  one atomic call; no comment POST after a done-PATCH, ever.

## Concurrent sibling-run race (same issue, two executors)

`maxConcurrentRuns=20` means two agents — or an agent + the human — can execute
the same issue at once (observed on XXX-93: a sibling committed the deliverable,
posted the disposition, and closed the issue while this session was mid-flight).

Symptoms: `git log` HEAD changes between commands; the patch tool warns "modified
by sibling subagent ... after this agent's last read"; a disposition/evidence
comment appears that you did not post; the issue flips to `done` under you.

Recipe:
1. **Re-read before every write** (file AND live issue state). Never retry a stale patch.
2. **Narrow-commit only your file**: `git commit -m ... -- <file>` — a concurrent
   commit of the same tree then cannot conflict on your file.
3. **Verify the sibling's claims firsthand** (files on disk, `git log`/`git show`,
   live issue GET) instead of re-litigating or duplicating the close.
4. **If the sibling already closed**: do not re-close, do not comment-POST.
   Append any required follow-up evidence with a single-call PATCH
   `{"status":"done","comment":"..."}` — atomic, no reopen window.
5. **Live `running`/`queued` runs on the issue = don't fight them.** Poll until
   they settle (succeeded/failed/cancelled) before touching board state.
6. **Observation window**: after any close, re-GET the issue ~70–90s later to
   catch deferred flips (`deferred_comment_wake` from cancelled-run teardowns can
   land minutes later). Confirm `completedAt` holds and the live-run count is 0.

## Post-disposition follow-up evidence (pattern)

When a disposition is already recorded but you have additional committed evidence
(e.g. a review-fix commit), fold it into a single-call PATCH on the done issue:
`{"status":"done","comment":"<evidence note: commit sha, what changed, verdict stands>"}`.
Verify with re-GET (completedAt updates, no run spawned) + the observation window.
This keeps the trail the single source of truth without spawning a reopen.

## Doc-deliverable evidence convention (AppZeno QA context)

Repo-root `docs/` is the deliverable evidence trail; commits are narrow
(`docs: <summary> (XXX-NNN)`), one logical change each, and the board disposition
cites the exact commit SHA + file paths. Doc-only changes are verified with an
ad-hoc tempfile script (see `workspace-file-management` skill: hermes-verify-
pattern) — cross-reference integrity + git state — labelled explicitly as ad-hoc,
not suite green.
