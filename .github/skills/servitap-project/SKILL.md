---
name: servitap-project
description: 'ServiTap project DNA — complete architecture, tech stack, business rules, roles, database schema, and conventions. USE WHEN: starting any task on this project, onboarding to the codebase, understanding how features connect, asking about project structure, understanding business logic, or when context about ServiTap/airtech-app is needed. Triggers: servitap, airtech, project, architecture, overview, how does, structure, roles, flows.'
---

# ServiTap — Project DNA

## What Is ServiTap?

A **service marketplace mobile-first PWA** connecting clients who need home/technical services with verified technicians. Built as a Capacitor hybrid app (Android + Web). Three roles: **Client**, **Technician**, **Admin**.

| Key | Value |
|-----|-------|
| Production | `https://servitap.com.co/` |
| App ID | `com.servitap.app` |
| Supabase | `imtbgfnbbclznhtyfemf` |
| Language | Spanish (Colombia) |
| Currency | COP (Colombian Pesos) |
| Theme | `#2563EB` (brand blue), `#0A0D12` (dark bg), `#FF6B35` (accent coral) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript 5 |
| Routing | React Router DOM 7 |
| Build | Vite 5 + VitePWA (Workbox) |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage) |
| Mobile | Capacitor 8 (Android) — SplashScreen, StatusBar, Keyboard, PushNotifications, Haptics |
| Payments | Wompi (Colombian gateway) — sandbox + production via `VITE_WOMPI_PUBLIC_KEY` prefix |
| Animations | Framer Motion 10 |
| Icons | Lucide React (import individually) |
| Charts | Recharts 3 |
| Maps | Leaflet + React-Leaflet + OSRM routing + Nominatim geocoding |
| Styling | CSS Modules + `--servitap-*` design tokens + Framer inline |
| State | React Context API + 45+ Custom Hooks (NO Redux) |
| Testing | Vitest (unit/integration) + Playwright (E2E) + Testing Library |
| Deploy | Vercel (web, SPA rewrite, CSP/security headers) + Capacitor (Android APK) |
| Push | FCM via Capacitor `@capacitor/push-notifications` |
| Analytics | GTM + custom AnalyticsTracker (40+ funnel events) |
| Logging | LoggerService (834 lines, AES-256 encrypted batches, localStorage offline queue) |
| Haptics | `@capacitor/haptics` native + `navigator.vibrate` web fallback |
| PWA | VitePWA autoUpdate + Workbox CacheFirst (Google Fonts) + `push-sw.js` |

---

## Project Structure

```
airtech-app/
├── src/
│   ├── components/
│   │   ├── admin/         # AdminDashboard, AdminDisputes, AdminWithdrawals, AdminSystemLogs, etc.
│   │   ├── auth/          # Login, Register (5-step), OTPVerification, MFA×3, PasswordReset×2, Welcome
│   │   ├── chat/          # ChatScreen (service + dispute channels), typing indicators
│   │   ├── client/        # HomeScreen, ServiceProgress, EnergyTips, Referrals, Categories, etc.
│   │   ├── technician/    # TechDashboard, WalletScreen, WorkMode, MarketScreen, etc.
│   │   ├── provider/      # ProviderMarket, ProviderDisputes, ProviderOnboardingFlow
│   │   ├── onboarding/    # ProviderOnboardingFlow (tech welcome + category setup)
│   │   ├── shared/        # BottomSheet, Toast, Navigation, Loader, LoggedErrorBoundary
│   │   ├── payment/       # Wompi widget integration
│   │   └── ui/            # CitySelector, base UI atoms
│   ├── contexts/          # AuthContext, ThemeContext, NetworkContext, NotificationContext, etc.
│   ├── hooks/             # 45+ custom hooks
│   ├── services/          # 35+ service files (API/RPC wrappers with withServiceLogging)
│   ├── lib/               # supabase.ts, wompi.ts, notifications.ts, haptics.ts, analytics.ts, device.ts
│   ├── utils/             # emailValidation, passwordValidation, sanitize, rateLimit, geo, searchUtils
│   ├── types/             # supabase.ts (auto-gen), index.ts (custom interfaces)
│   ├── styles/            # design-system.css (100+ tokens), mobile-first.css (safe areas, iOS fixes)
│   └── data/              # serviceCategories, checklists, serviceCategoryMeta, nursingTips
├── supabase/
│   ├── functions/         # 12 Deno edge functions
│   └── migrations/        # 150+ SQL migrations
├── public/
│   ├── push-sw.js         # Service worker for FCM push
│   ├── icons/             # PWA icons (192, 512, maskable)
│   └── email-templates/   # HTML email templates
├── qa-checklist/          # 14 SUITE-QA files (manual test suites, 243 tests total)
└── capacitor.config.ts    # Android native plugin config
```

---

## Capacitor / Mobile Config

```typescript
// capacitor.config.ts
appId: 'com.servitap.app'
webDir: 'dist'
plugins: {
  SplashScreen:      { launchShowDuration: 1800, bg: '#0A0D12', splashFullScreen+Immersive }
  StatusBar:         { style: 'dark', bg: transparent, overlaysWebView: true (Android 15 edge-to-edge) }
  Keyboard:          { resize: 'body', style: 'dark', resizeOnFullScreen: true }
  PushNotifications: { badge + sound + alert }
}
android: { captureInput: true, webContentsDebuggingEnabled: !!devServerUrl }
```

