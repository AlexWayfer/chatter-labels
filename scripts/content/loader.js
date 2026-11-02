import(chrome.runtime.getURL(location.hostname === 'lurkology.com'
	? 'scripts/content/lurkology-injector.js'
	: 'scripts/content/twitch-injector.js'))
