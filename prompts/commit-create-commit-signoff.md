---
description: Create a new git commit with signoff
---

You will create a new git commit with signoff using the commit message from the conversation context.

Before proceeding:
1. Verify that a commit message has been agreed upon in the conversation context
2. Check the current git status to see what changes are staged

To create the commit:
1. Run git status to show current state
2. Run git commit with the agreed-upon message and the -s flag for signoff (staged files only)
3. Run git status after commit to show confirmation

If no commit message is available in the context, inform the user and ask them to provide one.