**Key native integrations:**
- `src/lib/haptics.ts` — 9 patterns: light, medium, heavy, swipe, success, error, warning, selection, notification
- `src/hooks/useCapacitorPlugins.ts` — SplashScreen hide, StatusBar sync, keyboard management
- `src/hooks/useAndroidBackButton.ts` — Hardware back button → navigation pop
- `src/hooks/usePushNotifications.ts` — FCM token registration + foreground/background listeners
- `src/hooks/usePWAInstall.ts` — PWA install prompt detection

---

## PWA Configuration (vite.config.ts)

- **Manifest:** "ServiTap - Expertos a un toque", standalone, portrait, lang: es
- **Service Worker:** autoUpdate, Workbox CacheFirst for Google Fonts (1-year TTL)
- **Icons:** 192×192 PNG, 512×512 PNG, 512×512 maskable
- **Push:** imports `/push-sw.js` for FCM handling
- **Build chunks:** vendor-react, vendor-motion, vendor-supabase, vendor-charts, vendor-leaflet, vendor-pdf
- **esbuild:** Production strips `console.log`, `console.warn`, `debugger` (keeps `console.error`)
- **Proxy:** `/wompi` → sandbox/production Wompi API (dev only)

---

## Vercel Security (vercel.json)

- SPA rewrite: `/(.*) → /index.html`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: geolocation(self), payment(self), camera/mic blocked
- **CSP:** allows Wompi checkout, Supabase (HTTPS+WSS), OSRM, Nominatim, Google Fonts, CartoDB tiles

---

## Auth System

### AuthContext State
```typescript
interface AuthContextType {
  user: User | null;              // id, name, email, role, phone, city, avatar, verificationStatus
  login(email, password)          // + registerSession + rate limit check
  loginWithProvider('google'|'apple'|'azure')
  logout()                        // releases session lock, clears analytics, sets offline
  requestEmailOtp(email)          // SMTP 6-digit code
  verifyEmailOtpAndRegister(email, token, password, userData)
  resetPasswordForEmail(email)
  updatePassword(password)
  forceLogin(email, password)     // Takes session from other device
  isAuthenticated: boolean
  initializing: boolean           // First session check (shows FullScreenLoader)
  loading: boolean                // Auth action in progress
  error: string | null
  classifiedError: ClassifiedAuthError | null  // { message, display: 'inline'|'modal', fields[] }
  sessionConflict: SessionConflictInfo | null  // Active session on another device
}
```

### Registration Flow (5 Steps)
1. **Role selection** — Client or Technician
2. **Name** — first_name + last_name
3. **Contact** — email (RFC 5322) + phone (10-digit Colombian 300–330)
4. **City** — CitySelector dropdown
5. **Password + Terms** — min 8 chars, strength ≥ 2, terms checkbox

→ `requestEmailOtp()` → OTP screen (6-digit, 1hr expiry, 60s resend cooldown) → `verifyEmailOtpAndRegister()` → logged in → role home

**Form persistence:** sessionStorage `airtech_registration_state` with 1hr TTL.

### Session Enforcement
- **Single session:** `registerSessionAtLogin()` RPC → blocks duplicate logins
- **Heartbeat:** Every 30s via `validate_user_session` RPC
- **Conflict:** Shows `SessionBlockedScreen` if session replaced elsewhere
- **Token:** 16 random bytes + timestamp, stored in localStorage `airtech_session_{userId}`

### MFA
- `MFASettingsScreen` — enable/disable TOTP
- `MFAVerifyScreen` — verify TOTP code on login
- `MFAGuard` — route wrapper requiring MFA verification

---

## Rate Limiting (Dual-Layer)

| Action | Max | Window | Layer |
|--------|-----|--------|-------|
| `login_attempt` | 5 | 15 min | Client (localStorage, pre-auth) |
| `otp_request` | 3 | 10 min | Client |
| `service_create` | 5 | 60 min | Server (RPC `check_rate_limit`) |
| `quote_submit` | 10 | 60 min | Server |
| `file_upload` | 20 | 60 min | Server |
| `password_reset` | 3 | 30 min | Client |

**Usage:** `const result = await checkRateLimit('service_create'); if (!result.allowed) showError(result.message);`

---

## Complete Route Map (73+ routes)

### Client Routes (`/`)
| Path | Component |
|------|-----------|
| `/` | HomeScreen |
| `/categories` | CategoryExplorerScreen |
| `/all-categories` | AllCategoriesScreen |
| `/service-request/:categorySlug` | ServiceRequestScreen (3-step wizard) |
| `/service/:id` | ServiceProgressScreen |
| `/service/:id/dynamic-report` | ServiceDynamicReportScreen |
| `/service/:id/dispute` | DisputeFormScreen |
| `/negotiations` | NegotiationsListScreen (shared client+tech) |
| `/chat/:conversationId` | ChatScreen |
| `/chat/dispute/:serviceId` | ClientDisputeChatScreen |
| `/equipment` | EquipmentListScreen |
| `/equipment/new` | EquipmentDetailScreen |
| `/equipment/:id` | EquipmentDetailScreen |
| `/history` | HistoryScreen |
| `/profile` | ProfileScreen |
| `/addresses` | AddressListScreen |
| `/addresses/new` | AddressFormScreen |
| `/addresses/:id/edit` | AddressFormScreen |
| `/energy-tips` | EnergyTipsScreen |
| `/rewards` | RecompensasScreen |
| `/referrals` | ReferralScreen (shared client+tech) |
| `/referrals/wallet` | ClientReferralWalletScreen |
| `/support` | SupportScreen |
| `/change-password` | ChangeCredentialScreen |
| `/change-email` | ChangeEmailScreen |
| `/notification-settings` | NotificationSettingsScreen |
| `/settings/security` | MFASettingsScreen |

