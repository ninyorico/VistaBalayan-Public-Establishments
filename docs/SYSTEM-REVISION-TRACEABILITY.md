# VistaBalayan public-system revision traceability

Source checklist: `System To do..docx` supplied for this revision.

## Implemented in this revision

- **Verified ratings:** public rating UI now requires a Supabase Auth user with `email_confirmed_at` before submission. Users can sign in or create an account from the rating panel. `database-public-ratings.sql` adds `reviewer_user_id`, a verified-user uniqueness constraint, and changes the rating RPC to require `auth.uid()` and a confirmed email.
- **Explicit recommendation preferences:** visitors can select Resort/Hotel preferences and a maximum road-distance preference. Choices are stored locally only when preferences consent exists and are used as recommendation filters/boosts.
- **Recommendation transparency:** recommendation scoring continues to pass actual signals (search match, category interest, viewed-category, distance, and featured status) to the explanation endpoint. The loading state now uses the same establishment-plus-distance cache key as the request map.
- **Entrance-fee safety:** the public details view displays a fee only when `entrance_fee` and `entrance_fee_verified_at` are present; otherwise it explicitly says the fee is not verified by the Municipal Tourism Office. No fee is guessed or presented as authoritative.

## Existing behavior retained and verified by source inspection

- Search terms, category clicks, viewed establishments, route distance, and recommendation explanations are linked through the deterministic scoring context.
- The explanation endpoint receives only supplied establishment and recommendation facts and has safeguards against unsupported claims.
- Public browsing remains available without an account; only rating submission is gated.

## Required database/deployment action

`database-public-ratings.sql` is a migration artifact and must be applied to the production Supabase project before verified ratings can succeed. Applying the frontend alone is intentionally insufficient because the RPC and RLS boundary must enforce verification server-side.

The optional entrance-fee fields expected by the public UI are:

- `entrance_fee`
- `entrance_fee_currency`
- `entrance_fee_verified_at`
- `entrance_fee_verified_by`

They are nullable and are not created automatically here because the authoritative fee workflow and Municipal Tourism Office approval process must be established before adding production columns.

## Not claimed as implemented

- Municipal Tourism Office fee verification workflow and authoritative fee values.
- Final research-objective wording and manuscript changes; the approved manuscript was not supplied in the repository.
- Public listing account/establishment verification status; the existing schema does not expose an authoritative listing-verification field.
