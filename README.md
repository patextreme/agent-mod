# Pi Permission Extension

A permission control extension for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Features

- **Whitelist/blacklist bash commands** using regex patterns
- **Three actions**: `allow`, `ask`, `deny`
- **Sandbox mode awareness**: auto-allow when `PI_SANDBOX=true`
- **Configurable rules**: customize permission rules per-command
- **UI integration**: prompts user for commands matching `ask` rules

## Install

From git:

```bash
pi install git:github.com/user/pi-permission-extension
```

From local path:

```bash
pi install /path/to/pi-permission-extension
```

## How It Works

The extension intercepts `bash` tool calls and checks them against a list of regex rules:

1. **`allow`** - Command proceeds without prompting
2. **`ask`** - User is prompted for confirmation (if UI available)
3. **`deny`** - Command is blocked immediately

Rules are processed in **reverse order** - later patterns override earlier ones.

## Configuration

Edit `.pi/extensions/permission.ts` to customize permission rules:

```typescript
const PERMISSION_RULES: PermissionRule[] = [
  // Git operations - ask for confirmation
  { regex: /git commit/, action: "ask" },
  { regex: /git push/, action: "ask" },
  
  // Read-only gh commands - allow without asking
  { regex: /gh repo view/, action: "allow" },
  { regex: /gh issue list/, action: "allow" },
  
  // Other gh commands - ask
  { regex: /gh /, action: "ask" },
];
```

### Sandbox Mode

Set `PI_SANDBOX=true` environment variable to allow all commands by default (useful in CI/trusted environments):

```bash
PI_SANDBOX=true pi run
```

## Example Rules

| Pattern | Action | Behavior |
|---------|--------|----------|
| `/gh repo view/` | `allow` | View repos without prompting |
| `/git commit/` | `ask` | Ask before committing |
| `/git push/` | `ask` | Ask before pushing |
| `/gh /` | `ask` | Ask for any other gh command |
| `/rm -rf/` | `deny` | Block dangerous commands |

## Development

```bash
# Install dependencies
bun install

# Format code
bun run format

# Lint
bun run lint
```

## License

MIT