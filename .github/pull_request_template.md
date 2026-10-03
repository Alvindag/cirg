## What and why

## How it was tested

## Checklist
- [ ] CI is green (backend on both databases, web, mobile, infrastructure)
- [ ] Database changes are in a migration that is safe to run while the previous version is still serving (add first, remove in a later release)
- [ ] New settings are in `docs/deployment.md` and `infra/` (not only in code)
- [ ] No secrets, tokens or personal data in the diff
