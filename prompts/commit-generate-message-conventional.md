---
description: Generate a conventional commit message
---

You will take a look at the git staged files in this directory.
Then generate a concise, one-line git commit message following the conventional commit guidelines. The message must:
- Use a conventional commit type (e.g., feat, fix, docs, style, refactor, test, chore)
- NOT include a scope (no parentheses after the type)
- Be no longer than 72 characters
- Clearly summarize the purpose of the change
- Only consider the staged files and analyze the content of the changes in the staged files
- Output a single-line message only
- Do NOT include any credentials, secrets, or sensitive information in the commit message

Example formats:
feat: add user authentication flow
fix: resolve crash on startup
docs: update README with installation steps
style: format code with prettier
refactor: simplify data processing logic
test: add unit tests for login
chore: update dependencies

Do not include any scope, credentials, secrets, or extra details. Only output the commit message as a single line.