chrome.runtime.onMessage.addListener(message => {
	if (message.type == 'open-options') chrome.runtime.openOptionsPage()
})

chrome.runtime.onInstalled.addListener(async () => {
	const tabs = await chrome.tabs.query({ url: ['https://*.twitch.tv/*', 'https://lurkology.com/*'] })

	for (const tab of tabs) {
		try {
			await chrome.scripting.insertCSS({
				target: { tabId: tab.id },
				files: ['styles/content.css']
			})
			if (new URL(tab.url).hostname === 'lurkology.com') {
				await chrome.scripting.executeScript({
					target: { tabId: tab.id },
					world: 'MAIN',
					files: ['scripts/content/page/lurkology-user-id.js']
				})
			}
			await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				files: ['scripts/content/loader.js']
			})
		} catch {
			// Discarded tabs, chrome://, etc.
		}
	}
})