### Technician Routes (`/tech`)
| Path | Component |
|------|-----------|
| `/tech` | TechnicianDashboard |
| `/tech/market` | MarketScreen (RequireCategories) |
| `/tech/market/:serviceId` | MarketScreen (detail view) |
| `/tech/work-mode` | WorkModeScreen |
| `/tech/wallet` | WalletScreen |
| `/tech/wallet/history` | MovementHistoryScreen |
| `/tech/history` | TechnicianHistoryScreen |
| `/tech/tools` | TechToolsScreen |
| `/tech/profile` | ProfileScreen |
| `/tech/verification` | VerificationScreen |
| `/tech/identity-verification` | IdentityVerificationScreen |
| `/tech/categories` | CategorySetupScreen (mandatory if no categories) |
| `/tech/subscription` | SubscriptionScreen |
| `/tech/my-plan` | CurrentSubscriptionScreen |
| `/tech/onboarding` | ProviderOnboardingFlow |
| `/tech/chat/:conversationId` | ChatScreen |
| `/tech/chat/dispute/:serviceId` | ProviderDisputeChatScreen |
| `/tech/support` | SupportScreen |
| `/tech/settings/security` | MFASettingsScreen |

### Admin Routes (`/admin`) — AdminLayout wrapper
| Path | Component |
|------|-----------|
| `/admin/dashboard` | AdminDashboard |
| `/admin/verification` | AdminVerificationQueue |
| `/admin/clients` | AdminClients |
| `/admin/technicians` | AdminTechnicians |
| `/admin/services-finances` | AdminServicesFinances |
| `/admin/disputes` | AdminDisputes (6-tab investigation) |
| `/admin/withdrawals` | AdminWithdrawals (approve/reject) |
| `/admin/subscriptions` | AdminSubscriptions |
| `/admin/categories` | AdminCategories |
| `/admin/protocols` | AdminProtocols |
| `/admin/rewards` | AdminRewards |
| `/admin/settings` | AdminSettings |
| `/admin/system-logs` | AdminSystemLogs |

### Public Routes (GuestOnly guard)
| Path | Component |
|------|-----------|
| `/welcome` | WelcomeScreen |
| `/login` | LoginScreen |
| `/register` | RegisterScreen (5-step) |
| `/forgot-password` | RequestPasswordResetScreen |
| `/update-password` | UpdatePasswordScreen |
| `/terms` | TermsScreen |
| `/privacy` | PrivacyScreen |
| `/landing` | LandingScreen |
| `/landing/docs` | DocsScreen |
| `/unete` | JoinTechLanding |

### Route Guards
- `RequireAuth` — checks isAuthenticated + allowedRoles → redirects to `/welcome`
- `RequireCategories` — tech must have provider_categories → redirects to `/tech/categories`
- `GuestOnly` — redirects authenticated users to role-specific home
- `SessionGuard` — wraps ALL auth routes; blocks if session replaced elsewhere

---

## Three Roles — Complete Detail

### Client Journey
1. Registers (5-step) → lands on HomeScreen
2. Browses categories → selects one → 3-step service wizard (type → details+address → confirm)
3. Service created (status: `pending`) → techs see it in market
4. Receives quotes → reviews in NegotiationsListScreen → can negotiate price
5. Accepts quote → `accept_quote_transaction` RPC → Wompi widget → pays
6. Tracks service: assigned → tech on_the_way → in_progress → pending_confirmation
7. Confirms completion → rates tech (1-5 stars + comment)
8. **Optional:** Request refund (if assigned), open dispute (within 15 days of completion)
9. **Referrals:** Share code → earn 12% when referee completes first service → separate wallet (min $50K withdrawal)
10. **Equipment:** Register AC units, appliances → attach to service requests
11. **Addresses:** Save multiple addresses → select during service request
12. **Energy tips:** Gamified tips with points + rewards
13. **Support:** In-app support chat

### Technician Journey
1. Registers → ProviderOnboardingFlow → selects service categories (mandatory)
2. Optionally: identity verification (upload docs), subscription plan
3. Dashboard shows: active services, earnings summary, stats
4. Market: browse available services → send quotes (price, estimated time, message)
5. If quote accepted: service moves to `assigned` → taps "Ir" → `on_the_way` → "Llegué" → `in_progress` → "Completar" → `pending_confirmation`
6. Client confirms → commission created (80% payout, 20% platform)
7. Wallet: view balance (today/week/month), earnings trend (7-day), bonus progress
8. Milestone bonus: every 5 completed services → 5% of last 5 payouts credited
9. Withdrawal: min $10K COP, max 3 pending → admin approves → bank transfer (Bancolombia, Nequi, Daviplata, etc.)
10. Tools: diagnostic tools, service protocols, checklists
11. WorkMode: active service dashboard with map, status controls, chat

### Admin Journey
1. Login → AdminDashboard (real-time subscriptions on 7 tables)
2. **Verification queue:** review tech identity documents → approve/reject
3. **Users:** view/manage clients and technicians, block/unblock
4. **Services & Finances:** service overview, commission tracking, payment status
5. **Disputes:** 6-tab investigation panel (Resumen, Cronología, Evidencia, Chat Cliente, Chat Técnico, Resolución) → resolve with split percentages
6. **Withdrawals:** pending queue → approve/reject with notes → balance re-validation at approval time
7. **System logs:** audit trail, admin action logs, telemetry
8. **Config:** manage categories, protocols, subscriptions, rewards, platform settings

