## Summary

Describe the user-visible outcome and why this change is needed.

## Conversion impact

- [ ] No conversion behavior changes
- [ ] Etterna to osu!mania
- [ ] osu!mania to Etterna (currently 4K only)
- [ ] Shared behavior affecting both directions

## Verification

- [ ] I added or updated a regression test before changing behavior
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test:architecture`
- [ ] `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
- [ ] `git diff --check`
- [ ] I ran applicable integration, compatibility, and release checks

List the exact additional checks and compatibility corpus used:

## Safety and maintenance

- [ ] Path validation and transactional rollback remain intact or are covered by tests
- [ ] New asynchronous batches wait for every started operation to settle
- [ ] Documentation reflects changed behavior and responsibilities
- [ ] No generated build, release, cache, local game, or output files are included
- [ ] New assets/templates include source, author, license or permission, and attribution
- [ ] Logs, screenshots, fixtures, and paths are sanitized

## Release impact

State whether this requires a version bump, release note, dependency notice, or no release
action.
