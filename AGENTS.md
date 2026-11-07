# Agent notes

## UI consistency

Use BeerCSS as the primary toolkit for the options page and make full use of its existing components, helpers, and documented behavior. Before implementing or replacing a UI pattern, inspect the installed BeerCSS version and its official documentation for ready-made support. Add the required upstream CSS and JavaScript modules to local asset preparation instead of recreating supported components. Limit custom UI code to product-specific behavior, accessibility gaps, or demonstrated library limitations. Preserve the host site's styles for controls embedded in Twitch and Lurkology.

Before adding or changing a control, inspect comparable controls in the project and follow their existing styles and behavior. Do not invent separate styling for an equivalent control.

Controls styled as buttons, including native `summary` toggles, must match existing buttons in cursor, text selection, borders, spacing, and backgrounds. On the options page, text buttons use the default cursor; do not add `cursor: pointer` to them. Keep the shared border and indicate toggle state through the background, as Add and Remove do. Preserve explicitly requested differences.

## Releases

1. Inspect the working tree, the current manifest version, release tags, and all changes since the previous release before proposing a new version. Use a minor version for backward-compatible features and a patch version for fixes; reserve a major version for incompatible changes.
2. Draft the new `CHANGELOG.md` section in English, following its existing format. Describe user-visible changes and relevant maintenance work, grouping related commits. Show the complete proposed section to the user in a fenced code block and obtain approval of the version and changelog before editing release files. Revisions must also be shown in a fenced code block and approved.
3. After approval, update `CHANGELOG.md` and run `pnpm test` and `pnpm lint`. Resolve failures before proceeding. Use the actual release date in the changelog; reconfirm the section if it changes before release.
4. Keep the changelog update in a separate commit before the version bump, following the history of releases 1.2, 1.2.1, and 1.3. Provide a proposed commit message for the user unless asked to commit.
5. Once the changelog commit is present and the working tree is clean, use `pnpm release` when the user authorizes the release. The script prompts for the approved version, updates `manifest.json`, builds `pkg/chatter-labels-<version>.zip`, commits the manifest, creates an annotated `v<version>` tag, and pushes the commit and tags. It does not update or commit the changelog. Check local tags before running it because it uses `git push --tags`.
6. Verify the resulting archive's contents and manifest version, and report the archive path and release result. Uploading to the Chrome Web Store is a separate step requiring the user's instruction.

## Commit messages

Commit messages are in English.

When you propose a commit message, put it in a fenced code block, so it can be copied as is. End every finished change, code or this file, with a proposed message even when the user did not ask: they commit themselves and rely on it. Propose one message per unrelated change.

Include a concise subject and a detailed body explaining what changed and why.

When making commits yourself, prefer separate commits for unrelated changes whenever possible.

After making commits yourself, you may push them immediately without asking for additional permission.
