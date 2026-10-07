# Frontend Coding Rules — Vite / React / MUI / Redux

> Applies to everything inside your frontend root.
> Backend has entirely separate rules — see the backend CLAUDE.md.
> Project-specific folder names and component identities go in the project's own CLAUDE.md.

---

## How Rules Apply (Philosophy)

Rules are guardrails to check yourself against while coding — not hard enforcement. They exist to prevent genuinely runaway patterns (1000-line renders, spaghetti side effects, style soup), not to dictate every micro-decision.

**Whenever a guardrail is reached — pause and ask the user before breaking it.** Never auto-decide to skip a rule. The human approves exceptions, not the AI. This applies to any rule in this file — not just JSX depth or styling.

---

## Coding Mindset — Deliberate Over Reactive

Write like a developer who has seen things go wrong, not one in a hurry to ship.

- **Read before touching.** Before modifying anything — a container, a component, a single prop — read the entire file first. Look for the full pattern: repeated props, parallel structures, conditional logic that travels together. The right abstraction is always visible at file scope, never at line scope. Fix the pattern, not the instance. This applies to styles, logic, props, and structure equally.
- **Validate the plan, not just the code.** A plan that proposes `bgcolor: '#0f172a'` or `pt: '8rem'` is already a violation before a single line is written. Apply the token system to proposals, not just implementations.
- **Think about visual outcome, not just structural correctness.** Two full-width thin strips are structurally valid MUI but visually broken. Ask: what will this actually look like? Does the content have enough mass to justify full width?
- **Exhaust the right primitive before reaching for a generic one.** Grid → Stack → Box, in that order. Justify Box usage explicitly if chosen.
- **One deliberate change, verified.** Don't chain three fixes at once without understanding each.

---

## Meta Rules (apply after every change sequence)

**Before finishing any implementation:**
- Check if `frontend-rules.md`, `MEMORY.md`, or any project docs need updating to reflect new decisions or patterns introduced
- If a human correction was needed during implementation, identify whether it was a rule violation. If yes — ask: should this correction be added to the ruleset so it doesn't happen again?
- Any rule or pattern added to memory that governs coding behaviour → must also be added here so all developers get identical AI behaviour on this repo

---

## Decision Matrix — New Container

Ask these before writing any container code:

**State & data**
- Is there any state value (`useState`) that should actually live in the Redux store or be a TanStack query? Justify local state explicitly
- Is any callback method passed down that could instead be a dispatched action?
- Is the data here server state (API response) or client state (UI mode, form draft)? Server state → evaluate TanStack; client state → Redux

**Redux / Saga practice**
- Are all async operations going through actions → sagas? No inline async, no direct service calls in the container
- Is the pub/sub model respected — dispatch an action, let the saga respond?
- If adding a new data domain, are all saga files created and registered in root.reducer + root.saga?

**Layout & render**
- Does the container render read like a layout blueprint — named components, not raw JSX blocks?
- Is the parent owning layout (spacing, positioning) and the child owning only its own internals?
- Have you read every sub-component this container uses before writing it? Never assume a child is MUI-ready without verifying

**UX proportionality**
- Does the content have enough visual mass to justify its container width?
- If a card or section looks wrong proportionally — stop and think before applying a mechanical fix

**Props**
- Are props being forwarded through this container without being used? If yes — use Redux or composition instead
- Is a child receiving more than 4–5 props? Consider whether Redux connection or composition eliminates the chain

---

## Decision Matrix — New Component

Ask these before writing any component code:

**Size & complexity**
- Is render logic exceeding 50–60 lines? If yes — find the natural split and extract; ask if the split isn't obvious
- Are there inline statements in props (ternaries, function calls, object literals)? Extract to variables before the return

**Styling**
- Can MUI's existing `variant`, `color`, `size`, or `component` props achieve the visual without any custom style? Use those first
- If custom style is needed — does a theme override make more sense than component-level `sx`? Global consistency > local sx
- Is any `sx` prop using raw values (hex, px, rem, string sizes)? If yes — replace with theme tokens or ask
- Is any MUI class being directly overridden? Stop — ask the user before doing this.