---

## Core Business Flows

### Service Lifecycle
```
pending → quoted → accepted → paid → assigned → on_the_way → in_progress → pending_confirmation → completed
                                                                          ↘ cancelled (by client or system)
                                                              completed → disputed (within 15 days)
```

### Payment Flow (Wompi)
```
Client accepts quote
  → wompi-signature edge function generates HMAC integrity hash
  → loadWompiScript() loads widget.js from checkout.wompi.co
  → openWompiWidget() with config (amountInCents, reference, customerData)
  → User pays → 45s timeout for stuck widgets
  → Wompi sends webhook → wompi-webhook validates X-Event-Checksum (SHA-256)
  → Updates transaction + service status
```

### Refund Flow (3 paths)
```
1. status='assigned' → Immediate Wompi void → refund_status='completed'
2. status='on_the_way' → Auto-dispute created → commission frozen → Admin resolves
3. Void API fails → refund_status='pending' → Escalate to admin review
```

### Dispute Flow
```
Client opens dispute → admin_create_dispute RPC
  → Service status → 'disputed', commission → 'on_hold', retention transaction created
  → Admin investigates (6 tabs)
  → admin_resolve_dispute_with_split(dispute_id, client%, tech%, notes, message)
  → Atomic resolution: refund client portion, deduct tech NET, adjust commission
  → Resolution types: full_client (100/0), full_tech (0/100), partial (slider 0-100)
```

### Cron Jobs (Auto-release)
```
Every 10 min:
  - on_the_way > 2hr → release service + block tech 24hr
  - assigned > 4hr → release service
  - pending_confirmation > 48hr → auto-confirm
  - Cleanup expired blocks + old rate_limit records
```

---

## Rewards / Points System (Recompensas)

### How Points Are Earned
| Source | Points | Trigger |
|--------|--------|---------|
| `service_completed` | Configurable per category (default 10) | DB trigger on service → completed |
| `rating_given` | Configurable (default 30) | DB trigger on rating INSERT |
| `energy_tip` | 15–50 per tip (8 tips, 210/cycle) | Sync trigger on tip_completions |
| `referral` | 25 pts to referrer | Trigger on referred user's first completed service |
| `bonus` | Mirrors technician bonus | Via bonus system |
| `reward_claimed` | **Negative** (deduction) | Client claims tier discount code |
| `admin_adjustment` | Any amount | Admin manual adjustment |

### Level System
| Level | Min Points | Spanish |
|-------|-----------|---------|
| Nuevo | 0 | Nuevo |
| Bronce | 50 | Bronce |
| Plata | 200 | Plata |
| Oro | 500 | Oro |

### Tier Rewards (Discount Codes)
| Tier | Completions Required | Days Required | Discount |
|------|---------------------|---------------|----------|
| 1 — Ahorro Consciente | 8 | 30 | **5%** |
| 2 — Eco Experto | 24 | 90 | **10%** |
| 3 — Maestro Energético | 40 | 120 | **15%** |

Claiming inserts into `tip_rewards` (discount code) and deducts points via `reward_claimed` ledger entry.

### DB Tables & RPCs
- `user_points_ledger` — points, source, source_id, description
- `tip_rewards` — discount codes generated on tier claim
- `get_user_points(p_user_id)` RPC → total, per-source breakdown
- Config: `platform_settings` keys: `points_per_service_type`, `points_per_rating`

### Admin (AdminRewards)
- 3 tabs: overview / codes / users
- KPIs: totalPointsIssued, totalUsersWithPoints, totalDiscountCodes, redeemedCodes
- Actions: invalidate discount codes, CSV export, uses `useAdminRealtime`

---

## Technician Bonus System (Bonos)

### Rules
- **Milestone interval:** every 5 completed services (configurable via `platform_settings.bonus_milestone_interval`)
- **Rate:** 5% (configurable via `platform_settings.bonus_milestone_rate`)
- **Base amount:** SUM of `provider_payout` from the last 5 services (not just one)
- **Bonus = base_amount × 5%**
- **Admin toggle:** `platform_settings.bonus_enabled` (bool)

