---metadata:
  hermes:
    house: 4
    domains: ["organize workspace", "manage files", "file organization"]

name: workspace-file-management
description: Manage workspace files systematically, including creation, verification, and maintenance practices for the Hermes agent.
tags:
  - workspace-management
  - file-creation
  - verification
  - automation
author: hermes-agent
created: 2026-08-11
updated: 2026-08-11
version: "1.0"
---

# Workspace File Management

## Overview

This skill covers systematic file creation, verification, and maintenance in the Hermes agent workspace. It includes:

- File creation with proper directory handling
- Automated verification and validation
- Workspace organization best practices
- Error handling and recovery patterns

## Key Capabilities

### File Creation
- Create files with proper error handling
- Handle directory creation automatically
- Support various file formats (text, JSON, Python, etc.)
- Maintain workspace consistency

### Verification
- Automated file existence validation
- Content verification and checksums
- Cross-platform path handling
- Integration testing support

### Ad-hoc verification for doc-only changes (no canonical test command)
When the harness demands verification evidence for a changed path but the repo
has no test/lint/build for it (markdown docs, config, prose), don't claim
unverified or invent suite green — run a focused ad-hoc script:

1. Write the check to a system-temp file:
   `tempfile.mkstemp(prefix="hermes-verify-", suffix=".py", dir=os.environ.get("TEMP", tempfile.gettempdir()))`.
2. Assert the **changed behavior**, not file existence. For doc edits: parse the
   target doc's structure (headings/sections/steps) and verify every internal
   cross-reference (backticked path + `§N` / `§N Step M` pointers) resolves to a
   real heading; also assert git state (fix commit at the path's history head,
   `git status --porcelain` clean).
3. Print a VERDICT line, `sys.exit(1)` on failure, `os.remove(path)` afterwards —
   always clean up.
4. Report it explicitly as **ad-hoc verification, not suite green**: name the
   script path, what was asserted, and what was NOT covered (rendering, external
   link checks, CI).

Known-good example pattern (doc cross-reference integrity checker):
`D:\Dev\agent\hermes-agent\skills\autonomous-ai-agents\board-ops\references\issue-lifecycle-and-races.md`
was written after exactly this verification ran on `docs/qa/` (XXX-93).

### Best Practices
- Use OS-safe temp paths for verification scripts
- Follow workspace conventions (no hardcoded paths)
- Maintain proper file permissions
- Clean up temporary resources

## Common Use Cases

- Creating test artifacts for verification
- Generating documentation and reports
- Setting up workspace scaffolding
- Creating configuration templates

## Typical Pitfalls to Avoid

- Hardcoding absolute paths instead of using working directory
- Not handling directory creation before file writing
- Forgetting to close file handles properly
- Ignoring file encoding issues
- Creating verification scripts that don't clean up themselves

## References

- `references/`: Contains detailed guides, error patterns, and solutions
- `templates/`: Includes scaffolding templates and initialization scripts
- `scripts/`: Provides runtime verification tools and utilities

## Usage Examples

1. Create a new test file:
   ```bash
   hermes write-file --path test_blog.txt --content "# Test File\n---\n\nCreated with hermes"
   ```

2. Verify file integrity:
   ```bash
   python verify_file.py --file test_log.txt
   ```