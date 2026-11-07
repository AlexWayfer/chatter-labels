# Changelog

## 1.5 (2026-11-07)

*   Add System, Light, and Dark themes for the options page.
*   Add optional JavaScript label checks with predefined helper functions.
*   Support selecting an existing GitHub Gist and report access errors without creating a replacement.
*   Improve storage loading feedback and show saving progress and success inside Save buttons.
*   Fix options-page scrolling at assignment list boundaries and spacing between storage fields.
*   Validate raster icon size after resizing.
*   Fix tab freezes.
*   Fix duplicate label icons in Mod Actions and Activity Feed.

## 1.4.1 (2026-11-03)

*   Fix compatibility between store and unpacked copies of the extension.
*   Replace assignment comment captions with placeholders in the label editor.
*   Fix CI caching without a tracked lockfile.
*   Add scripts for store screenshots and promotional images.

## 1.4 (2026-11-03)

*   Redesign the options page with BeerCSS.
*   Animate assignment form expansion and removal controls.
*   Add new label forms at the top of the list.
*   Add support for Lurkology.
*   Add label management to Twitch profiles.
*   Show labels in chat threads.
*   Show labels in whispers.
*   Show labels in Mod Actions and Activity Feed.
*   Add optional comments to label assignments, including bulk additions.
*   Fix labels in suspended users' chatter cards.
*   Disable assignment controls while saving.
*   Refresh content styles when reloading or updating the extension.
*   Update development dependencies and CI tooling.

## 1.3 (2026-09-10)

*   Add labels icons for user chat history.
*   Fix labels icons for blocked by automod messages.
*   Add labels icons for automod queue.
*   Fix duplicating labels icons after moving block in moderation mode.
*   Add ability to (temporarily) hide icons in chat.
*   Re-activate extension after reloading (or updating) in browser.
*   Refactor code for Chats.

## 1.2.1 (2026-09-09)

*   Remake default `confirm` to custom dialog.

## 1.2 (2026-09-09)

*   Make long assignments lists "collapsed" and scrollable on options page.
*   Sort assignments on options page by alphabet by default.
*   Add select for sorting assignments on options page.
    By alphabet or by date assigned.
*   Add assignments count number on options page.
*   Add "Copy" button for assignments on options page.
*   Save and display user login if different from display name.
*   Make dates of assignments on options page non-selectable.
    It's more convenient for selection and copying.
*   Fix narrow label icons width sizing.
*   Increase number of default rows (height) for assignments adding textarea.
    It's still vertically resizable.
*   Display error if GitHub token is incorrect.
*   Fix work of two different versions in parallel.
    From Store and local unpacked, for example.
*   Add GitHub Actions (CI) with linting.
*   Add Renovate.
*   Update development dependencies.
*   Add badges for CI and dependencies into README.
*   Fix Stylelint errors.

## 1.1 (2026-09-02)

*   Fix synchronization between tabs.
*   Don't clear assignments in form on options page after labels saving.
*   Save assignments from textarea when saving labels.
*   Hide removing for assignments on options page if the list is empty.
*   Hide assignments for non-saved labels on options page.
*   Display "Loading" text for labels on options page.
*   Fix label deletion confirmation after saving.
*   Fix "Added" toast showing.
*   Optimize requests to Twitch API, especially for mass assignments.
*   Add 128px icon into manifest.

## 1.0.2 (2026-08-25)

*   Fix poackaging script.

## 1.0.1 (2026-08-25)

*   Add scripts for packaging and releasing.

## 1.0 (2026-08-25)

*   Initial release with complete functionality.