### Trigger: `on_client_rating_release_earnings()`
1. Client rates → trigger fires
2. Releases pending commission → `collected`
3. Counts ALL collected/paid_out commissions for technician
4. If `count % interval == 0` → milestone hit
5. Calculates base (sum of last N services' payout)
6. Dedup: `NOT EXISTS` check + UNIQUE constraint `(technician_id, milestone_number)` + `pg_advisory_xact_lock`
7. Inserts into `technician_bonuses` (status: `credited`)
8. Sends notification: type `bonus` — "🎉 ¡Bono desbloqueado!"

### Wallet Integration
- `get_wallet_balance()` includes `bonus_total` in `available` balance
- `request_withdrawal()` includes bonuses in withdrawable amount
- `admin_resolve_dispute_with_split()` cancels bonus on 100% client refund

### DB: `technician_bonuses`
Fields: technician_id, service_id, amount, bonus_type (`milestone`), milestone_number, bonus_rate, base_amount, status (`credited`/`invalid`)

---

## Referral System (Referidos)

### Flow
1. User generates code via `get_or_create_referral_code()` → format: `NAME + 4 random digits` (e.g., CARLOS1234)
2. New user applies code during/after registration via `apply_referral_code(p_code)`
3. Referred user completes first service → trigger `handle_referral_on_service_complete()`
4. Referrer receives **12%** of service amount as commission → `referral_earnings`
5. Referrer also receives **25 points** in `user_points_ledger` (source=`referral`)
6. Referrer gets in-app notification

### Referral Wallet (Separate from Tech Wallet)
- Viewed in `/referrals/wallet` (ClientReferralWalletScreen)
- **Min withdrawal:** $50,000 COP
- **Rate limit:** 1 withdrawal/hr, max 3 pending
- **Security:** Advisory lock + RLS INSERT policy enforces `client_id = auth.uid() AND amount >= 50000`
- Real-time: subscribes to `referral_earnings` + `referral_withdrawals` + 30s polling fallback

### Validation Rules
- Can't self-refer
- Can only be referred once (UNIQUE constraint on `referred_id`)
- Code must be active and under `max_uses` limit

### DB Tables
- `referral_codes` — user_id, code (UNIQUE), is_active, uses_count, max_uses
- `referrals` — referrer_id, referred_id (UNIQUE), status (registered → service_completed → commission_paid)
- `referral_earnings` — service_amount, commission_rate (12%), commission_amount, status (pending → available → withdrawn)
- `referral_withdrawals` — amount, status (pending → completed/rejected), payment_method

### RPCs
- `get_or_create_referral_code()`, `apply_referral_code(p_code)`, `get_referral_stats()`
- Stats returns: code, total_referrals, completed, total_earned, available_balance, withdrawn, min_withdrawal=50000, commission_rate=12

---

## Subscription Plans (Suscripciones)

### Plans
| Plan | Price/mo (COP) | Quote Limit | Urgent Access | Verified Badge |
|------|---------------|-------------|---------------|----------------|
| **Gratis** | $0 | 5 quotes/mo | No | No |
| **Pro** | $29,900 | 20 quotes/mo | Yes | No |
| **Premium** | $59,900 | Unlimited (-1) | Yes | Yes + Priority |

### Quote Enforcement
- `useSubscription` hook → `canQuote`, `remainingQuotes`, `isUnlimited`
- `checkQuoteLimit()` before quote submission
- `increment_quote_usage()` RPC on successful quote
- Guarded in: SubmitQuoteModal, MarketScreen

### DB Tables
- `subscription_plans` — name, type, price, quote_limit (-1=unlimited), features (JSONB)
- `provider_subscriptions` — provider_id, plan_id, status (active/past_due/cancelled/trialing), current_period_start/end, quotes_used, auto_renew

### Payment: **TODO** — Wompi subscription integration pending (currently simulated)

### Admin (AdminSubscriptions)
- MRR calculation, subscriber count per plan, plan management

---

## Technician Verification System

### Flow
1. Tech completes VerificationScreen: selfie, cédula number, years of experience, certification PDFs
2. Tech completes IdentityVerificationScreen: cédula front photo + selfie holding cédula
3. Status → `pending_review` → appears in AdminVerificationQueue
4. Admin reviews documents (signed URLs from private storage) → approve or reject (with mandatory reason)
5. Approved: `is_provider_verified = true` → verified badge + shown in listings
6. Rejected: tech can resubmit with corrections

### Documents Required (configurable)
- professional_photo ✓, cédula ✓, selfie_with_cedula ✓, certifications (optional), min_years_experience: 0

### Storage
- Private bucket `private_documents`, path: `{userId}/{type}_{timestamp}.{ext}`, max 5MB, types: JPEG/PNG/PDF
- Signed URLs for admin viewing

### Technician Status Flow
```
inactive → pending_review → active (approved) or blocked (rejected, with rejection_reason)
```

---

## Energy Tips (Gamified Tips)

### 8 Tips (per cycle, 210 pts total)
| # | Tip | Points | Difficulty |
|---|-----|--------|------------|
| 1 | Mantén limpios los filtros | 25 | Fácil |
| 2 | Limpia los serpentines | 30 | Media |
| 3 | Corre cortinas en la tarde | 20 | Fácil |
| 4 | Mantén temperatura 22-24°C | 20 | Fácil |
| 5 | Sella las fugas de aire | 30 | Media |
| 6 | Usa modo noche/eco | 20 | Fácil |
| 7 | Evita prender/apagar constantemente | 15 | Fácil |
| 8 | Mantenimiento preventivo semestral | 50 | Profesional |

### Cycle System
- Complete all 8 tips → 15-day cooldown → new cycle
- Tier unlocks require cumulative completions (across cycles) + days since first completion
- Sync trigger: `sync_tip_completion_to_ledger()` mirrors tip_completions ↔ user_points_ledger

### DB: `tip_completions`, `tip_rewards`, `tip_onboarding`

---

## Service Protocols & Dynamic Checklists

### System
- Admin creates protocols with steps (AdminProtocols) → linked to service types via `service_type_protocols`
- Technician sees protocol during WorkModeScreen via DynamicChecklist component
- Fallback: legacy hardcoded checklists in `src/data/checklists/` (nursing, electrical, cleaning, locksmith, mechanic, moving)

### Protocol Steps
| Field Type | Description |
|-----------|-------------|
| `boolean` | Checkbox (did/didn't do) |
| `value` | Numeric input with unit (e.g., "22 °C") |
| `photo` | Photo evidence upload |
| `multiple_choice` | Dropdown from options JSONB |
| `textarea` | Free text |
| `section_header` | Visual divider |

### 3 Stages (color-coded)
- **Pre-service** (yellow) — before starting work
- **During service** (blue) — while working
- **Post-service** (green) — after completion

### Resolution order: DB protocols → legacy hardcoded fallback

---

## Cross-Feature Connection Map

```
Service Completed
  ├─→ user_points_ledger (source='service_completed', configurable pts/category)
  ├─→ Client rates → on_client_rating_release_earnings trigger
  │     ├─→ Commission released (pending → collected)
  │     ├─→ Bonus check (every 5 services → 5% of last 5 payouts)
  │     └─→ user_points_ledger (source='rating_given', default 30 pts)
  ├─→ handle_referral_on_service_complete trigger
  │     ├─→ referral_earnings (12% commission to referrer)
  │     └─→ user_points_ledger (source='referral', 25 pts to referrer)
  └─→ Subscription: increment_quote_usage (quote counted against plan)

Energy Tips Completed
  └─→ sync_tip_completion_to_ledger → user_points_ledger (source='energy_tip')
       └─→ Tier unlock check → tip_rewards (discount code)

Rewards Claimed
  └─→ user_points_ledger (source='reward_claimed', NEGATIVE deduction)

Dispute Resolved (100% client)
  └─→ Cancels associated technician_bonus (status='invalid')
```

---

## Logger & Analytics System

### LoggerService (src/services/loggerService.ts)
- **Singleton:** `export const logger`
- **Levels:** debug, info, warn, error, fatal
- **Categories:** auth, navigation, api, action, system, performance, error, security, business, engagement
- **Modules:** 23 (auth, services, quotes, payments, chat, notifications, profile, equipment, ratings, admin, navigation, onboarding, subscriptions, reports, verification, commissions, addresses, categories, negotiation, presence, platform, media, pwa, bonus, referrals, system)
- **Batch:** Queue 500 max → flush every 15s → 50 per RPC call → AES-256-GCM encrypted
- **Offline:** localStorage fallback (2000 entries) → flush on reconnect
- **Session:** auto-create/reuse (30min TTL), heartbeat every 60s, tracks screen visits
- **Unload:** `pagehide`+`beforeunload` → beacon flush + close session

### AnalyticsTracker (src/lib/analytics.ts)
- **40+ funnel events:** auth (login/register), onboarding, service request, quotes, payment, rating, engagement
- **GTM integration:** pushes to dataLayer via `gtagEvent()`
- **Queue:** localStorage `servi-analytics-queue`, max 200 events, flush every 30s

---

## Notification System

### Three Channels
1. **In-app toast:** `addToast({ type, title, message, duration })` — max 3 visible, dedup 2s
2. **Browser notification:** `Notification.requestPermission()` → show native notification with sound
3. **Push (FCM):** Capacitor PushNotifications → `send-push-notification` edge function → all user devices

### NotificationContext
- Real-time subscription on `notifications` table (postgres_changes)
- Auto-groups messages by conversation, new_service by count
- `markAsRead()`, `markAllAsRead()`, `deleteNotification()`, `clearAll()`
- Toast behavior varies by type (dispute_resolved → modal, service_invitation → 10s toast, etc.)

### Sound
- Web Audio API sine wave (A5 frequency, 100ms envelope)

---

## Design Tokens (src/styles/design-system.css)

### Typography
```
--servitap-fs-hero: 28px    --servitap-fs-display: 24px    --servitap-fs-h1: 20px
--servitap-fs-h2: 18px      --servitap-fs-h3: 16px         --servitap-fs-h4: 15px
--servitap-fs-body: 14px    --servitap-fs-body-sm: 13px    --servitap-fs-caption: 12px
--servitap-fs-tiny: 11px    --servitap-fs-micro: 10px
Weights: --servitap-fw-regular(400) / medium(500) / semibold(600) / bold(700) / extrabold(800)
Fonts: --servitap-font-display: "Space Grotesk"; --servitap-font-body: "Inter"; --servitap-font-mono: "JetBrains Mono"
```

### Spacing (8px base)
```
0(0) / px(1) / 0.5(2) / 1(4) / 1.5(6) / 2(8) / 2.5(10) / 3(12) / 4(16) / 5(20) / 6(24) / 8(32) / 10(40) / 12(48) / 16(64)
```

### Border Radius
```
none(0) / xs(4) / sm(8) / md(12) / lg(16) / xl(20) / 2xl(24) / 3xl(32) / full(9999)
```

### Z-Index Layers
```
below(-1) / base(0) / dropdown(10) / sticky(20) / overlay(30) / modal(40) / popover(50) / toast(60) / tooltip(70) / max(100) / takeover(110)
```

### Component Sizes (WCAG 44px touch)
```
--servitap-input-height: 42px (sm:36, lg:48)    --servitap-btn-height: 42px (sm:34, lg:48)
--servitap-nav-height: 56px    --servitap-header-height: 52px    --servitap-touch-min: 44px
```

### Colors (Light)
```
brand: #2563EB → hover: #1D4ED8    accent: #FF6B35 → hover: #E85A28
bg: #EEF1F8    card: #FFFFFF    text: #0F1419    text-secondary: #64748B
success: #10B981    warning: #F59E0B    error: #EF4444    info: #3B82F6
Status: pending(#F59E0B) assigned(#3B82F6) on-the-way(#8B5CF6) in-progress(#10B981) completed(#059669) cancelled(#EF4444) disputed(#DC2626)
```

### Colors (Dark)
```
bg: #0A0D12    card: #14182460    text: #F5F7FB    border: rgba(255,255,255,0.07)
```

### Mobile-First (src/styles/mobile-first.css)
- Safe area insets: `env(safe-area-inset-top/bottom/left/right)`
- iOS input zoom fix: `--servitap-input-fs: 16px` (via `@supports (-webkit-touch-callout: none)`)
- Autofill override: transparent background + correct text color
- Dynamic viewport: `min-height: 100dvh` (mobile keyboards)

---

## Error Handling Architecture

- **React boundary:** `LoggedErrorBoundary` wraps entire app → catches crashes → shows "Algo salió mal" + reload
- **Global listeners:** `GlobalErrorListener` → `window.onerror` + `unhandledrejection` → logs to system
- **Auth errors:** `classifyAuthError()` → returns `{ message, display: 'inline'|'modal', fields[] }` → Spanish messages
- **Error sanitizer:** `sanitizeErrorForUser()` → strips PostgreSQL/RLS/JWT internals → safe Spanish message
- **Utility:** `sanitizeAdminError()` for admin-queries results

---

## Validation Utilities

### Email (src/utils/emailValidation.ts)
- RFC 5322 compliant, 100+ TLDs, no consecutive dots, domain ≤253 chars, TLD 2-13 chars

### Password (src/utils/passwordValidation.ts)
- Strength 0-4: +1 for ≥8 chars, +1 for ≥12, +1 for upper+lower, +1 for digit, +1 for special char (cap 4)
- Valid when score ≥ 2. Labels: "Muy Débil" → "Muy Fuerte". Colors: red → green

### Sanitization (src/utils/sanitize.ts)
- `sanitizeHTML(dirty)` — DOMPurify, allows: b, i, em, strong, br, p, span, ul, ol, li, a
- `stripHTML(dirty)` — removes ALL HTML
- `sanitizeInput(input)` — stripHTML + trim (before DB storage)
- `sanitizeFormData<T>(data)` — shallow sanitize all string values in object

---

## Type System

- **Auto-generated:** `src/types/supabase.ts` — via `supabase gen types typescript` → full DB schema types
- **Custom:** `src/types/index.ts` — User, Service, Quote, Notification, Dispute, Transaction, etc.
- **Role type:** `'client' | 'technician' | 'provider' | 'admin'`
- **Regenerate:** `npx supabase gen types typescript --project-id imtbgfnbbclznhtyfemf > src/types/supabase.ts`

---

## 45+ Custom Hooks Reference

### Auth & Session
`useSessionGuard` (single-session enforcement + heartbeat) · `useLogger` (set user/role on auth changes)

### UI & Interaction
`useAndroidBackButton` (hardware back) · `useEdgeSwipeBack` (iOS-like swipe) · `useKeyboardAvoid` (scroll on keyboard) · `useLongPress` (gesture) · `usePullToRefresh` (mobile gesture) · `useInteraction` (haptic+sound feedback) · `useHaptics` (vibration patterns) · `useReducedMotion` (prefers-reduced-motion) · `useNavigationDirection` (forward/back animation) · `useThemeSync` (dark/light sync to Supabase)

### Data & State
`useClientData` (aggregate client profile) · `useUserProfile` (fetch+cache profile) · `useCategories` (service categories) · `useProviderCategories` (tech category selection) · `useAddresses` (CRUD client addresses) · `useEquipmentActions` / `useEquipmentEdit` (equipment CRUD) · `useEnergyTips` (tips + cache)

### Services & Quotes
`useServiceActions` (create/update/accept/complete/dispute) · `useServiceEdit` (form state) · `useQuotes` (real-time quote list) · `useQuoteCount` (unread badge) · `useNegotiation` (offer/counter-offer) · `usePriceAdjustment` (surge pricing)

### Financial
`useWallet` (tech balance/movements/methods) · `useReferralWallet` (client referral earnings) · `useSubscription` (tech plan management)

### Communication
`useConversations` (conversation list + real-time) · `useTypingIndicator` (typing status) · `useChatViewTracking` (analytics) · `usePresence` / `useUserPresence` (online/offline status) · `useNotificationPreferences` (email/push/SMS settings)

### Platform
`useCapacitorPlugins` (splash/statusbar/keyboard) · `usePushNotifications` (FCM registration) · `usePWAInstall` (install prompt) · `useGeolocation` (GPS location) · `useLocationTracking` (background tracking, legacy) · `useAdminRealtime` (7-table admin subscription) · `useOnboarding` (welcome state) · `useProtocol` (service checklists) · `useTechnicianDashboard` (aggregate dashboard) · `useTechnicianActions` (quote/arrive/complete)

---

## Database Key Tables

| Table | Purpose |
|-------|---------|
| **Core** | |
| `profiles` | All users (role: client/technician/admin) |
| `services` | Service requests with full lifecycle status |
| `quotes` | Tech price quotes per service |
| `negotiations` | Price counter-offers |
| `service_categories` | Category definitions (slugs, icons) |
| `platform_commissions` | 20% commission tracking (pending→collected→paid_out→on_hold) |
| **Financial** | |
| `transactions` | All money movements (service_payment, withdrawal, bonus, retention, adjustment, refund) |
| `withdrawals` | Tech withdrawal requests (pending→completed\|rejected) |
| `bank_accounts` | Tech bank info (Bancolombia, Nequi, Daviplata, BBVA, Davivienda) |
| `technician_bonuses` | 5% milestone every 5 services (credited/invalid) |
| **Rewards & Referrals** | |
| `user_points_ledger` | Points from all sources (7 types), negative for claims |
| `tip_completions` | Energy tip completion tracking per user per cycle |
| `tip_rewards` | Discount codes generated on tier claim |
| `tip_onboarding` | Energy tips onboarding state |
| `referral_codes` | User referral codes (NAME+4digits, max_uses) |
| `referrals` | Referrer→referred mapping + status |
| `referral_earnings` | 12% commission per referred completed service |
| `referral_withdrawals` | Referral wallet withdrawals (min $50K COP) |
| **Subscriptions & Verification** | |
| `subscription_plans` | Plan definitions (Gratis/Pro/Premium, quote limits) |
| `provider_subscriptions` | Tech's active plan, quotes used, period dates |
| `verification_documents` | Tech identity docs (id_front, id_back, selfie, police_record) |
| **Communication** | |
| `conversations` / `messages` | Real-time chat (text, image, audio, system) |
| `notifications` | In-app notifications |
| `device_tokens` | FCM push tokens per device |
| **Protocols** | |
| `protocols` | Service protocol definitions |
| `protocol_steps` | Protocol steps (6 field types, 3 stages) |
| `service_type_protocols` | Links protocols to service types |
| **Users & Sessions** | |
| `client_profiles` / `technician_profiles` | Role-specific data |
| `admin_roles` | Admin access control (admin, super_admin, finance) |
| `user_addresses` | Client addresses with GPS |
| `user_sessions` | Active session tracking |
| `disputes` / `dispute_notes` | Disputes + admin investigation notes |
| `platform_settings` | Key-value config (bonus_enabled, commission_rate, points_per_service_type, etc.) |
| `admin_audit_logs` | Admin action audit trail |
| `system_logs` / `session_analytics` | Telemetry/logger data |
| `rate_limit_entries` | Rate limit tracking |

---

## Test Accounts (Production)

| Role | Email | Password |
|------|-------|----------|
| Client | cliente@test.com | password123 |
| Technician | tecnico1@test.com | password123 |
| Admin | admin@test.com | password123 |

**Wompi Sandbox:** Card `4111111111111111`, exp any future, CVC `123`

---

## Edge Functions (12 total)

| Function | JWT | Purpose |
|----------|-----|---------|
| wompi-webhook | OFF | Payment webhook, SHA-256 checksum validation |
| wompi-signature | ON | Generate HMAC integrity hash for Wompi widget |
| wompi-void | ON | Refund — 3 paths: instant void, auto-dispute, admin escalation |
| send-email | ON | SMTP email, 30/hr/user, anti-spam headers, nodemailer |
| send-push-notification | ON | FCM push to all user devices |
| pre-register | ON | Pre-create auth user for OTP flow (5/15min IP, 3/hr email) |
| create-admin-account | ON | super_admin only, creates auth + admin_profiles |
| ai-assistant | ON | Groq Llama 3.3 70B, READ-ONLY, 30 req/hr, role-specific prompts |
| auto-release-cron | OFF | Every 10min: release stale services, auto-confirm, cleanup |
| expire-quotes-cron | OFF | Expire old quotes + notify providers |
| tc | OFF | Encrypted telemetry collector, AES-GCM → sys_controllers_aud() |
| repair-admin-login | — | Empty (not implemented) |

---

## Key Conventions

- **Language:** UI text in Spanish (Colombian). Code in English. No i18n library — text is hardcoded.
- **State:** React Context + custom hooks. NO Redux.
- **Styling:** CSS Modules + `--servitap-*` tokens. Mobile-first (375px base). Dark/light via ThemeContext.
- **Services:** Wrap with `withServiceLogging()`. Throw supabase errors.
- **RPCs:** `SECURITY DEFINER` + `SET search_path = public` + `auth.uid()` check.
- **Components:** Lazy-loaded in App.tsx. Guarded with `RequireAuth` + `allowedRoles`.
- **Icons:** Lucide React (import individually, never the entire package).
- **Animations:** Framer Motion inline (spring: damping 25, stiffness 300).
- **Haptics:** `haptics.trigger('success')` — 9 patterns available. User can disable.
- **Errors:** Use `classifyAuthError()` for auth, `sanitizeErrorForUser()` for general.
- **Toasts:** `addToast({ type, title, message })` — max 3, dedup 2s, auto-dismiss.
- **Logging:** `logger.info('category', 'module', 'action', 'message', metadata)`.
- **Analytics:** `analytics.track('funnel:step', { meta })`.
- **Rate limiting:** `checkRateLimit('action')` server-side, `checkClientRateLimit` pre-auth.
- **Files:** `compressImage()` + `uploadImage()` to `chat-media` bucket, max 20MB, rate limited 20/hr.

---

## Conventions

- **Language:** All UI text in Spanish
- **Currency:** COP, formatted with $ and thousands separator
- **Commission:** 20% platform, 80% technician
- **Minimum withdrawal:** $10,000 COP (tech), $50,000 COP (referral)
- **Rate limiting:** Client-side + server-side (RPC-based)
- **Real-time:** Supabase channels for chat, wallet updates, notifications
- **Security:** RLS on all tables, SECURITY DEFINER RPCs, pg_advisory_lock for concurrency
- **Theming:** Light/dark mode via CSS variables in design-system.css
- **Mobile-first:** All components designed for 375px+ width
