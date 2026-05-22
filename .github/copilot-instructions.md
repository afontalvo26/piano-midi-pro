# ServiTap — Copilot Instructions

## Caveman Mode (ALWAYS ON)

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging.
Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.
Code/commits/PRs: normal. Off: "stop caveman" / "normal mode".

## Project Identity

ServiTap (`servitap-app@2.0.0`) — Colombian home-services marketplace connecting clients with technicians. React 18 + TypeScript 5 + Vite 5 + Supabase + Capacitor 8 (Android). Production: `https://servitap.com.co/`

## Core Rules

- **Language:** All user-facing text in Spanish (Colombian). Code in English.
- **CSS:** Only `--servitap-*` design tokens. Never hardcode colors. Dark mode must work. See `DESIGN.md` for full palette, typography, and component specs.
- **Mobile-first:** Base 375px, use `100dvh`, `env(safe-area-inset-*)`.
- **Services:** Wrap with `withServiceLogging()`. Throw on error.
- **Hooks:** Use `useAuth()` for user. `addToast()` for feedback. `logger.*` for logging.
- **Security:** RLS on ALL tables. `SECURITY DEFINER + SET search_path = public` on RPCs. `auth.uid()` validation. `sanitizeInput()` before storage.
- **Types:** After new tables/RPCs → `npx supabase gen types typescript --project-id imtbgfnbbclznhtyfemf > src/types/supabase.ts`
- **Lazy loading:** All new screens via `React.lazy()` + `Suspense` + `RequireAuth`.
- **Rate limiting:** Apply `checkRateLimit()` / `checkClientRateLimit()` on action endpoints.
- **QA realtime default:** For E2E and QA validation, use Playwright MCP live execution first. Do not require manual test runs unless the user explicitly asks for command-based suites.
- **File paths:** Source at `airtech-app/src/`, skills at `.github/skills/`, supabase at `supabase/`.

## Project Status Tracking (MANDATORY — NEVER SKIP)

**File:** `airtech-app/SERVITAP-STATUS.md`

This file is the **SINGLE SOURCE OF TRUTH** for what we've done, what's broken, and what's next.
**EVERY AI SESSION MUST READ THIS FIRST.** No exceptions.

**Rules:**
1. **READ** `SERVITAP-STATUS.md` at the **VERY START** of every task/conversation about ServiTap. Before writing ANY code.
2. **UPDATE** `SERVITAP-STATUS.md` at the **END** of every completed task:
   - Add new blockers discovered during work.
   - Update "Próximos Pasos" if priorities changed.
   - Update "Estado General" table if system status changed.
   - Update "Última actualización" date.
3. **CLEAN resolved items.** When a blocker/issue is fixed:
   - **DELETE** the entire entry from "Pendientes Activos". Do NOT strikethrough (~~) or mark "→ RESUELTO".
   - If it's a significant feature or architectural change, add a **1-line summary** to "Funcionalidades Implementadas".
   - Do NOT accumulate fix history. The file must stay lean (<150 lines).
4. **Never skip** the update step. Even small fixes must be recorded.
5. Keep entries concise: date + what changed + files affected.
6. **If another AI changed passwords, keys, or config** — it's documented HERE. Read before assuming.

## Test Accounts (Production)

| Role | Email | Password |
|------|-------|----------|
| Cliente | `afontalvo@lifefile.net` | `1470Caro_@` |
| Técnico | `lapeste2023@outlook.com` | `1470Caro_@` |
| Admin | `admin@test.com` | `1470Caro_@` |

All 3 have `is_test_account = true` in `profiles` table. Test accounts get budget bypass (min $100, max $300 COP).

## Skills (auto-loaded by triggers)

| Skill | Use When |
|-------|----------|
| `servitap-project` | Starting any task, needing architecture/context overview |
| `servitap-design` | Styling, colors, spacing, typography, component specs, dark mode |
| `feature-development` | Building new features, components, hooks, services |
| `supabase-ops` | Edge functions, migrations, RPCs, RLS, storage, Wompi |
| `caveman` | Token-saving mode (~75% less output). Trigger: "caveman mode", "less tokens", "be brief" |
| `caveman-commit` | Terse commit messages. Trigger: "write a commit", "commit message" |
| `caveman-review` | One-line PR review comments. Trigger: "review this PR", "code review" |
| `caveman-help` | Quick-reference card for caveman commands and modes |

## RTK — Token-Optimized CLI

**rtk** is a CLI proxy that filters and compresses command outputs, saving 60-90% tokens.

Always prefix shell commands with `rtk`:

```bash
# Instead of:              Use:
git status                 rtk git status
git log -10                rtk git log -10
npm run test               rtk npm run test
npm run build              rtk npm run build
```

### Meta commands (use directly)

```bash
rtk gain              # Token savings dashboard
rtk gain --history    # Per-command savings history
rtk discover          # Find missed rtk opportunities
rtk proxy <cmd>       # Run raw (no filtering) but track usage
```
