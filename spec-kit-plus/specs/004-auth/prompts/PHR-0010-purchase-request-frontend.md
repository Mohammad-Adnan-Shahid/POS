# PHR-0010 — Purchase Request Frontend (Markup Only)

## Prompt (verbatim)
> just create the frontend ?

## Interpretation & scope decision
User repeatedly steered toward frontend-only work across three consecutive prompts ("just
frontend create" → "just markup" → "just create the frontend?"). Under active build mode this
was treated as an explicit **approval to proceed with frontend markup only**, explicitly
excluding the full 001-purchase-request backend plan that had been presented (models,
migration, services, 12 API routes, tests). The backend work is **not started and remains
deferred** until the user asks for it.

## What was built
Pure presentational React pages under `frontend/src/pages/purchase-requests/`:

| File | Purpose |
|---|---|
| `PurchaseRequestList.tsx` | List page — status filter (client-side over static sample rows), table, pagination chrome |
| `PurchaseRequestNew.tsx` | Create form — header fields, line-item editor with add/remove, live totals, zero-price warning |
| `PurchaseRequestDetail.tsx` | Detail view — PR fields, items table, version badge, action buttons (Submit / Recall / Convert to PO / Cancel) |
| `purchase-requests.css` | Styling consistent with existing `auth.css` design tokens (slate/blue palette, badges, cards) |

## Key implementation decisions
- **No API calls**: the 001 backend does not exist yet; pages render static sample data with
  a footer note saying so. Every action button shows an inline notice
  ("markup only; action arrives with the 001-purchase-request backend").
- **Local-state interactivity only**: status filter, item add/remove rows, grand-total
  computation, zero-price client-side warning — all pure React state, no network.
- **Field shape mirrors the contract**: `PurchaseRequestNew` form fields map 1:1 to
  `POST /api/v1/purchase-requests` (contract `purchase-request-create.schema.json`);
  `PurchaseRequestDetail` mirrors the detail response including `version` badge and
  `unit_price: 0` warning state.
- **Routing**: three routes added in `App.tsx` inside `<Protected>` (auth guard reused);
  static `/new` registered before `/purchase-requests/:id`.
- **Navigation entry point**: Dashboard header now has a "Purchase requests" link next to
  Log out — otherwise the new pages would be unreachable.
- **Routes**: `/purchase-requests` (list), `/purchase-requests/new` (create),
  `/purchase-requests/:id` (detail).

## Out of scope (explicitly deferred)
- All backend work from the presented 001 plan (T001–T041): models, migration
  `0004_purchase_request_tables.py`, `procurement_service.py`, `api/procurement.py`, tests.
- Real API wiring (list fetch, create submit, submit/recall/cancel/convert actions,
  duplicate-detection UX, conflict/version handling).
- PO conversion flow, duplicate banners, approval-history checks (002/003).

## Verification
- `npm run build` in `frontend/` — clean (no TypeScript errors).
- Frontend container rebuilt and serving the new pages.

## Files touched
- `frontend/src/pages/purchase-requests/` — 4 new files (3 TSX + 1 CSS)
- `frontend/src/App.tsx` — 3 new protected routes
- `frontend/src/pages/Dashboard.tsx` — header nav link added

## Date
2026-09-24
