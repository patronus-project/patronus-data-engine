# Process Rules — Reference

> Rules governing how AI-assisted development sessions are run.
> All rules here apply to every project.

---

## Pre-Edit Rule — Read Before Touching

Before modifying any existing file, read it entirely first.

Look for patterns — repeated logic, parallel structures, conditional branches that travel together. **Fix the pattern, not the instance.** This applies to controllers, services, models, routes, utils, config — not just style files.

If you'd write a comment like `// fix this too` on another occurrence — you've found a pattern. Stop. Fix the abstraction.

**Conditional spreads are typed props in disguise:**
```typescript
// ❌ — this means the condition belongs as a prop on a component/function
sx={{ ...(isActive && { color: 'primary.main', fontWeight: 700 }) }}

// ✅ — model it explicitly
const ActiveTypography = styled(Typography)<{ active: boolean }>(...)
```

---

## Downstream Impact Trace

Before declaring any change done, trace what consumes the thing you changed:
- Modified a service function → check every controller that calls it
- Modified a model field → check every query, projection, and type that references it
- Modified an enum value → check every switch/case and conditional that uses it
- Modified a middleware → check every route it's applied to
- Modified an exported type → check every importer

A change not traced is a downstream break waiting to be discovered in production.

---

## Self-Review — Mandatory After Every Write

After writing or editing any file, before moving on:

1. **Read what you just wrote.** Use the Read tool. Not optional.
2. **Check it compiles mentally:**
   - All imports exist in the file
   - No mixed module systems (ESM `import` mixed with CJS `require`)
   - No platform-specific assumptions (e.g. Windows path separators in cross-platform code)
   - No logic already implemented elsewhere that you're duplicating
3. **Check dependencies:** if a package is used in code or scripts, verify it is in `package.json` before declaring done
4. **Trace downstream:** what calls or consumes what you just changed?

Writing and declaring done are not the same thing. The review step is what connects them.

---

## Plan Mode Behavior

When writing a plan in plan mode:
1. Write the plan file
2. **Display the plan content as markdown text in the response**
3. **Stop. Do not call `ExitPlanMode`.**
4. Wait for explicit user approval: "go ahead", "looks good", "proceed"

**Why:** `ExitPlanMode` triggers a UI popup asking the user to auto-accept. The user wants to read the plan in the chat and give explicit instruction — not click through a popup.

---

## Project-Claude Sync Rule

When saving any coding rule, pattern, or feedback to memory — first check if it belongs in the project's `.claude/CLAUDE.md`.

**Decision tree:**
- Coding standards, component patterns, architecture rules → `.claude/CLAUDE.md` (git-tracked, applies to all developers)
- Project context, open tasks, architecture state, session logs → memory only
- Rules general enough to apply across ALL projects → global `CLAUDE.md`

After updating memory with a rule, ask: *"Would a new developer need this rule in their first session?"* If yes → update CLAUDE.md too. Memory files then become pointers to the canonical rules.

---

## Violation & CRM Callout Logging

See [templates/violation-log-template.md](../templates/violation-log-template.md) for the blank template to copy.

### Two types of events logged in `.claude/violation-log.md`:

**Violations** — AI rule failures (PM missed something, user caught it, or AI self-caught before shipping):

| Field | What to record |
|---|---|
| Timestamp | Approximate time |
| Session | S1, S2, S3... |
| Category | PROCESS / SECURITY / TYPING / NAMING / ARCHITECTURE / TOOLING / MEMORY / CRM / KNOWLEDGE |
| Rule Violated | The specific rule or principle |
| Failure Summary | What went wrong and what shipped |
| Caught By | `User` or `AI (self-caught)` |
| Lines Refactored | Approximate lines fixed |
| Turns to Fix | Back-and-forth turns to resolve |
| Root Cause | Why it happened — not what happened |

**CRM Callouts** — PM explicitly flagged a PF instruction as a deviation. Log even if PF overrides:

| Field | What to record |
|---|---|
| Timestamp | Approximate time |
| Session | Session label |
| What Was Called Out | The instruction or action flagged |
| Rule / Principle Cited | What the callout was grounded in |
| PF Decision | `Corrected course` / `Explicit override: [reason]` |
| Outcome | What happened as a result |

**Why log callouts:** The callout log is the only signal that tells you if the PM is well-calibrated — too noisy, too silent, or accurate. Without it, PM judgment quality cannot be measured or improved.

---

## AI Changelog — Mandatory After Every Code-Changing Session

See [templates/ai-changelog-template.md](../templates/ai-changelog-template.md) for the blank template.

Every session that produces code changes MUST append an entry:

```md
### YYYY-MM-DDTHH:MM:SSZ
**Prompt Summary:** [sanitised summary of what was asked]
**Type:** feature | refactor | bugfix | performance | architecture | test | infra
**Risk:** low | medium | high
**Files:** [comma-separated list]
**Notes:** [reasoning for approach taken]
**Migration:** [API/DB changes, or "none"]
---
```

---

## Tooling Note — VSCode Edit Tool Bug

If the Edit/Write tool fails with `"File has not been read yet"` immediately after a successful Read:
- Try forward-slash paths (e.g. `g:/myproject/...`) instead of backslash — possible path normalisation mismatch
- If still failing — ask the user to restart the IDE (VSCode extension "file modified" system reminders invalidate the tool's read state)
- Do NOT loop-retry the same approach — escalate to the user quickly

Root cause: the tool tracks file read state and invalidates it when modification notifications arrive. System reminders in the user message are processed in a way that resets read state before tool calls execute.

---

## Escalate Before Doing

Stop and confirm with the user before any of these:

| Action | Why |
|---|---|
| Adding a new npm/pip dependency | Increases attack surface, bundle size, maintenance burden |
| Changing JWT/auth token payload shape | Breaking change for all existing sessions |
| Modifying auth flow or middleware | Security-sensitive, high blast radius |
| Adding a new `process.env.*` call | Banned in projects using Key Vault / EnvService |
| Hard-deleting production data | Irreversible |
| Changing bootstrap file or telemetry init | Affects everything |
| Changing shared lib APIs | Breaks all consumers |
| Adding a new database or changing DB connection strategy | Architectural decision |
