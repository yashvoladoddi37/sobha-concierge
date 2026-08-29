```markdown
# sobha-concierge Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `sobha-concierge` repository. The project is built with TypeScript and Next.js, following specific naming, import/export, and testing conventions. By following these guidelines, contributors can ensure consistency and maintainability across the codebase.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `orderList.tsx`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```typescript
    import { getUser } from './userService';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // userService.ts
    export function getUser(id: string) { ... }
    export const USER_ROLE = 'admin';
    ```

### Commit Patterns
- Commit messages are **freeform** but sometimes use the `scripts` prefix.
- Average commit message length: **96 characters**.

## Workflows

_No automated or detected workflows were found in this repository._

## Testing Patterns

- **Testing framework:** Unknown (not detected).
- **Test file pattern:** Files containing tests use the `*.test.*` naming convention.
  - Example: `userService.test.ts`, `orderList.test.tsx`
- Place test files alongside the files they test or in a dedicated `__tests__` directory.

### Example Test File
```typescript
// userService.test.ts
import { getUser } from './userService';

describe('getUser', () => {
  it('should return user data for valid id', () => {
    const user = getUser('123');
    expect(user).toBeDefined();
  });
});
```

## Commands

| Command | Purpose |
|---------|---------|
| /test   | Run all test files matching `*.test.*` |
| /lint   | Run lint checks on the codebase        |
| /build  | Build the Next.js application          |

```