**Grid & layout isolation**
- Does this component include its own outer margin, padding, or positioning that assumes its parent context? It should not — the parent owns layout, the child owns its own internals
- Are Grid containers clearly isolated from their child components' content?

**Coupling**
- If this component is removed, does any parent or sibling break? If yes — the coupling is too tight
- Are props typed with a named interface? No inline type objects, no `any`

---

## Folder Structure

```
src/
├── components/          ← UI building blocks (dumb/presentational)
│   └── common/          ← Generic reusables (Button, Input, Card, Modal, Spinner…)
│       ├── Common.types.ts    ← ONE types file for all components/common/ interfaces
│       └── [ComponentName].tsx
│   └── [FeatureName]/   ← Domain component folder (e.g. Header/, Layout/, Search/)
│       ├── [FeatureName].types.ts   ← ONE types file per folder
│       ├── [FeatureName].style.ts   ← styled() declarations for this folder
│       └── [ComponentName].tsx
├── containers/          ← Route-level + shell-level compositions (smart/connected)
│   └── [ContainerName]/ ← e.g. AppHeader/, DashboardContainer/
├── store/               ← Redux state — see Store Structure below
├── services/            ← API call functions only — no business logic, no state
├── i18n/                ← Locale JSON files (en.json, fr.json, …)
└── common/              ← Shared utilities, constants, and types (non-component)
    ├── types.ts          ← App-wide shared types and interfaces
    ├── utils.ts          ← Pure utility functions
    └── constants.ts      ← App-wide constants
```

### Folder naming
- Component folders: **PascalCase** — `Header/`, `Layout/`, `UserCard/`
- Exception: `common/` stays lowercase — it is a category qualifier, not a domain name

---

## App Shell Rules (MANDATORY)

- Application shell pattern: sticky `<AppHeader />` followed by `<Routes />`
- Header is sticky, with consistent height and a gap below before page content begins
- `App.tsx` stays lean — routing only, no business logic, no inline JSX beyond the shell
- Page-level spacing and alignment belong in the `<Page>` wrapper and container roots, not in `App.tsx` or route config

---

## Token System — The Core Styling Rule (MANDATORY)

**All values for color, spacing, and typography must come from the MUI theme token system. Raw values are never acceptable.**

This applies uniformly to: `sx` props, `styled()` declarations, `style={{}}`, CSS-in-JS, and any style file.

### Colors

```tsx
// ✅ Always use palette tokens
sx={{ color: 'text.primary' }}
sx={{ bgcolor: 'background.default' }}
sx={{ borderColor: 'divider' }}
sx={{ color: 'primary.main' }}

// ❌ Never raw hex, color names, or rgba
sx={{ color: '#0f172a' }}
sx={{ bgcolor: '#f0f0f0' }}
style={{ color: 'rgba(0,0,0,0.6)' }}

// ❌ Never manually fork colors based on isDark — this re-implements what the token system does for free
sx={{ color: isDark ? 'success.light' : 'success.dark' }}
// ✅ Pick one semantic token and trust the theme
sx={{ color: 'success.main' }}
```

### Spacing

```tsx
// ✅ Always use numeric spacing props or theme.spacing()
sx={{ p: 2, mt: 4, gap: 1 }}         // MUI spacing tokens (multiples of 8px)
spacing={2}                            // MUI Stack/Grid spacing prop

// ❌ Never raw px, rem, em, vh, % for layout spacing
sx={{ padding: '16px' }}
sx={{ marginTop: '2rem' }}
```

### Typography

```tsx
// ✅ Always use variant prop or theme.typography keys
<Typography variant="h4">Title</Typography>
<Typography variant="caption">Label</Typography>

// ❌ Never raw font sizes, weights, or line heights
sx={{ fontSize: '1.5rem', fontWeight: 700 }}
```

### `sx` vs `styled()`
- **`sx` prop**: one-off structural adjustments using theme tokens only
- **`styled()`**: any block with 3+ style properties, or any style that is reused — extract to `X.style.ts`

