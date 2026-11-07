import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('', { runScripts: 'outside-only' })

window.eval(await readFile(new URL('../scripts/content/page/message-user-id.js', import.meta.url), 'utf8'))
for (const name of ['document', 'Node', 'Element', 'Event', 'DOMParser']) globalThis[name] = window[name]
globalThis.chrome = { runtime: { getURL: path => new URL(`../${path}`, import.meta.url) } }
const originalFetch = globalThis.fetch

globalThis.fetch = async url => new Response(await readFile(url))
const copies = []

try {
	for (const id of ['first-extension', 'second-extension']) {
		// Separate bundles preserve the independent module state and runtime IDs of content scripts.
		const result = await build({
			entryPoints: [fileURLToPath(new URL('../scripts/content/chat.js', import.meta.url))],
			bundle: true,
			format: 'esm',
			write: false,
			define: { 'chrome.runtime.id': JSON.stringify(id) }
		})

		copies.push(await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`))
	}
} finally {
	globalThis.fetch = originalFetch
}

for (const [name, html, props] of [
	['whispers', '<div class="whispers-inbox__list-items"><div class="whispers-list-item"><strong class="whispers-list-item__user-name">One</strong></div></div>', { user: { id: '1' } }],
	['whisper-dialog', '<div class="whispers-thread"><div class="thread-header"><span id="whisper-thread-header-name-one">One</span></div></div>', { interlocutor: { id: '1' } }],
	['whisper-dialog', '<div class="whispers-thread"><div class="thread-message__message"><span class="thread-message__message--user-name">One</span></div></div>', { message: { from: '1' } }]
]) {
	test(`two copies settle after labeling ${html.includes('thread-header') ? 'whisper header' : name}`, async () => {
		const observers = []
		let deliveries = 0
		let stoppedLoop = false

		// Bound microtask delivery so a regression fails instead of starving the test runner's timers.
		globalThis.MutationObserver = class extends window.MutationObserver {
			constructor(callback) {
				super((mutations, observer) => {
					if (++deliveries > 6) {
						stoppedLoop = true
						for (const active of observers) active.disconnect()
						return
					}
					callback(mutations, observer)
				})
				observers.push(this)
			}
		}
		document.body.innerHTML = html
		const messages = []
		const labels = [{ id: 'label', enabled: true, name: 'Label', icon: 'https://example.com/icon.png' }]
		const assignments = [{ user: { id: '1' }, label: { id: 'label' } }]
		const kind = copies[0].Chat.KINDS.find(kind => kind.name === name)
		const element = document.querySelector(kind.messageSelector)
		const username = element.querySelector(kind.usernameSelector)

		element.__reactFiber$test = { memoizedProps: props }

		try {
			for (const { Chat } of copies) {
				const chat = new Chat({ subscribe() {} }, labels, assignments, kind)

				messages.push(chat)
				chat.attachIfNeeded(document.body)
			}
			await setImmediate()
			assert.equal(stoppedLoop, false, 'copies must not keep reacting to each other’s icon mutations')
			for (const id of ['first-extension', 'second-extension']) {
				assert.equal(document.querySelectorAll(`[data-chatter-labels-ext="${id}"] img`).length, 1)
			}
			const settledDeliveries = deliveries

			await setImmediate()
			assert.equal(deliveries, settledDeliveries)
			deliveries = 0
			element.__reactFiber$test.memoizedProps = {}
			username.firstChild.data = 'Unknown'
			await setImmediate()
			assert.equal(document.querySelectorAll('.chatter-labels-icons').length, 0)
			deliveries = 0
			element.__reactFiber$test.memoizedProps = props
			username.firstChild.data = 'One'
			await setImmediate()
			assert.equal(stoppedLoop, false)
			for (const id of ['first-extension', 'second-extension']) {
				assert.equal(document.querySelectorAll(`[data-chatter-labels-ext="${id}"] img`).length, 1)
			}
		} finally {
			for (const chat of messages) chat.destroy()
			document.body.replaceChildren()
		}
	})
}
