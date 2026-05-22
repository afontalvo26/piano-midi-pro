---
name: feature-development
description: 'Guide for building new features in ServiTap from idea to implementation. USE WHEN: adding new features, creating new screens, new components, new services, new hooks, implementing a new idea, building UI, adding business logic, refactoring, understanding code patterns, creating migrations. Triggers: new feature, add, create, implement, build, screen, component, service, hook, idea, architecture, logic, design, pattern, refactor, how to build.'
---

# Feature Development — From Idea to Production

## Decision Flow: Where Does My Feature Go?

```
New screen/page?         → src/components/{role}/NewScreen.tsx + route in App.tsx
Reusable UI?             → src/components/shared/MyComponent.tsx
Talks to Supabase?       → src/services/myService.ts (wrap with withServiceLogging)
Manages state?           → src/hooks/useMyHook.ts
Server-side logic?       → supabase/functions/my-function/index.ts (Deno)
New tables/RPCs?         → supabase/migrations/YYYYMMDD_description.sql
Admin controls?          → src/components/admin/AdminMyFeature.tsx
New types?               → src/types/index.ts (custom) or regenerate supabase.ts
```

---

## Step-by-Step: Adding a New Feature

### 1. Database Layer (if needed)

```sql
-- supabase/migrations/20260327_my_feature.sql
CREATE TABLE IF NOT EXISTS public.my_feature (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.my_feature ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own" ON public.my_feature FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role bypass" ON public.my_feature FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admins read all" ON public.my_feature FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid()));

-- RPC for complex logic
CREATE OR REPLACE FUNCTION public.my_feature_action(p_param TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext(p_param));  -- prevent double-spend
    -- Business logic here
    RETURN jsonb_build_object('success', true);
END;
$$;
```

**Then regenerate types:** `npx supabase gen types typescript --project-id imtbgfnbbclznhtyfemf > src/types/supabase.ts`

### 2. Service Layer

```typescript
// src/services/myFeatureService.ts
import { supabase } from '@/lib/supabase';
import { withServiceLogging } from '@/utils/serviceLogger';

const _myFeatureService = {
  async getItems(userId: string) {
    const { data, error } = await supabase
      .from('my_feature').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async createItem(item: Omit<MyFeature, 'id' | 'created_at'>) {
    const { data, error } = await supabase.from('my_feature').insert(item).select().single();
    if (error) throw error;
    return data;
  },
  async callRpc(param: string) {
    const { data, error } = await supabase.rpc('my_feature_action', { p_param: param });
    if (error) throw error;
    return data;
  }
};
export const myFeatureService = withServiceLogging(_myFeatureService);
```

### 3. Custom Hook

```typescript
// src/hooks/useMyFeature.ts
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { myFeatureService } from '@/services/myFeatureService';
import { addToast } from '@/lib/notifications';
import { logger } from '@/services/loggerService';
import { supabase } from '@/lib/supabase';

export const useMyFeature = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<MyFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const data = await myFeatureService.getItems(user.id);
      setItems(data);
    } catch (err) {
      logger.error('api', 'services', 'fetch_my_feature', 'Failed to fetch', { error: err });
      addToast({ type: 'error', title: 'Error', message: 'No se pudieron cargar los datos' });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`my-feature-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'my_feature',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchItems]);

  return { items, loading, refresh: fetchItems };
};
```

### 4. Component (Screen)

```typescript
// src/components/client/MyFeatureScreen.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMyFeature } from '@/hooks/useMyFeature';
import { haptics } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';
import styles from './MyFeatureScreen.module.css';

const MyFeatureScreen: React.FC = () => {
  const navigate = useNavigate();
  const { items, loading, refresh } = useMyFeature();

  const handleAction = () => {
    haptics.trigger('light');
    analytics.track('engage:quick_action', { screen: 'my_feature' });
    // action logic
  };

  if (loading) return <FullScreenLoader />;

  return (
    <motion.div className={styles.container}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className={styles.header}>
        <button onClick={() => navigate(-1)}><ArrowLeft size={24} /></button>
        <h1>Mi Feature</h1>
      </header>
      <div className={styles.content}>
        {items.length === 0 ? (
          <div className={styles.empty}>No hay datos aún</div>
        ) : items.map(item => (
          <div key={item.id} className={styles.card}>{/* Card content */}</div>
        ))}
      </div>
    </motion.div>
  );
};
export default MyFeatureScreen;
```

### 5. CSS Module

```css
/* src/components/client/MyFeatureScreen.module.css */
.container {
  min-height: 100vh;
  min-height: 100dvh;  /* Dynamic viewport for mobile keyboards */
  background: var(--servitap-color-bg);
  color: var(--servitap-color-text);
  padding-bottom: env(safe-area-inset-bottom);
}
.header {
  display: flex;
  align-items: center;
  gap: var(--servitap-space-3);
  padding: var(--servitap-space-4);
  font-size: var(--servitap-fs-h1);
  font-family: var(--servitap-font-display);
  font-weight: var(--servitap-fw-bold);
}
.card {
  background: var(--servitap-color-card);
  border-radius: var(--servitap-radius-lg);
  padding: var(--servitap-space-4);
  margin: var(--servitap-space-2) var(--servitap-space-4);
  border: 1px solid var(--servitap-color-border);
}
.empty {
  text-align: center;
  padding: var(--servitap-space-10);
  color: var(--servitap-color-text-secondary);
  font-size: var(--servitap-fs-body-sm);
}
```

### 6. Route Registration (App.tsx)

```typescript
const MyFeatureScreen = lazy(() => import('./components/client/MyFeatureScreen'));

