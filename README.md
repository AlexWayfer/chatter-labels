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

## Development

Run `pnpm install` before loading the unpacked extension. Installation prepares the
local BeerCSS styles and Material Symbols font used by the options page. After
updating BeerCSS, run `pnpm prepare:styles` to refresh them. `pnpm run pack` also
prepares and includes these styles, the icon font, and their licenses in the archive.

### Store screenshots

Install the screenshot browser once with `pnpm exec playwright install chromium`.
Then run `pnpm screenshots` to generate `pkg/screenshots/options-1280x800.png`.
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
a light theme and 50% page scale so all three example labels fit in the overview;
the user card uses a dark background. CSS, fonts, and icons load
locally; unexpected external requests are blocked.

## Credentials

* [Extension icon](https://www.flaticon.com/free-icon/tag_16568959)
* [Button icons](https://www.svgrepo.com/)
