# Agent notes

## UI consistency

Before adding or changing a control, inspect comparable controls in the project and follow their existing styles and behavior. Do not invent separate styling for an equivalent control.

Controls styled as buttons, including native `summary` toggles, must match existing buttons in cursor, text selection, borders, spacing, and backgrounds. On the options page, text buttons use the default cursor; do not add `cursor: pointer` to them. Keep the shared border and indicate toggle state through the background, as Add and Remove do. Preserve explicitly requested differences.

## Commit messages

Commit messages are in English.

When you propose a commit message, put it in a fenced code block, so it can be copied as is. End every finished change, code or this file, with a proposed message even when the user did not ask: they commit themselves and rely on it. Propose one message per unrelated change.

Include a concise subject and a detailed body explaining what changed and why.

When making commits yourself, prefer separate commits for unrelated changes whenever possible.

After making commits yourself, you may push them immediately without asking for additional permission.
