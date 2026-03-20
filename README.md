# Agent Mod

A collection of custom extensions and configurations for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Contents

| Name | Type | Description |
|------|------|-------------|
| [permission](./.pi/extensions/permission.ts) | Extension | Permission control for bash commands with whitelist/blacklist rules |
| [AGENTS.md](./AGENTS.md) | Config | Beads workflow integration for AI agents |

## Installation

```bash
pi install git:github.com/patextreme/agent-mod
```

## Permission Extension

Intercepts `bash` tool calls and applies regex-based permission rules:
- `allow` - proceed without prompting
- `ask` - prompt user for confirmation  
- `deny` - block immediately

Rules are processed in reverse order (later patterns override earlier ones).

## Development

```bash
bun install
bun run format
bun run lint
```

## License

MIT