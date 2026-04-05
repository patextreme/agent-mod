# Agent Mod

Extensions and prompt templates for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Contents

| Name | Type | Description |
|------|------|-------------|
| [permission](./extensions/permission.ts) | Extension | Permission control for bash commands with whitelist/blacklist rules |
| [AGENTS.md](./AGENTS.md) | Config | Agent conventions and project layout guide |

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
npm install
npm run format
npm run lint
npm run typecheck
```

## License

MIT
