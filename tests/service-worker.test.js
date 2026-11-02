import assert from 'node:assert/strict'
import { test } from 'node:test'

test('loads styles and the appropriate page bridge before restarting supported tabs', async () => {
	const calls = []
	let onInstalled
	let query

	globalThis.chrome = {
		runtime: {
			onMessage: { addListener() {} },
			onInstalled: {
				addListener(listener) {
					onInstalled = listener
				}
			}
		},
		tabs: { query: async options => {
			query = options
			return [{ id: 1, url: 'https://www.twitch.tv/one' },
				{ id: 2, url: 'https://www.twitch.tv/two' },
				{ id: 3, url: 'https://lurkology.com/logs' }]
		} },
		scripting: {
			async insertCSS(options) {
				calls.push(['css', options])
				if (options.target.tabId === 1) throw new Error('Discarded tab')
			},
			async executeScript(options) {
				calls.push(['script', options])
			}
		}
	}
	await import('../scripts/service-worker.js')
	await onInstalled()
	assert.deepEqual(query.url, ['https://*.twitch.tv/*', 'https://lurkology.com/*'])
	assert.deepEqual(calls, [
		['css', { target: { tabId: 1 }, files: ['styles/content.css'] }],
		['css', { target: { tabId: 2 }, files: ['styles/content.css'] }],
		['script', { target: { tabId: 2 }, files: ['scripts/content/loader.js'] }],
		['css', { target: { tabId: 3 }, files: ['styles/content.css'] }],
		['script', { target: { tabId: 3 }, world: 'MAIN', files: ['scripts/content/page/lurkology-user-id.js'] }],
		['script', { target: { tabId: 3 }, files: ['scripts/content/loader.js'] }]
	])
})
