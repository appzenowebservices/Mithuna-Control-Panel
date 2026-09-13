---
name: git-workflow-pr
description: Commit approved artifacts and open a pull request.
version: 1.0.0
metadata:
  hermes:
    house: 7
    domains: ["git workflow", "pull request workflow", "PR workflow", "git PR"]
    category: software-development
    tags: [git, github, pull-request, promote]
---

# Git Workflow PR Skill

Promotes board-approved workspace files into the repository by creating a
feature branch, committing the approved files, pushing, and opening a pull
request. Used when the board manually triggers "Promote to repo".

## When to Use

- A board user approved deliverables (work products/artifacts) and pressed
  Promote to repo for a workspace.
- You need to turn files that live in a Paperclip workspace into a real
  branch + pull request in the linked git repository.

## Prerequisites

- The workspace cwd is set: `$PAPERCLIP_WORKSPACE_CWD` (equals `TERMINAL_CWD`).
  Work happens inside that directory only.
- The workspace is a git checkout with a remote, OR `git` is available and a
  remote can be added from the workspace `repoUrl`.
- `gh` CLI is installed and authenticated for PR creation (fallback: GitHub
  REST API with `GITHUB_TOKEN`).
- The promote request names the exact files to include.

## How to Run

You are invoked with a promote prompt listing the approved workspace-relative
paths and the target issue. Follow the Procedure below. Never commit files
outside `$PAPERCLIP_WORKSPACE_CWD`.

## Quick Reference

```
cd "$PAPERCLIP_WORKSPACE_CWD"
git fetch origin
git checkout -b promote/<issue-identifier>-<short-slug> origin/<defaultRef>
git add <approved-paths...>
git commit -m "<issue-identifier>: promote approved artifacts"
git push -u origin <branch>
gh pr create --base <defaultRef> --head <branch> --title "..." --body "..."
```

## Procedure

1. **Confirm scope.** Parse the approved files from the prompt. Refuse to
   include any path that escapes the workspace (no `..`, no absolute host
   paths outside cwd).
2. **Prepare the checkout.** `cd "$PAPERCLIP_WORKSPACE_CWD"`. Verify `.git`
   exists; if the folder is not a git repo and the workspace has a `repoUrl`,
   `git init` and `git remote add origin <repoUrl>`, then `git fetch origin`.
   Use `git status` to confirm the working tree is not blocked by conflicts.
3. **Branch.** Create `promote/<issueIdentifier>-<slug>` from the default ref
   (`origin/main` or the workspace `defaultRef`).
4. **Stage approved files.** `git add` exactly the approved paths. Show
   `git status`/`git diff --cached` to verify nothing else sneaks in.
5. **Commit.** Message pattern: `<IssueIdentifier>: promote approved artifacts
   (Paperclip <issueId>)`.
6. **Push.** `git push -u origin <branch>`.
7. **Open the PR.** Use `gh pr create` with the issue in the body. If `gh` is
   unavailable, use the GitHub REST API with `GITHUB_TOKEN`.
8. **Register the PR.** POST the PR to Paperclip as a work product so the
   board can see it:
   ```bash
   POST /api/issues/{issueId}/work-products
   Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
   {
     "type": "pull_request",
     "provider": "github",
     "title": "<PR title>",
     "url": "<PR url>",
     "status": "ready_for_review",
     "summary": "Promoted approved artifacts; see PR <url>"
   }
   ```
9. **Report back.** Comment on the issue with the PR link and the files
   included.

## Pitfalls

- Do not `git add -A` / commit unrelated workspace changes (scratch files,
  logs). Stage only the approved paths.
- Do not force-push or rewrite an existing branch without being told.
- If the workspace is not a git checkout and has no remote, stop and report
  that the workspace needs a `repoUrl` to open a PR.
- Do not commit anything outside `$PAPERCLIP_WORKSPACE_CWD`.

## Verification

- `git log -1 --oneline` shows your commit; `git status` is clean on the
  branch.
- The branch exists on the remote (`git ls-remote origin <branch>`).
- The PR is open and the issue comment links it.
