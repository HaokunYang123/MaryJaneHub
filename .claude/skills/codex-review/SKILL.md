# Codex Review Prompt Generator

## Config
- user-invocable: true
- disable-model-invocation: true

## Description
Generates a comprehensive review prompt for external code review (e.g., copying to another Claude session or Codex). Includes full context, constraints, and focus areas.

## Steps

### 1. Gather Change Context
```bash
git diff HEAD
git log --oneline -10
```

### 2. Read Key Changed Files
For each changed file:
- Read the file
- Note the purpose and key changes
- Identify dependencies

### 3. Extract Project Constraints
Read these files for context:
- `/AGENTS.md` — working conventions
- `/CLAUDE.md` — project structure and patterns
- `/docs/phase-current.md` — current task context
- `/docs/decisions.md` (recent entries) — recent technical decisions

### 4. Generate Review Prompt

Output a copy-pasteable prompt in this format:

````markdown
# Code Review Request

## Project Context
[Project name and one-sentence description from CLAUDE.md]

**Stack:** [Stack list from CLAUDE.md]

## Changes to Review

### Files Changed
[List each file with line count and brief description]

### Change Summary
[Brief description of what these changes accomplish]

### Commit Context
[Recent commits from git log]

## Project Constraints

### Security
- All API endpoints must be auth-protected
- No SQL injection, XSS, or command injection
- No exposed secrets or credentials
- Email whitelist for user access

### Data Integrity
[Extract relevant patterns from AGENTS.md and CLAUDE.md]

### Code Patterns
[Extract key patterns from CLAUDE.md]

### Current Phase
[From phase-current.md: phase name and goal]

### Recent Decisions
[Extract 3-5 most recent relevant decisions from decisions.md]

## Review Focus Areas

Please review for:

**Critical Issues (P0)**
- Wrong database fields (check field names match schema)
- Unit mismatches (USD vs cents, seconds vs milliseconds)
- Security vulnerabilities (SQL injection, XSS, command injection, exposed secrets)
- Missing auth checks
- Breaking API contract changes

**High Priority (P1)**
- Missing input validation
- Hardcoded values (should be config/env)
- Missing error handling for external calls
- Missing required evidence for sync operations
- Data integrity violations

**Code Quality (P2)**
- Consistency with existing patterns
- Naming conventions
- Unnecessary complexity
- Missing edge case handling
- Opportunities for simplification

## Files to Review

```
[Full git diff output]
```

## Request

Please review these changes and report:
1. Any P0 issues (blocking)
2. P1 issues (should fix)
3. P2 suggestions (optional improvements)
4. Overall assessment (approve/needs changes)

Format your response with file:line references for each issue.
````

### 5. Output the Prompt

Print the generated prompt in a code block so the user can easily copy it.

## Usage

Invoke this skill at phase milestones or before major merges:

```bash
/codex-review
```

The skill will:
1. Analyze recent changes
2. Extract project context and constraints
3. Generate a comprehensive review prompt
4. Output it in a copy-pasteable format

## Example Use Cases

- Before merging a large feature branch
- At the end of a phase (before marking phase-done)
- Before creating a pull request
- When you want a second opinion on complex changes
- Before making breaking changes

## Notes

- The generated prompt includes **full context** so the external reviewer doesn't need access to the repo
- Includes **project-specific constraints** from AGENTS.md and decisions.md
- Specifies **focus areas** to guide the review
- Outputs in **copy-pasteable format** for easy use
- Can be used with Claude in a different session, GitHub Copilot, or any other code review tool
