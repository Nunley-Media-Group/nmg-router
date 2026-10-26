# Tasks: Document install and usage and package the marketplace

**Issue**: #6
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/

## Implementation Tasks

### T001: Rewrite the README

**File(s)**: `README.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- Installation gives `/plugin marketplace add Nunley-Media-Group/nmg-plugins` and `/plugin install nmg-router@nmg-plugins` (AC1, FR1)
- Level-2 headings appear in the order AC2 lists, with the content the design gives for each section (AC2, FR2)
- The Credential security and Contributing sections are unchanged, and `tests/docs/readme-security.test.ts` still passes
- The dependency is named only as "oh-my-pi" where it is named
- `claude plugin validate .` passes (AC1)

### T002: README section tests

**File(s)**: `tests/docs/readme-sections.test.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- Asserts the Installation commands (AC1)
- Asserts the eleven level-2 headings in order and each section's AC2 terms (AC2)
- `npm test` and `npm run typecheck` pass

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #6 | 2026-10-25 | Initial feature tasks |