### `styled()` spacing caveat
In Emotion `styled()`, shorthand spacing does NOT apply — `padding: 1` means `1px`, not `theme.spacing(1)`. Always use the theme callback:

```ts
// ✅
padding: ${({ theme }) => theme.spacing(2)};

// ❌ — means 2px, not 16px
padding: 2;
```

---

## Layout Rules (STRICT)

- **No raw values for layout or spacing** — see Token System above
- **No inline `style={{}}` props** — except truly dynamic values (e.g. a progress bar width computed from state)
- **Responsive by default** — every layout must handle `sm` (mobile) and `md`+ (desktop)

### Layout primitive hierarchy

Choose in this order — justify skipping a level:

1. **`Grid`** — for any multi-column or responsive card/section layout
2. **`Stack`** — for single-axis linear layouts (row or column of items)
3. **`Box`** — only when Grid and Stack genuinely don't apply; it is a plain div, not a layout system

### Grid spacing and negative margin rule

`Grid container spacing={n}` applies a negative margin of `-spacing(n)/2` to all sides. If the Grid is the page root with no parent padding, this bleeds content off the viewport edge.

**Two safe patterns:**

```tsx
// ✅ Pattern A — root grid uses gap (no negative margin), inner grid uses spacing
<Grid container direction="column" sx={{ p: 3, gap: 3 }}>
  <Grid container spacing={3} justifyContent="flex-start">
    <Grid item xs={12} md={4}><Card /></Grid>
  </Grid>
</Grid>

// ✅ Pattern B — root grid uses spacing, parent provides padding >= spacing(n)/2
<Grid container spacing={3} sx={{ px: 3 }}>
  <Grid item xs={12} md={4}><Card /></Grid>
</Grid>

// ❌ Never — spacing on root grid with no padding to absorb the bleed
<Grid container spacing={3}>
```

### Accepted viewport unit exception

`minHeight: '100vh'` is the only accepted raw viewport value. All other viewport units require human approval before use.

---

## MUI Customisation Hierarchy

Follow this order — do not skip levels:

1. **MUI component props** (`variant`, `color`, `size`, `component`) — always try these first
2. **Theme `styleOverrides`** — for global consistency across all instances
3. **`sx` prop with theme tokens only** — for one-off instance-specific adjustments
4. **`styled()` in `X.style.ts`** — for reusable wrappers with 3+ style properties

**Never override MUI internal classes directly** (`.MuiButton-root`, `& .MuiChip-label`) without human approval.

---

## Theme Setup

```ts
// src/theme/getTheme.ts — recommended factory function pattern
import { createTheme, Theme } from '@mui/material/styles';

const getTheme = (mode: 'light' | 'dark'): Theme =>
  createTheme({
    cssVariables: true,
    palette: { mode },
    // typography, shape, component overrides go here
  });

export { getTheme };
```

Store the active mode string (`'light' | 'dark'`) in Redux. The `ThemeProvider` wrapper reads this and passes it to `getTheme()`.

---

## Store Structure

### Option A — Per-domain folders (recommended for larger apps)

```
store/
├── app/
│   ├── app.action-types.ts
│   ├── app.actions.ts
│   ├── app.reducer.ts
│   └── app.saga.ts
├── root.reducer.ts
├── root.saga.ts
└── index.ts
```

### Option B — Flat folder structure (acceptable for smaller apps)

```
store/
├── actions/
├── reducers/
├── sagas/
└── index.ts
```

### Redux Rules
- Action types: `DOMAIN/ACTION_NAME` string constants
- Action creators: pure functions returning plain objects
- Reducers: `switch/case`, no mutations, always return a new object
- Sagas: all async and side effects — `takeLatest`/`takeEvery` on action type strings
- New domain = all saga files + register in root.reducer and root.saga
- RTK used for `configureStore` only — no `createSlice`, no immer
- **No direct API calls in components or containers** — dispatch an action, let the saga respond

---

## Redux / Store Bootstrap

```ts
// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import rootReducer from './root.reducer';
import rootSaga from './root.saga';

const sagaMiddleware = createSagaMiddleware();

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ thunk: false, serializableCheck: false }).concat(sagaMiddleware),
});

sagaMiddleware.run(rootSaga);

export default store;
export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
```

