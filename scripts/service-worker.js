import { LabelCheckRunner } from './label-checks/runner.js'
import { getUserScriptsStatus, userScriptsSettingsUrl } from './label-checks/user-scripts.js'
import { MainStorage } from './storage/main.js'
import { OptionsStorage } from './storage/options.js'

let checks

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type == 'open-options') chrome.runtime.openOptionsPage()
	if (message.type === 'user-scripts-status') {
		getUserScriptsStatus().then(sendResponse)
		return true
	}
	if (message.type === 'open-user-scripts-settings') {
		chrome.tabs.create({ url: userScriptsSettingsUrl(chrome.runtime.id) })
			.then(() => sendResponse({ ok: true }), error => sendResponse({ ok: false, error: error.message }))
		return true
	}
	if (message.type !== 'run-label-check') return
	checks ??= OptionsStorage.create().then(options => MainStorage.create(options))
		.then(storage => new LabelCheckRunner(storage))
		.catch(error => {
			checks = null
			throw error
		})
	checks.then(runner => runner.run(message, sender))
		.then(value => sendResponse({ ok: true, value }))
		.catch(error => sendResponse({ ok: false, error: error.message, code: error.code }))
	return true
})

chrome.runtime.onUserScriptMessage.addListener((message, sender, sendResponse) => {
	if (message?.type !== 'label-check-twitch-gql') return
	Promise.resolve(checks).then(runner => {
		if (!runner) throw new Error('This label check is no longer running.')
		return runner.requestTwitch(message, sender)
	})
		.then(
			data => sendResponse({ ok: true, data }),
			error => sendResponse({ ok: false, error: error.message })
		)
	return true
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
