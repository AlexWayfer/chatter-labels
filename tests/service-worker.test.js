import assert from 'node:assert/strict'
import { test } from 'node:test'

test('loads current styles before restarting content scripts in existing Twitch tabs', async () => {
	const calls = []
	let onInstalled

	globalThis.chrome = {
		runtime: {
			onMessage: { addListener() {} },
			onInstalled: {
				addListener(listener) {
					onInstalled = listener
				}
			}
		},
		tabs: { query: async () => [{ id: 1 }, { id: 2 }] },
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
	assert.deepEqual(calls, [
		['css', { target: { tabId: 1 }, files: ['styles/content.css'] }],
		['css', { target: { tabId: 2 }, files: ['styles/content.css'] }],
		['script', { target: { tabId: 2 }, files: ['scripts/content/loader.js'] }]
	])
})
