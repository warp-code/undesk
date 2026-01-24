# Supabase Deployment Guide

**Date:** 2026-01-23
**Status:** Reference

Guide for deploying the OTC database to a remote Supabase project (devnet/mainnet).

---

## Prerequisites

- Supabase CLI installed (`brew install supabase/tap/supabase`)
- Supabase account at https://supabase.com

---

## 1. Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose organization, name, database password, region
4. Wait for project to provision (~2 minutes)

---

## 2. Get Project Credentials

From **Project Settings → API**:

| Key | Usage |
|-----|-------|
| **Project URL** | `https://<ref>.supabase.co` |
| **anon (public)** | Frontend client |
| **service_role** | Indexer/Cranker (bypasses RLS) |

From **Project Settings → General**:

| Key | Usage |
|-----|-------|
| **Reference ID** | `<ref>` for CLI commands |

---

## 3. Link Local to Remote

```bash
# Login to Supabase (one-time)
supabase login

# Link this project to remote
supabase link --project-ref <ref>
```

You'll be prompted for the database password you set during project creation.

---

## 4. Push Migrations

```bash
# Push all migrations to remote
supabase db push
```

This applies:
- `20260123000000_initial_schema.sql` - Tables, indexes, realtime
- `20260123000001_rls_policies.sql` - RLS policies

---

## 5. Verify Setup

**Check in Supabase Dashboard:**

1. **Table Editor** - `deals`, `offers`, `raw_events` tables exist
2. **Database → Replication** - `deals` and `offers` in publication list (Realtime)
3. **Authentication → Policies** - RLS policies visible on each table

---

## 6. Regenerate Types (Optional)

If you want types from the remote schema:

```bash
supabase gen types typescript --project-id <ref> > packages/supabase/src/generated.ts
```

Or continue using `yarn db:types` with local (schemas should match).

---

## 7. Configure Environment Variables

### Frontend (Next.js)

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### Indexer

Create `indexer/.env`:

```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

### Cranker

Create `cranker/.env`:

```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**IMPORTANT:** Never commit `.env` files with real keys. Add to `.gitignore`.

---

## 8. Update Client Usage

The `@otc/supabase` package auto-detects environment:

```typescript
// Uses env vars if set, falls back to local defaults
import { createAnonClient, createServiceClient } from "@otc/supabase"

// Frontend
const supabase = createAnonClient()

// Indexer/Cranker
const supabase = createServiceClient()
```

No code changes needed - just set the env vars.

---

## 9. Security Checklist

Before going live:

- [ ] Database password is strong and stored securely
- [ ] `service_role` key only used server-side (indexer/cranker)
- [ ] `anon` key used for frontend (respects RLS)
- [ ] `.env` files in `.gitignore`
- [ ] RLS policies tested (try INSERT from frontend - should fail)
- [ ] Realtime working (test subscription in browser console)

---

## 10. Switching Environments

| Environment | Supabase | Solana |
|-------------|----------|--------|
| Local dev | `supabase start` (localhost) | localnet |
| Devnet | Remote project A | devnet |
| Mainnet | Remote project B | mainnet-beta |

Recommendation: Use separate Supabase projects for devnet vs mainnet.

---

## Quick Reference

```bash
# Local development
supabase start              # Start local Supabase
supabase stop               # Stop local Supabase
supabase db reset           # Reset and re-run migrations
yarn db:types               # Regenerate TypeScript types

# Remote deployment
supabase login              # Authenticate CLI
supabase link --project-ref <ref>  # Link to remote
supabase db push            # Push migrations to remote
supabase db pull            # Pull remote schema (if changed in dashboard)

# Debugging
supabase status             # Show local URLs and keys
supabase db diff            # Show schema differences
```

---

## Troubleshooting

### "Permission denied" on INSERT

RLS is working correctly. The frontend uses `anon` key which only has SELECT.
Writes must come from indexer using `service_role` key.

### Realtime not working

1. Check table is in publication: Dashboard → Database → Replication
2. Check RLS allows SELECT for anon role
3. Check browser console for WebSocket errors

### Migration failed

```bash
# Check what's different
supabase db diff

# If remote has changes not in migrations, pull them
supabase db pull --schema public
```
