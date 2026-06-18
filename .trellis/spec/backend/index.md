# Backend Guidelines Index

Read these files before backend work:

- `directory-structure.md`
- `api-foundation.md`
- `monorepo-foundation.md`
- `shared-domain-contracts.md`
- `database-guidelines.md`
- `worker-guidelines.md`
- `error-handling.md`
- `quality-guidelines.md`
- `logging-guidelines.md`

## Pre-Development Checklist

- Confirm API owns authorization and business rules.
- Confirm shared contracts are transport-safe and expose DTOs, not runtime policy.
- Confirm any database contract is represented in Prisma and tests.
- Confirm sensitive payloads never include document body, prompts, keys, tokens, or signed URLs.
