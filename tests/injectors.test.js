import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('', { url: 'https://www.twitch.tv/' })

globalThis.window = window
for (const name of ['document', 'Node', 'Event', 'DOMParser']) globalThis[name] = window[name]
const observers = []

globalThis.MutationObserver = class {
	active = false

	constructor() {
		observers.push(this)
	}

	observe() {
		this.active = true
	}

	disconnect() {
		this.active = false
	}
}
globalThis.chrome = {
	runtime: { id: '', getURL: path => new URL(`../${path}`, import.meta.url) },
	storage: {
		onChanged: { addListener() {} },
		sync: { async get() {
			return {}
		} }
	}
}
globalThis.fetch = async url => new Response(await readFile(url))
let sequence = 0

for (const site of ['twitch', 'lurkology']) {
	test(`${site} copies stay active independently and reload only their own integration`, async () => {
		const load = async id => {
			chrome.runtime.id = id
			await import(`../scripts/content/${site}-injector.js?instance=${++sequence}`)
			return observers.at(-1)
		}
		const storeId = `${site}-store`
		const unpackedId = `${site}-unpacked`
		let legacyActive = true
		const stopLegacy = () => {
			legacyActive = false
		}

		window.addEventListener('chatter-labels:teardown', stopLegacy)

		try {
			const store = await load(storeId)
			const unpacked = await load(unpackedId)

			assert.equal(store.active, true, 'starting unpacked must not stop the store copy')
			assert.equal(unpacked.active, true)
			assert.equal(legacyActive, true, 'starting either copy must not stop the legacy store version')
			const reloadedStore = await load(storeId)

			assert.equal(store.active, false, 'reloading must stop the previous instance of the same copy')
			assert.equal(reloadedStore.active, true)
			assert.equal(unpacked.active, true, 'reloading store must not stop unpacked')
			window.dispatchEvent(new Event('chatter-labels:teardown'))
			assert.equal(legacyActive, false)
			assert.equal(reloadedStore.active, true, 'legacy teardown must not stop another copy')
			assert.equal(unpacked.active, true)
		} finally {
			window.removeEventListener('chatter-labels:teardown', stopLegacy)
			for (const event of ['chatter-labels:teardown', `chatter-labels:teardown:${storeId}`, `chatter-labels:teardown:${unpackedId}`]) {
				window.dispatchEvent(new Event(event))
			}
		}
	})
}