---

## Internationalisation (i18n) — MANDATORY

**No hardcoded user-facing text anywhere in production components.**

```tsx
// ✅
<Typography>{t('dashboard.title')}</Typography>
<Button>{t('actions.submit')}</Button>

// ❌ Never in production components
<Typography>Status Messages</Typography>
<Button>Fetch</Button>
```

- i18n library: react-i18next (confirm before installing if not yet set up)
- Locale files live in `src/i18n/` — one JSON per locale
- This rule applies from the first component — do not defer it to a cleanup pass
- Dummy/dev-only components are exempt

---

## Component Rules

- Components under **80 lines of JSX** — if larger, find the natural split
- No ternaries more than 1 level deep in JSX
- `.map()` with more than 2 lines of JSX inline → extract a sub-component
- If you'd write a `{/* section */}` comment → extract a component instead
- Semantic HTML: `<button>` not `<div onClick>`, use `<nav>`, `<main>`, `<header>`
- All interactive elements must have `aria-label` or visible text
- **Interfaces in a folder-level types file, not inline** — one `[FolderName].types.ts` per folder
- **Conditional sx spreads are styled-component props in disguise:**

```tsx
// ❌ — condition belongs as a prop on a styled() component
sx={{ ...(isActive && { color: 'primary.main', fontWeight: 700 }) }}

// ✅
const StyledItem = styled(ListItem)<{ active: boolean }>(({ theme, active }) => ({
  color: active ? theme.palette.primary.main : theme.palette.text.primary,
}));
```

---

## Data Fetching — Decision Gate (MANDATORY)

**When discussing any new feature — before any code is written:**
1. Present **pros and cons** of TanStack Query vs Redux Saga + reducer for the specific use case
2. Give a **clear recommendation** with reasoning
3. Wait for user to make the final call — never proceed without confirmation

| Pattern | Strengths | Weaknesses |
|---|---|---|
| **TanStack Query** | Built-in cache, loading/error states, auto-refetch, devtools, less boilerplate | Not suited for complex multi-step flows; cache invalidation can get tricky |
| **Redux Saga + reducer** | Full control over orchestration, multi-step side effects, state visible globally | More boilerplate; overkill for simple fetch/display |

- **Never default to either pattern** — always present the trade-offs and wait for the user's call
- **Never mix both patterns for the same data domain** without user sign-off

---

## Pre-Commit Checklist

```
Token System (zero tolerance)
  [ ] No raw hex, color names, rgba anywhere
  [ ] No raw px, rem, em, vh, % for layout/spacing
  [ ] No raw font sizes or weights — use Typography variant prop
  [ ] sx props contain only theme tokens
  [ ] styled() uses theme callback for spacing
  [ ] No MUI internal class overrides without human approval
  [ ] No isDark color forks — use one semantic token

Layout
  [ ] App shell is sticky header + Routes
  [ ] Page wrapper used in each container root
  [ ] Responsive: sm (mobile) + md (desktop) handled
  [ ] No inline style={{}} for layout
  [ ] Parent owns layout; child has no outer margins assuming its context
  [ ] Layout primitive chosen correctly: Grid → Stack → Box

Structure
  [ ] Generic/reusable components in components/common/
  [ ] Container render is layout-only (≤2 levels deep, or exception approved)
  [ ] Complex JSX extracted to named sub-components

Store
  [ ] Action types follow DOMAIN/ACTION_NAME namespaced format
  [ ] New domains registered in root.reducer + root.saga
  [ ] No API calls in components or containers

Code Style
  [ ] Fat-arrow function format used consistently
  [ ] All props have a typed interface in [FolderName].types.ts
  [ ] No any types

i18n
  [ ] No hardcoded user-facing text — all strings from i18n JSON files

Data Fetching
  [ ] Asked user: TanStack Query or Saga + reducer? (required before any new backend call)

Security
  [ ] No hardcoded PII in useState defaults, mock data, or fixtures
  [ ] No tokens or secrets in source code
```
