chrome.runtime.onMessage.addListener(message => {
	if (message.type == 'open-options') chrome.runtime.openOptionsPage()
})

chrome.runtime.onInstalled.addListener(async () => {
	const tabs = await chrome.tabs.query({ url: 'https://*.twitch.tv/*' })

	for (const tab of tabs) {
		try {
			await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				files: ['scripts/content/loader.js']
			})
		} catch {
			// Discarded tabs, chrome://, etc.
		}
	}
})
