# Custody Folio Production Release Packet Version 2

Prepared August 31, 2026

## Status

Decisions 1, 2, and 3 in this packet were approved by the product owner on August 31, 2026. Decision 4 remains unapproved.

The local implementation is verified. The goal of one hundred paid subscribers is not yet achieved because no customer acquisition activity has been authorized or performed.

The approved work may release the website and policy, apply the additive migration, activate first party measurement and the voluntary in product feedback invitation after all gates pass, and complete one synthetic production journey. It does not authorize customer contact, email, App Store changes, advertising, spending, or inspection of customer records.

## Release identity

The current local policy bundle digest is:

`sha256:9607ea4e423c39d207275b19a729b611d495c2508d4e4a092e6932f0a28f12f6`

The growth and feedback migration file digest is:

`5ead501e1b91a0a775ec6549382bb7a275e7830f323063cb35ab8cdd1a398a1d`

The function permission hardening migration file digest is:

`596fd7336158b49c4d34fd901f59ddda309aaf8b81bbe7b622186d0d54d30af6`

The current worktree contains uncommitted work and unrelated local artifacts. It must not be deployed directly. The authorized release must use a scoped commit containing only reviewed source, migration, policy, operations, and test files.

## Included product behavior

1. The website uses the approved Custody Folio positioning and keeps the brand promise Remove the emotion. Track the data.

2. All homepage signup actions point to `/records?mode=signup`.

3. First party measurement accepts only the approved event taxonomy and approved attribution codes.

4. Measurement is disabled by default through `MARKETING_ANALYTICS_ENABLED=false`.

5. Customer feedback invitations are disabled by default through `CUSTOMER_FEEDBACK_INVITE_ENABLED=false`.

6. Enabling either measurement or feedback requires a recently verified database migration date in `CUSTOMER_GROWTH_SCHEMA_VERIFIED_AT`.

7. General source reporting hides groups representing fewer than five people.

8. Customer feedback permission is limited to the first ten opted in customers and one permitted contact for each customer.

9. No feedback message is sent automatically.

10. Account deletion removes the keyed customer growth cohort before Auth deletion and removes feedback permission through the Auth cascade.

11. Both database functions use caller privileges. Elevated function execution rights are not used.

## Database change

The release depends on these additive migrations:

`supabase/migrations/20260831120000_add_growth_events_and_feedback_consents.sql`

`supabase/migrations/20260901052100_restrict_growth_function_execution.sql`

The current deployment workflow does not apply Supabase migrations automatically. The application release must not proceed until an authorized operator applies both exact migrations to the intended production project and verifies all of the following:

1. `custody_folio_growth_events` exists.

2. `custody_folio_customer_feedback_consents` exists.

3. `custody_folio_record_feedback_choice` exists.

4. Row level security is enabled and forced on both tables.

5. Public, anonymous, and authenticated roles have no direct table access.

6. The service role has the required access.

7. The growth event expiry is one hundred eighty days.

8. The feedback contact limit is exactly one.

9. The feedback cohort cap is exactly ten.

10. Both migration digests match the digests recorded in this packet.

11. Public, anonymous, and authenticated roles cannot execute either database function.

12. The service role can execute both database functions.

Only after these checks pass may the operator set `CUSTOMER_GROWTH_SCHEMA_VERIFIED_AT` to the real verification date.

## Policy prerequisite

The Privacy Policy, retention runbook, privacy rights operations, and generated policy bundle changed. Existing approval evidence does not match the new digest.

Before a production release, the exact new policy bundle must receive the required retention and legal approval evidence. The protected manifest must verify against the digest recorded in this packet.

The current privacy acceptance version is recorded in `src/lib/legal.ts` and must remain exactly consistent with the reviewed source.

## Fail closed configuration before release

These values must remain in place unless the exact corresponding decision below is approved:

1. `MARKETING_ANALYTICS_ENABLED=false`

2. `CUSTOMER_FEEDBACK_INVITE_ENABLED=false`

3. Existing signup settings remain unchanged.

4. Existing billing settings remain unchanged.

5. Existing Apple settings remain unchanged.

6. No customer email credentials or sending automation are added.

Launch pending deployment mode now refuses to run unless both new activation flags are false.

## Required local and continuous integration evidence

The release revision must pass all of the following from a clean checkout:

1. Source linting.

2. Static type checking.

3. The complete application test suite.

4. Growth scorecard tests.

5. Deployment recovery tests.

6. Production environment template verification.

7. Secret scanning.

8. Dependency security audit.

9. Browser tests required by the current validation workflow.

10. Optimized production build.

The current local evidence is 465 passing application tests, two passing scorecard tests, clean linting, clean type checking, passing deployment recovery tests, a verified production environment template, and a successful optimized build. Browser tests in continuous integration remain required for the scoped release revision.

## Authorized release order

1. Create and review a scoped release commit without unrelated local files.

2. Run the complete continuous integration validation on that exact revision.

3. Generate and verify new protected approval evidence for the exact policy bundle digest.

4. Confirm a recoverable production database backup before the migration.

5. Apply the exact additive migration to the intended Supabase production project.

6. Verify the database checks listed in this packet and record the real verification date.

7. Keep measurement disabled.

8. Set feedback invitations to true only if decision one explicitly includes customer facing activation of the in product invitation.

9. Deploy the exact validated revision through the existing rollback protected workflow.

10. Verify application health, readiness, homepage copy, Privacy Policy, sign in, and existing customer access without inspecting customer records.

11. Verify the feedback invitation only with a synthetic authorized account after decision three is approved.

12. Stop and roll back if any required check fails.

## Rollback boundary

The immediate containment actions are:

1. Set `CUSTOMER_FEEDBACK_INVITE_ENABLED=false`.

2. Set `MARKETING_ANALYTICS_ENABLED=false`.

3. Restore the previously validated application image through the existing rollback workflow.

4. Verify health, readiness, sign in, and existing customer access.

The additive database migration should remain in place during application rollback. Dropping the new tables is destructive, is not required to disable either feature, and is not authorized by a routine rollback.

## Exactly four authorization decisions

Decisions 1, 2, and 3 are approved. Decision 4 is not approved.

### Decision 1

Status: Approved August 31, 2026.

Approve the scoped production release, the additive database migration, the updated Privacy Policy, and activation of the voluntary in product feedback invitation. Keep first party measurement disabled. Do not send email, contact customers, change App Store state, or spend money.

### Decision 2

Status: Approved August 31, 2026.

Approve first party measurement activation after the schema date, dedicated secret, current privacy disclosure, retention evidence, and release health are verified. This does not authorize advertising, customer contact, email, or third party tracking.

### Decision 3

Status: Approved August 31, 2026.

Approve one signed out production signup, trial, first record, timeline, feedback choice, and account deletion verification using synthetic information only. This does not authorize inspection of customer data or changes to the pending App Store submission.

### Decision 4

Status: Not approved.

Approve one feedback message from support@custodyfolio.com to each customer who explicitly selected Yes, contact me once. The total is limited to ten customers and one initial message each. This decision does not authorize scraped contacts, personal email, public outreach, advertising, or spending.

## App Store boundary

No item in this packet authorizes a new build, metadata edit, screenshot change, review note, phased release action, price change, or any other App Store Connect operation while the current submission is pending.