<Route path="/my-feature" element={
  <RequireAuth allowedRoles={['client']}>
    <Suspense fallback={<FullScreenLoader />}><MyFeatureScreen /></Suspense>
  </RequireAuth>
} />
```

---

## Pattern Library

### Form Validation

```typescript
import { validateEmail } from '@/utils/emailValidation';
import { calculatePasswordStrength, checkPasswordRequirements } from '@/utils/passwordValidation';
import { sanitizeInput, sanitizeFormData } from '@/utils/sanitize';

// Email: RFC 5322, 100+ TLDs, domain ≤253 chars
const { valid, error } = validateEmail(email);

// Password: score 0-4, valid when ≥ 2
const strength = calculatePasswordStrength(password);
// strength.score, strength.label ("Muy Débil"→"Muy Fuerte"), strength.color, strength.isValid

// Sanitize before DB storage
const clean = sanitizeInput(userInput);          // stripHTML + trim
const cleanForm = sanitizeFormData({ name, bio }); // shallow sanitize all strings

// Phone validation (Colombian mobile: 10 digits, 300-330 prefix)
const isValidPhone = /^3[0-3]\d{8}$/.test(phone);
```

### Error Handling

```typescript
import { classifyAuthError } from '@/lib/authErrors';
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

// Auth errors → inline vs modal
try {
  await login(email, password);
} catch (err) {
  const classified = classifyAuthError(err);
  if (classified.display === 'inline') setFieldError(classified.message);
  else showModal(classified.message);
}

// General errors → safe Spanish message
catch (err) {
  const safeMsg = sanitizeErrorForUser(err, 'No se pudo completar la acción');
  addToast({ type: 'error', title: 'Error', message: safeMsg });
}

// ErrorBoundary: LoggedErrorBoundary wraps entire app (App.tsx)
// GlobalErrorListener: catches window.onerror + unhandledrejection
```

### Logger Integration

```typescript
import { logger } from '@/services/loggerService';

// Standard log
logger.info('action', 'services', 'service_created', 'Service created successfully', {
  serviceId: service.id, categorySlug: slug
});

// Error log
logger.error('api', 'payments', 'wompi_failed', 'Payment processing failed', {
  error: err.message, serviceId
});

// Performance timing
const elapsed = logger.startTimer();
await heavyOperation();
logger.info('performance', 'services', 'heavy_op', `Completed in ${elapsed()}ms`);

// Business event
logger.business('quotes', 'quote_accepted', 'Quote accepted by client', {
  quoteId, price, technicianId
});
```

### Analytics Funnel

```typescript
import { analytics } from '@/lib/analytics';

analytics.track('service:select_category', { category: 'plomeria' });
analytics.track('service:submit_request', { serviceId: id, urgency: 'high' });
analytics.track('payment:success', { amount: 150000, reference: ref });
analytics.track('engage:pwa_install');
```

### Haptics

```typescript
import { haptics } from '@/lib/haptics';

haptics.trigger('light');       // Button tap
haptics.trigger('success');     // Operation completed
haptics.trigger('error');       // Validation failure
haptics.trigger('warning');     // Destructive action confirmation
haptics.trigger('selection');   // Picker/tab change
// 9 patterns: light, medium, heavy, swipe, success, error, warning, selection, notification
// User preference: haptics.isEnabled() / haptics.setEnabled(bool)
```

### Rate Limiting

```typescript
import { checkRateLimit, checkClientRateLimit } from '@/utils/rateLimit';

// Server-side (authenticated user)
const result = await checkRateLimit('service_create');
if (!result.allowed) {
  addToast({ type: 'warning', title: 'Límite', message: result.message });
  return;
}

// Client-side (pre-auth, e.g., login)
const result = checkClientRateLimit('login_attempt');
if (!result.allowed) { setError(result.message); return; }

