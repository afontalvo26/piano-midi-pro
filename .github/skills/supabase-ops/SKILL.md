---
name: supabase-ops
description: 'Supabase operations for ServiTap: edge functions, migrations, RPCs, real-time, database, RLS, Deno. USE WHEN: creating edge functions, writing migrations, debugging RPCs, adding real-time subscriptions, RLS policies, database queries, Wompi payment integration, cron jobs, push notifications, email, storage buckets. Triggers: supabase, edge function, migration, RPC, real-time, realtime, database, RLS, policy, Deno, wompi, payment, webhook, cron, push notification, email, FCM, storage, bucket.'
---

# Supabase Operations — ServiTap Platform

## Project Info

| Key | Value |
|-----|-------|
| Project ID | `imtbgfnbbclznhtyfemf` |
| Production URL | `https://imtbgfnbbclznhtyfemf.supabase.co` |
| Config | `supabase/config.toml` |
| Client Init | `src/lib/supabase.ts` |
| Migrations | `supabase/migrations/` (150+ files) |
| Edge Functions | `supabase/functions/` (12 functions) |
| Type Gen | `npx supabase gen types typescript --project-id imtbgfnbbclznhtyfemf > src/types/supabase.ts` |

---

## Edge Functions Reference

### Payment — Wompi Integration

| Function | JWT | Purpose |
|----------|-----|---------|
| `wompi-webhook` | **OFF** | Receives payment events, validates X-Event-Checksum (SHA-256) |
| `wompi-signature` | ON | Generates cryptographic integrity signature for payment requests |
| `wompi-void` | ON | Processes refunds/voids — 3 paths: instant, dispute, admin_review |

**Wompi Env Vars:** `WOMPI_EVENTS_KEY`, `WOMPI_PRIVATE_KEY`
**Sandbox card:** `4111111111111111`, exp `12/28`, CVC `123`
**Widget timeout:** 45s. Events: `wompi-payment-success`, `wompi-payment-error`

### Communication

| Function | JWT | Purpose |
|----------|-----|---------|
| `send-email` | ON | SMTP email delivery. Rate: 30/hr/user. Anti-spam headers. Templates in `public/email-templates/` |
| `send-push-notification` | ON | FCM push to all user devices via `device_tokens` table |

**Email Templates:** `public/email-templates/` contains HTML templates for: welcome, OTP verification, password reset, service notifications, payment confirmations, dispute updates.

**Env Vars:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SENDER_NAME`, `FIREBASE_SERVICE_ACCOUNT_JSON`

### Scheduled (Cron)

| Function | JWT | Auth | Purpose |
|----------|-----|------|---------|
| `auto-release-cron` | OFF | `CRON_SECRET` | Every 10min: release stale services, auto-confirm pending, cleanup |
| `expire-quotes-cron` | OFF | `CRON_SECRET` | Expire old quotes, notify providers |

**Stale rules:** `on_the_way` 2+ hours → released. `assigned` 4+ hours → released. `pending_confirmation` 48+ hours → auto-confirmed.

### Auth & Admin

| Function | JWT | Purpose |
|----------|-----|---------|
| `pre-register` | ON | Pre-create user for OTP flow (5/15min per IP, 3/hr per email) |
| `create-admin-account` | ON | super_admin only — creates admin auth + profile |

### AI & Telemetry

| Function | JWT | Purpose |
|----------|-----|---------|
| `ai-assistant` | ON | Groq Llama 3.3 70B. READ-ONLY. 30 req/hr. Role-specific prompts |
| `tc` | **OFF** | Encrypted telemetry collector. AES-GCM → `sys_controllers_aud()` RPC |

---

## Creating a New Edge Function

```typescript
// supabase/functions/my-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) throw new Error('Unauthorized');

    const body = await req.json();
    // --- Business logic here ---

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**For webhook/cron (no JWT):**
```typescript
const cronSecret = Deno.env.get('CRON_SECRET');
const authHeader = req.headers.get('Authorization');
if (authHeader !== `Bearer ${cronSecret}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

**Register:** `supabase/config.toml` → `[functions.my-function] verify_jwt = false` for webhooks/crons
**Deploy:** `supabase functions deploy my-function`

---

## Migration Patterns

### File naming: `supabase/migrations/YYYYMMDD[letter]_description.sql`

Examples: `20260322a_add_feature.sql`, `20260322b_fix_constraint.sql`

### Create Table + RLS

