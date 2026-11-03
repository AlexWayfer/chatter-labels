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

## Credentials

* [Extension icon](https://www.flaticon.com/free-icon/tag_16568959)
* [Button icons](https://www.svgrepo.com/)