// Policies: login(5/15m), otp(3/10m), service(5/60m), quote(10/60m), upload(20/60m), pw_reset(3/30m)
```

### Notification Sending

```typescript
import { addToast } from '@/lib/notifications';
import { notificationService } from '@/services/notificationService';

// Toast (in-app)
addToast({ type: 'success', title: '¡Listo!', message: 'Servicio creado exitosamente' });
addToast({ type: 'error', title: 'Error', message: 'No se pudo completar la acción' });
addToast({ type: 'warning', title: 'Atención', message: 'Acción irreversible', duration: 8000 });
// Max 3 visible, dedup 2s, auto-dismiss default 5s

// System notification (in-app + push + email)
await notificationService.notifyServiceCompleted(serviceId, clientId, techName);
// Other: notifyTechnicianEnRoute, notifyTechnicianArrived, notifyRatingReceived, notifyCancellation...
```

### File Upload (Images & Audio)

```typescript
import { uploadImage, compressImage, uploadAudio, validateImageFile } from '@/services/chatMediaService';

// Validate first
const { valid, error } = validateImageFile(file);
if (!valid) { addToast({ type: 'error', title: 'Error', message: error }); return; }

// Upload (auto-compresses if > 1MB, generates thumbnail)
const result = await uploadImage(file, 'service', conversationId, messageId);
// result: { originalUrl, thumbnailUrl, mediaType, mediaSize }

// Audio
const audioUrl = await uploadAudio(blob, conversationId, messageId);

// Bucket: chat-media, paths: chat-media/{type}/{conversationId}/{messageId}_original.{ext}
// Rate limit: 20/hr, max file: 20MB, types: JPEG, PNG, WebP, GIF
```

### Wompi Payment Widget

```typescript
import { loadWompiScript, openWompiWidget, getIntegritySignature, formatCurrency, convertToCents } from '@/lib/wompi';

// 1. Get integrity signature from server
const signature = await getIntegritySignature(reference, convertToCents(amount));

// 2. Load + open widget
await loadWompiScript();
await openWompiWidget({
  currency: 'COP',
  amountInCents: convertToCents(amount),
  reference,
  publicKey: import.meta.env.VITE_WOMPI_PUBLIC_KEY,
  signatureIntegrity: signature,
  customerData: { email, fullName, phoneNumber, phoneNumberPrefix: '+57', legalId, legalIdType: 'CC' },
});
// Widget timeout: 45s. Events: 'wompi-payment-success', 'wompi-payment-error'

// Format: formatCurrency(150000) → "$150.000"
```

### Geolocation & Maps

```typescript
import { haversineDistance, formatDistance, calculateBearing, isPlausibleMovement } from '@/utils/geo';

const km = haversineDistance(lat1, lng1, lat2, lng2);  // km, 2 decimals
const display = formatDistance(km);                     // "800 m" or "2.3 km"
const bearing = calculateBearing(lat1, lng1, lat2, lng2); // 0-360° compass
const valid = isPlausibleMovement(prev, next, 100);    // GPS sanity check (max 100km jump)

// Maps: Leaflet + React-Leaflet + OSRM routing + Nominatim geocoding
// Tiles: CartoDB (dark + light) via basemaps.cartocdn.com
```

---

## Checklist: Before Shipping

- [ ] RLS enabled on new tables
- [ ] SECURITY DEFINER + `SET search_path = public` on RPCs
- [ ] `auth.uid()` validation in RPCs
- [ ] Advisory locks for financial operations (`pg_advisory_xact_lock`)
- [ ] Error handling: service (throw) → hook (catch + toast) → component (loading/empty)
- [ ] Auth errors classified via `classifyAuthError()` 
- [ ] General errors sanitized via `sanitizeErrorForUser()`
- [ ] User input sanitized via `sanitizeInput()` before DB storage
- [ ] Rate limiting where needed (`checkRateLimit`/`checkClientRateLimit`)
- [ ] Logger calls for important actions (`logger.info/error/business`)
- [ ] Analytics tracking for funnel events (`analytics.track`)
- [ ] Haptics on user interactions (`haptics.trigger`)
- [ ] Toast messages in Spanish (Colombian)
- [ ] Mobile-responsive (375px base, `100dvh`, safe area padding)
- [ ] Dark mode works (uses `--servitap-*` CSS variables only)
- [ ] Loading states handled (FullScreenLoader or skeleton)
- [ ] Empty states handled (descriptive message in Spanish)
- [ ] Real-time updates if applicable (Supabase channel + cleanup)
- [ ] Lazy-loaded in App.tsx with `React.lazy()` + `Suspense`
- [ ] Route guarded with `RequireAuth` + `allowedRoles`
- [ ] Types regenerated if new tables (`supabase gen types`)
- [ ] Lucide icons imported individually
- [ ] Framer Motion for page transitions + spring animations