```sql
CREATE TABLE IF NOT EXISTS public.my_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'pending', 'completed', 'cancelled')),
    amount NUMERIC(12,2) DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own" ON public.my_table FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own" ON public.my_table FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role bypass" ON public.my_table FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admins read all" ON public.my_table FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()));
```

### Create RPC (SECURITY DEFINER)

```sql
CREATE OR REPLACE FUNCTION public.my_rpc(p_param1 UUID, p_param2 TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (SELECT 1 FROM my_table WHERE id = p_param1 AND user_id = v_user_id)
    THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_param1::text));
    UPDATE my_table SET status = 'completed', updated_at = now() WHERE id = p_param1;

    RETURN jsonb_build_object('success', true, 'id', p_param1);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

**Conventions:** Always `SECURITY DEFINER` + `SET search_path = public`. Always check `auth.uid()`. Prefix params `p_`, locals `v_`. Use `pg_advisory_xact_lock()` for financial ops. Return JSONB with `success` boolean.

---

## Rate Limiting System

### RPC: `check_rate_limit`

```sql
-- Called from client: supabase.rpc('check_rate_limit', { p_action: 'service_create' })
-- Returns: { allowed: boolean, remaining: number, reset_at: timestamptz, message?: string }
```

### 6 Rate Limit Policies

| Action | Max | Window | Scope |
|--------|-----|--------|-------|
| `login_attempt` | 5 | 15 min | Per user email |
| `otp_request` | 3 | 10 min | Per email |
| `service_create` | 5 | 60 min | Per user |
| `quote_submit` | 10 | 60 min | Per technician |
| `file_upload` | 20 | 60 min | Per user |
| `password_reset` | 3 | 30 min | Per email |

### Dual-Layer Architecture

```
Client Layer (pre-auth):  checkClientRateLimit() → localStorage timestamps
Server Layer (auth):       checkRateLimit() → RPC → rate_limit_entries table
```

The client layer provides immediate feedback. The server layer is authoritative. Both must agree to allow the action.

---

## Storage Buckets

### `chat-media` Bucket

```
Path pattern: chat-media/{type}/{conversationId}/{messageId}_{variant}.{ext}
Variants: _original, _thumb
Types: service, dispute, chat

Example: chat-media/chat/conv-123/msg-456_original.jpg
         chat-media/chat/conv-123/msg-456_thumb.webp
```

**Upload from frontend:**
```typescript
const { data, error } = await supabase.storage
  .from('chat-media')
  .upload(path, file, { contentType: file.type, upsert: false });
const publicUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
```

**Limits:** Max 20MB per file. Rate: 20 uploads/hr/user. Accepted: JPEG, PNG, WebP, GIF.
**Thumbnails:** Auto-generated WebP 200x200 via `compressImage()` in chatMediaService.

### `avatars` Bucket
- Profile photos uploaded during registration or profile edit
- Path: `avatars/{userId}.{ext}`

---

## Key RPCs (45+)

### Financial
- `get_wallet_balance(p_provider_id)` → available, earned, withdrawn, pending, retained, bonus_total
- `get_technician_earnings(p_provider_id)` → today/week/month, trend[7], bonus stats
- `request_withdrawal(p_amount, p_payment_method, p_notes)` → validates min $10K, max 3 pending
- `admin_approve_withdrawal(p_withdrawal_id, p_admin_notes)` → marks paid_out, creates audit
- `admin_reject_withdrawal(p_withdrawal_id, p_reason)` → restores available balance

### Service Lifecycle
- `accept_quote_transaction(quote_id, client_id, service_id, price, discount)` → atomic accept
- `validate_quote_price(service_id, quoted_price)` → price range validation
- `validate_negotiation_price(quote_id, proposed_price)` → counter-offer validation
- `accept_negotiation_transaction(quote_id, technician_id, price)` → atomic negotiation accept
- `cancel_assigned_service(service_id, reason)` → safe cancellation with notifications
- `confirm_service_completion(service_id)` → completes + triggers commission release
- `is_provider_blocked(provider_id, client_id)` → blocking check
- `auto_release_stale_services()` → cron cleanup
- `auto_confirm_pending_services()` → 48hr auto-confirm
- `expire_old_quotes()` → cron expiration

### Rewards & Points
- `get_user_points(p_user_id)` → { total, service_points, rating_points, tip_points, referral_points, bonus_points, redeemed_points }
- DB trigger `notify_client_on_completion()` → awards pts on service completed (reads `platform_settings.points_per_service_type`, default 10)
- DB trigger `award_rating_points()` → awards pts on rating INSERT (reads `platform_settings.points_per_rating`, default 30)

### Bonuses
- DB trigger `on_client_rating_release_earnings()` → releases commission + checks milestone (every 5 services → 5% of last 5 payouts)
- Config via `platform_settings`: `bonus_enabled`, `bonus_milestone_interval` (5), `bonus_milestone_rate` (5.0%)
- Dedup: `pg_advisory_xact_lock` + UNIQUE `(technician_id, milestone_number) WHERE status <> 'invalid'`

### Referrals
- `get_or_create_referral_code()` → NAME+4digits format
- `apply_referral_code(p_code)` → validates (no self-refer, single use per user, max_uses check)
- `get_referral_stats()` → code, total_referrals, completed, total_earned, available_balance, withdrawn, min_withdrawal=50000, commission_rate=12
- `request_referral_withdrawal(p_amount, p_payment_method)` → min $50K COP, advisory lock, max 3 pending
- DB trigger `handle_referral_on_service_complete()` → 12% commission + 25 pts to referrer
- DB trigger `award_referral_points_on_service_complete()` → user_points_ledger source='referral'

### Subscriptions
- `increment_quote_usage()` → joins provider_subscriptions + subscription_plans, increments quotes_used
- `checkQuoteLimit()` → validates canQuote before submission
- Plans: Gratis (5 quotes), Pro (20 quotes, $29,900/mo), Premium (unlimited, $59,900/mo)

### Rate Limiting & Sessions
- `check_rate_limit(p_action)` → returns { allowed, remaining, reset_at, message }
- `register_user_session(p_device_id, p_user_agent, p_ip)` → creates/updates session + conflict detection
- `validate_user_session(p_session_id)` → heartbeat (every 30s) to keep session alive
- `upsert_session(user_id, device_id, user_agent, ip)` → legacy session tracking

### Chat & Notifications
- `mark_conversation_read(conversation_id)` → read receipts
- `mark_messages_read_bulk(message_ids)` → batch read
- `create_notifications_bypass_rls(notification_records[])` → system notifications (service role)
- `notify_technicians_new_service_aggregated(service_id)` → broadcast to area technicians
- `notify_message_received_aggregated(message_id, sender_id, conversation_id)` → chat push

### Telemetry & Analytics
- `sys_controllers_aud(logs)` → batch telemetry ingestion (encrypted AES-GCM payloads)
- `track_screen_visit(session_id, screen, url, duration)` → screen analytics

---

## Real-Time Subscription Patterns

```typescript
useEffect(() => {
  if (!userId) return;
  const channel = supabase
    .channel(`my-feature-${userId}`)
    .on('postgres_changes', {
      event: '*',           // or 'INSERT' | 'UPDATE' | 'DELETE'
      schema: 'public',
      table: 'my_table',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      refetch(); // payload.new, payload.old, payload.eventType
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [userId]);
```

### Active Channels

| Channel | Table(s) | Filter | Used In |
|---------|----------|--------|---------|
| `negotiation:{id}` | negotiations | conversation_id | ChatScreen |
| `typing:{id}` | — (broadcast) | — | typingIndicatorService |
| `quotes-{id}` | quotes | service_id (INSERT) | quoteService |
| `presence:{id}` | user_status | user_id | presenceService |
| `notifications_provider:{id}` | notifications | user_id | NotificationContext |
| `admin-dashboard-global` | services, withdrawals, disputes, commissions, admin_logs | — | useAdminRealtime |
| `user_addresses_changes` | user_addresses | user_id | useAddresses |

---

## Calling Edge Functions

```typescript
// Authenticated (JWT auto-attached)
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { param1: 'value' },
});

// Webhook/public (no JWT)
const res = await fetch(`${SUPABASE_URL}/functions/v1/my-function`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

---

## Type Generation

```bash
# Regenerate auto-generated types after any migration
npx supabase gen types typescript --project-id imtbgfnbbclznhtyfemf > src/types/supabase.ts

# Types are split:
# - src/types/supabase.ts → auto-generated Database interface (tables, views, RPCs, enums)
# - src/types/index.ts    → custom app types (User, Service, Quote, etc.)
```

Access pattern: `Database['public']['Tables']['services']['Row']`

---

## Environment Variables

### Client-Side (Vite)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_WOMPI_PUBLIC_KEY`

### Edge Function Standard
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Integration Secrets
- `WOMPI_EVENTS_KEY`, `WOMPI_PRIVATE_KEY` — Payment gateway
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Push notifications (FCM)
- `SMTP_HOST/PORT/USER/PASS/FROM/SENDER_NAME` — Email
- `GROQ_API_KEY` — AI assistant
- `CRON_SECRET` — Scheduled functions auth
- `LOG_KEY` — Telemetry encryption (AES-256-GCM)

### Secret Fallback
```typescript
const secret = Deno.env.get('MY_SECRET') ??
  (await supabase.from('app_secrets').select('value').eq('key', 'MY_SECRET').single())?.data?.value;
```

---

## Key Database Tables

### Core
- `services` — Service lifecycle (pending→assigned→on_the_way→in_progress→pending_confirmation→completed)
- `quotes` — Technician price quotes per service
- `negotiations` — Price counter-offers within a quote
- `platform_commissions` — 20% platform fee tracking (pending→collected→paid_out→on_hold)
- `service_categories` — Category definitions with slugs and icons

### Financial
- `transactions` — All money movements (service_payment, withdrawal, bonus, retention, adjustment, refund)
- `withdrawals` — Technician withdrawal requests (pending→completed|rejected)
- `bank_accounts` — Technician bank info (Bancolombia, Nequi, Daviplata, BBVA, Davivienda)
- `technician_bonuses` — 5% milestone every 5 services (credited/invalid)

### Rewards & Points
- `user_points_ledger` — Points from 7 sources (service_completed, rating_given, energy_tip, referral, bonus, reward_claimed, admin_adjustment)
- `tip_completions` — Energy tip completions per user per cycle
- `tip_rewards` — Discount codes on tier claim (5%/10%/15%)
- `tip_onboarding` — Energy tips onboarding state

### Referrals
- `referral_codes` — User codes (NAME+4digits, max_uses)
- `referrals` — Referrer→referred mapping + status (registered→service_completed→commission_paid)
- `referral_earnings` — 12% commission per referred completed service
- `referral_withdrawals` — Referral wallet withdrawals (min $50K COP)

### Subscriptions & Verification
- `subscription_plans` — Plan definitions (Gratis $0/Pro $29,900/Premium $59,900)
- `provider_subscriptions` — Tech's active plan, quotes_used, period, auto_renew
- `verification_documents` — Tech identity docs (id_front, id_back, selfie, police_record)

### Users
- `profiles` — All users (role: client/technician/admin)
- `client_profiles`, `technician_profiles` — Role-specific data (status, cedula, experience, certifications)
- `admin_roles` — Admin access control (admin, super_admin, finance)
- `user_addresses` — Client addresses with GPS coordinates
- `device_tokens` — FCM push notification tokens (multiple per user)
- `user_sessions` — Active session tracking

### Communication
- `conversations` — Chat threads between users
- `messages` — Chat messages (text, image, audio, system)
- `notifications` — In-app notifications

### Protocols
- `protocols` — Service protocol definitions
- `protocol_steps` — Steps (6 field types, 3 stages)
- `service_type_protocols` — Links protocols to service types

### System
- `rate_limit_entries` — Rate limit tracking
- `app_logs` / `system_logs` — Logs ingested via `sys_controllers_aud` RPC
- `session_analytics` — Screen visits + telemetry
- `platform_settings` — Key-value config (bonus_enabled, commission_rate, points_per_service_type, etc.)
- `admin_audit_logs` — Admin action audit trail
- `disputes` / `dispute_notes` / `dispute_evidence` — Dispute lifecycle
- `referral_codes` — User referral codes (12% client commission)
- `referral_wallet` — Client referral earnings

### Config
- `platform_settings` — Key-value config (bonus_enabled, commission_rate, etc.)
- `app_secrets` — Fallback secret storage
- `admin_audit_logs` — Admin action audit trail

---

## Checklist: New Backend Feature

- [ ] Migration file with proper naming (`YYYYMMDD_description.sql`)
- [ ] RLS enabled on new tables
- [ ] RLS policies for each role (user, admin, service_role)
- [ ] SECURITY DEFINER on RPCs with `SET search_path = public`
- [ ] `auth.uid()` validation in RPCs
- [ ] Advisory locks for financial operations
- [ ] Edge function registered in `config.toml` if non-default JWT
- [ ] Environment variables documented
- [ ] Real-time enabled if live updates needed
- [ ] Notifications triggered for relevant events
- [ ] Error handling returns JSONB with success boolean
