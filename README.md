# Chatter Labels for Twitch

[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/AlexWayfer/chatter-labels/ci.yml?style=flat-square)](https://github.com/AlexWayfer/chatter-labels/actions)
[![Depfu](https://img.shields.io/depfu/AlexWayfer/chatter-labels?style=flat-square)](https://depfu.com/repos/github/AlexWayfer/chatter-labels)

<p>
	<a target="_blank" href="https://chromewebstore.google.com/detail/chatter-labels-for-twitch/ngobainhmihgaihpbnocjaemgffoiomp" >
		<img src="images/chrome-web-store.png" alt="Chrome Web Store" width="200" />
	</a>
</p>

Chrome extension for assignment your custom labels to chatters on Twitch.

Also shows your labels in [Lurkology chat logs](https://lurkology.com/logs).
Click an author's name to manage their labels in the user card. Assignments are
shared with Twitch and matched by Twitch user ID, including historical usernames.

## Label check scripts

Each label can have an optional JavaScript check script in Options. Expand
**Check script**, enter a script, and save. A **Check** button appears
beside that label in the user editor on Twitch and Lurkology. It changes to
**Checking...** while running, then the result replaces the button without
changing the checkbox, comment, or saved assignments. A successful check stays
cached for that label in the current editor; it cannot be run twice. Errors show
their message with a **Retry** button. Changing the saved script resets its result.
Clearing and saving the script removes the button.

Scripts run only when you click **Check**, using Chrome's `userScripts` API
(Chrome 135 or newer). When access is disabled, the script editor and label popup
show a prompt with **Open extension settings** and **Retry**. Turn on **Allow user
scripts** in the extension's details, then return and retry; drafts stay in place.
Chrome versions before 138 use the global **Developer mode** switch instead.
Access is checked again when you reopen the popup or return from settings, and
before each execution. Manual label editing and saving remain available.

The script receives `user.id`, `user.login`, `user.username`, and a `signal` that
aborts after 10 seconds. `channel.login` identifies the current Twitch channel
when checking from a chatter card in channel chat (including popout, embedded,
and moderator chats). `channel` is `null` in the profile label editor, on Lurkology,
and outside known channel routes. The channel is resolved from the tab's current
URL for each check, so navigation does not reuse an old channel.
Scripts can use `await` and return `true` (Yes), `false` (No),
text, a number, or `null`/`undefined` (Unknown). For example:

```js
return user.login === 'example'
```

`await twitch.gql(query, variables = {})` sends a request using your current Twitch
session. It supplies the headers and check deadline, throws HTTP and GraphQL
errors, and returns the response's `data` object. It works on both Twitch and
Lurkology, with no Twitch tab open. Sign in to Twitch once in the same browser
profile; it does not prompt for credentials or send requests without a session.
The extension requires the `cookies` permission for this helper. After updating,
reload the extension and accept the new permission if Chrome requests it.

The background service worker reads Twitch's `auth-token` cookie from the cookie
store associated with the calling tab and sends the request only to Twitch's GQL
endpoint. The cookie is not passed to the script or the Lurkology page. Requests
are accepted only from the originating tab and document while its check is active;
finishing or timing out cancels pending requests. Incognito tabs use their own
cookie store when the extension is allowed in incognito.

Use `twitch.gql(query, variables, { authenticated: true })` when a check depends on
the signed-in account. It verifies `currentUser` in the same HTTP request and
throws if Twitch treats the session as anonymous. Checks specific to a response,
such as a playback token's viewer and channel IDs, remain in the script.

`await twitch.getUser(id, fields)` looks up a user by Twitch ID, including suspended
accounts via `lookupType: ALL`. Pass a GraphQL field selection such as `'login'`
or `'id login displayName'`. It returns the user object and throws `Twitch user not found.`
when no matching user exists. Requests use the same session and deadline as `gql`.

```js
const { login } = await twitch.getUser(user.id, 'login')
return login
```

Pass `signal` to `fetch` to cancel slow requests. The signal expires after 60
seconds so paginated archive searches can make spaced requests. After 65 seconds the editor
reports a timeout; this does not forcibly stop arbitrary JavaScript. Scripts run
in a separate user-script world with access to the current website's DOM, storage,
and network, but without the extension's storage or GitHub token. Only use scripts
you trust. Script source is saved in the same GitHub Gist as the label; execution
results are temporary and are not synced.

The native BeerCSS **Check script** expansion sits beside **Show in chat**,
with a code icon and a chevron indicating its open state. Expanding it keeps the
editor and reference content across the full label width. Function expansions
use the same chevron. Below each script editor, BeerCSS tabs with larger text
and the standard active underline organize **Help**, **Functions**, and
**Examples**. Help starts selected and shows how to return Yes/No, a number,
text, or Unknown. Functions contains expandable usage snippets for `twitch.gql`,
`twitch.getUser`, `bestLogs.countMessages`, and `bestLogs.searchMessages`, with Insert buttons. Examples has
its own nested tabs for complete scripts. Each label and tab group keeps its own
selection. Use Left/Right arrows or Home/End to switch tabs from the keyboard.
**Insert** fills that label's script field;
replacing an existing script requires confirmation. Click **Save** to apply it.
The examples include **Blocked me** and **Keyword matches in chat logs**.
The block example also works for historical Lurkology authors with only a Twitch
user ID; `twitch.getUser` resolves a missing login first. You can edit the inserted
source. Existing saved scripts are not rewritten.

**Keyword matches in chat logs** searches BestLogs, the archive service used by
[Lurkology](https://lurkology.com/about). Edit the `keywords` array in the script.
The `bestLogs.countMessages(keywords)` helper handles channel lookup, archive
requests, validation, errors, and the check deadline. It matches whole words
without regard to case, including Cyrillic, and returns the
number of unique matching messages by the selected chatter in the current channel.
It searches the available archive using keyword queries rather than sampling
the chatter's latest messages. There is no default candidate or match cap.
A message matching several keywords counts once. Both author and channel are
matched by Twitch ID. The result counts messages returned by the selected archive,
whose coverage may be incomplete; it does not imply complete Twitch history.
An unavailable archive or a failed request is reported as an error, while a
successful search with no matches in the available archive returns `0`. This does not mean
the chatter has never used these words. Run this example from a chatter
card in Twitch channel chat. Profile label editors and Lurkology show a clear
error because they do not provide this check's chat context. Your Twitch sign-in
is used to resolve the channel ID, and public log requests go directly to BestLogs.

Keywords are single words and can contain `*` for zero or more characters within
that word. For example, `писала` matches only that word, `*писала` also matches
`написала`, and `*ала` matches any word ending in `ала`. Spaces and other pattern
syntax are rejected. Letters, combining marks, digits, and underscores belong to
the same word; punctuation separates words. The helper sends each distinct word
or a mask's longest literal part through `q`, supported by the
[archive API](https://github.com/Julia-Roman/rustlog/blob/master/src/db/mod.rs).
Masks sharing a literal query reuse its results. Queries use newest-first pages
of up to 500 records with `limit` and `offset`, continuing until each query is
exhausted. Thus a match can be found after thousands of unrelated messages or
after an entire page of rejected candidates. Whole words and masks are verified
locally, then the optional custom filter runs. Messages found by several queries
are checked and counted only once. A repeating page is reported as an error
instead of silently returning an incomplete result.

For extra matching logic, pass `{ filter: (message, matchedWords) => true }` as
the second argument. The filter runs once for each unique matching message and
receives its full data plus the matching words, normalized to lowercase and NFC.
It must return a boolean or a promise resolving to one. Filter errors are reported
by the check. Keep custom language or context rules in the saved script; the
library handles archive access, whole-word masks, filtering, and counting.

Pass `limit: 10` alongside `filter` to stop after ten unique accepted messages.
Rejected messages and duplicates do not use up this match limit. Reaching it
stops both processing and further archive requests. The returned number is then a lower
bound, so a personal script can display `10+` when it reaches the cap. Without a
match limit the helper scans all query results within the check deadline.
An optional `maxMessages` sets a separate budget for unique candidates inspected,
including whole-word mismatches and filter rejections. Both limits default to
`Infinity`; finite values must be positive integers. Explicit limits may return
partial counts, so omit them when you want the complete search result.

An HTTP 429 response allows one retry per search after a short `Retry-After`
delay (one second when the header is unavailable). Waiting is cancelled with the
check. A server delay longer than three seconds, or another 429 after the retry,
is reported with a readable rate-limit error. Queries and pages run sequentially
with a cancellable 400 ms pause between requests. More keywords and pages require
more requests. Other checks and shared-IP traffic can still exhaust the server's
rate limit. Errors and timeouts are not displayed as successful partial counts.

The example leaves the keyword array empty; fill it with your own words or masks.
An empty list reports an error before making requests.

```js
const keywords = [];
return await bestLogs.countMessages(keywords);
```

To display both counts and inspect matches, use `bestLogs.searchMessages` with
the same keywords and options. It returns `{ count, checked, messages }`.
`checked` counts unique candidates returned by `q` from the selected author and
channel that were actually inspected, including whole-word mismatches and filter
rejections. Three accepted matches among 127 inspected candidates produce
`3 of 127 candidates`. This denominator is not the chatter's total archive size.
Either explicit limit can stop processing earlier. Both methods share pagination,
request pacing, retry, and deadline behavior. Generated ban, timeout, and deletion
records are excluded from matching and `checked`.

```js
const keywords = [];
const { count, checked, messages } = await bestLogs.searchMessages(keywords);
return { text: count + ' of ' + checked + ' candidates', messages };
```

Scripts may return `{ text, messages }` to show a plain-text result with a
collapsed **Messages (N)** list. Each entry requires `text` and may include an ISO
`timestamp`, displayed in local time. The search helper returns only matches
accepted by the custom filter. Message contents are never interpreted as HTML.
Opening the list uses the already fetched results, makes no requests, and does
not modify assignments or comments. Changing the saved script clears the previous list.
Messages from `searchMessages` also include `id` and `channelId`. With these
fields and a valid timestamp, the displayed date links to that message in
Lurkology's full channel chat in a new tab. The link uses the UTC archive day
and message ID, without author or keyword filters, so surrounding messages are
visible. Messages without this metadata remain readable without a link.

The script field and examples use CodeMirror's JavaScript syntax highlighting,
with matching fonts and four-character tab stops in both themes. The editor
starts at five lines and grows with its content up to twenty lines, then scrolls.
The native textarea fallback uses BeerCSS's automatic sizing. Read-only help,
function snippets, and examples fit their content up to twenty lines before
scrolling, so short code blocks have no fixed empty area. Both code areas can
be resized vertically. Tab indents in
the editor; Escape followed by Tab moves focus out. Editing, pasting, undoing,
and inserting examples update the saved form value as usual.

**Blocked me** checks Twitch's authenticated playback authorization. It works from
Twitch and Lurkology using your Twitch sign-in. It treats `UNAUTHORIZED`
as a block, following the Twitch web player's behavior, and reports other viewing
restrictions separately. This uses Twitch's undocumented GQL API and can need
updating if Twitch changes it. It checks blocking by the channel owner, not bans
issued by chat moderators. Use the current example to enable background requests;
older saved scripts that read `document.cookie` directly are not rewritten.

## Development

Run `pnpm install` before loading the unpacked extension. Installation prepares the
local BeerCSS styles and tab runtime, Material Symbols font, and bundled CodeMirror editor used by
the options page. After updating dependencies, run `pnpm prepare:assets` to refresh
them. `pnpm run pack` also prepares and includes these assets and their licenses
in the archive. No CDN is needed for syntax highlighting.

### Store screenshots

Install the screenshot browser once with `pnpm exec playwright install chromium`.
Then run `pnpm screenshots` to generate `pkg/screenshots/options-1280x800.png`.
`pkg/screenshots/options-dark-1280x800.png` shows the same overview after selecting
Dark with the theme control.
`pkg/screenshots/label-check-script-1280x800.png` focuses on an expanded script editor
and the `twitch.getUser()` function reference in Dark mode. Its Bot example checks whether the
resolved login ends in `bot`.
`pkg/screenshots/label-check-result-1280x800.png` shows the example's Yes result
in the user-card label editor, without changing assignments. Script access and
the extension/Twitch request boundary are mocked for these screenshots.
It also creates `pkg/screenshots/chatter-card-640x400.png`, showing the current
label editor on a local Twitch user-card fixture with Bot and Friend assigned.
The card surroundings are a mock; the integration, popover, and label form use
the extension's real modules and styles. Card data is in `exe/fixtures/chatter-card.json`.
`pkg/screenshots/chat-640x400.png` shows label icons next to usernames in chat,
including a reply and an unlabelled user. Chat data is in `exe/fixtures/chat.json`;
messages use the real chat integration with local Twitch surroundings.
The standard chat badges in `exe/fixtures/assets/` are cropped from the reference
screenshot and loaded locally rather than approximated with emoji.
The command also creates `small-promo-440x280.png` and `marquee-promo-1400x560.png`
in the same output directory. These use the extension icon and name on a dark
branded background, with two chat messages in the small tile and five in the marquee.
Their layout is in `exe/fixtures/promo.html`
and `exe/fixtures/promo.css`.
The command uses the real options page with the example data in
`exe/fixtures/options.json`, an isolated browser, and mocked storage and GitHub
responses. It does not use your token or change your saved labels.

The images use a fixed locale and time zone. The 1280×800 options image uses
a light theme and 46% page scale so all three example labels fit in the overview;
the dark overview uses the same scale, while the script editor uses 65% and scrolls
to the Labels section. The user card uses a dark background; the check-result
image uses 150% scale for readability. CSS, fonts, and icons load
locally; unexpected external requests are blocked.

## Credentials

* [Extension icon](https://www.flaticon.com/free-icon/tag_16568959)
* [Button icons](https://www.svgrepo.com/)
