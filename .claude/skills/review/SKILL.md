# Self-Review Skill

## Config
- user-invocable: true
- disable-model-invocation: true

## Description
Performs self-review of recent changes via git diff, reading changed files, and running tests.

## Steps

### 1. Check Git Status
```bash
git status
git diff HEAD
```

### 2. Read Changed Files
For each file in the diff:
- Read the full file to understand context
- Focus on the changed sections

### 3. Review Checklist

Run through this checklist for all changes:

**P0 — Critical Issues (Must Fix)**
- [ ] Wrong database fields used (e.g., `user_id` vs `userId`, `sync_status` vs `status`)
- [ ] Unit mismatches (USD vs cents, seconds vs milliseconds)
- [ ] SQL injection vulnerabilities (unparameterized queries)
- [ ] Exposed secrets or credentials in code
- [ ] Missing auth checks on protected endpoints
- [ ] Command injection risks (unescaped shell commands)

**P1 — High Priority (Should Fix)**
- [ ] Missing validation on user inputs
- [ ] Hardcoded values that should be config/env vars
- [ ] Missing error handling for external calls (DB, API, LLM)
- [ ] Breaking changes to API contracts without migration
- [ ] Missing required evidence fields for sync-critical operations
- [ ] XSS vulnerabilities in rendered content

**P2 — Nice to Fix (Suggest)**
- [ ] Inconsistent naming conventions
- [ ] Missing null/undefined checks
- [ ] Unclear variable names
- [ ] Complex logic that could be simplified
- [ ] Missing comments for non-obvious logic
- [ ] Duplicate code that could be refactored

### 4. Run Tests
Run relevant tests for the changed code:
```bash
# Choose appropriate test command
npm run test:pipeline      # If pipeline changes
npm run assistant:test     # If assistant changes
npm run test:search        # If search changes
npm run test:full          # Full integration test
npm run benchmark:quick    # If performance-critical
```

### 5. Report Findings

Format the report as:

```markdown
## Self-Review Results

### Changes Summary
[Brief description of what changed]

### Files Changed
- `path/to/file1.ts` — [what changed]
- `path/to/file2.ts` — [what changed]

### Issues Found

**P0 — Critical** (blocking)
- [Issue 1] at `file.ts:42`
- [Issue 2] at `file.ts:89`

**P1 — High Priority** (should fix)
- [Issue 3] at `file.ts:15`

**P2 — Nice to Fix** (suggestions)
- [Issue 4] at `file.ts:23`

### Test Results
[Pass/Fail + output summary]

### Recommendation
- [ ] Ready to commit (no P0 issues, tests pass)
- [ ] Fix issues first (list P0/P1 blockers)
```

## Usage

Invoke this skill after completing a feature or before committing:

```bash
/review
```

The skill will automatically:
1. Show what changed
2. Read the changed files
3. Check for common issues
4. Run tests
5. Report findings with priority levels

## Notes
- This is a **self-review**, not a substitute for code review
- Always fix P0 issues before committing
- Consider fixing P1 issues if time permits
- P2 suggestions are optional improvements
