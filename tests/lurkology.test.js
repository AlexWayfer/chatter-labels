import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { afterEach, mock, test } from 'node:test'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('', { url: 'https://lurkology.com/logs' })

for (const name of ['document', 'Node', 'Element', 'Event', 'MutationObserver', 'DOMParser']) {
	globalThis[name] = window[name]
}
globalThis.chrome = { runtime: { id: 'test', getURL: path => new URL(`../${path}`, import.meta.url) } }
const fetchMock = mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)))
const { Lurkology } = await import('../scripts/content/lurkology.js')
const { User } = await import('../scripts/models/user.js')

fetchMock.mock.restore()
let integration

const row = (id, name = 'HistoricalName') => `
	<span class="row-start-3"><button class="font-bold">${name}</button>
	<span>Message</span><a title="Permalink" href="?c=test#${id}"></a></span>
`

const resolveUser = event => {
	const element = event.target
	const id = element.querySelector('a')?.hash.slice(1)

	delete element.dataset.userId
	delete element.dataset.username
	if (id === 'unknown') return
	element.dataset.userId = id
	element.dataset.username = element.querySelector('button').textContent
}
document.addEventListener('chatter-labels:resolve-lurkology-user', resolveUser)

const setup = async () => {
	const subscriptions = new Map()
	const storage = {
		labels: [{ id: 'friend', name: 'Friend', enabled: true, icon: 'https://example.com/icon.png' }],
		assignments: [],
		get(key) {
			return this[key]
		},
		async set(key, value) {
			this[key] = value
			for (const callback of subscriptions.get(key) ?? []) callback(value)
		},
		subscribe(key, callback) {
			if (!subscriptions.has(key)) subscriptions.set(key, new Set())
			subscriptions.get(key).add(callback)
			return () => subscriptions.get(key).delete(callback)
		}
	}
	integration = await Lurkology.create(storage)
	return { storage, subscriptions }
}

afterEach(() => {
	integration?.destroy()
	document.body.replaceChildren()
})

test('updates virtualized rows, shared assignments and disabled labels without duplicates', async () => {
	document.body.innerHTML = row('123')
	const { storage } = await setup()

	await storage.set('assignments', [{ user: new User({ id: '123', username: 'CurrentName' }), label: storage.labels[0] }])
	await setImmediate()
	assert.equal(document.querySelectorAll('.chatter-labels-icon').length, 1)
	const author = document.querySelector('button.font-bold')

	assert.equal(author.previousElementSibling.className, 'chatter-labels-icons')
	author.previousElementSibling.remove()
	await setImmediate()
	assert.equal(document.querySelectorAll('.chatter-labels-icon').length, 1)
	document.querySelector('a').href = '?c=test#456'
	author.textContent = 'OtherName'
	await setImmediate()
	assert.equal(document.querySelector('.chatter-labels-icon'), null)
	document.querySelector('a').href = '?c=test#123'
	await setImmediate()
	assert.equal(document.querySelectorAll('.chatter-labels-icon').length, 1)
	await storage.set('labels', [{ ...storage.labels[0], enabled: false }])
	await setImmediate()
	assert.equal(document.querySelector('.chatter-labels-icon'), null)
	document.body.insertAdjacentHTML('beforeend', row('unknown'))
	await setImmediate()
	assert.equal(document.querySelectorAll('.chatter-labels-icon').length, 0)
})

test('edits the clicked author by ID inside the user card and releases subscriptions on close', async () => {
	document.body.innerHTML = row('123') + row('456', 'OtherName')
	const { storage, subscriptions } = await setup()
	const currentUser = new User({ id: '123', username: 'CurrentName', login: 'currentname' })

	await storage.set('assignments', [{ user: currentUser, label: storage.labels[0], assignedAt: '2026-11-01T00:00:00Z' }])
	document.querySelector('button.font-bold').click()
	document.body.insertAdjacentHTML('beforeend', '<div data-dialog-content role="dialog"><h2 data-dialog-title>User card</h2></div>')
	await setImmediate()
	const dialog = document.querySelector('[data-dialog-content]')
	const popup = dialog.querySelector('.chatter-labels-popup')

	assert.ok(popup)
	assert.equal(popup.getAttribute('aria-label'), 'Labels for CurrentName')
	assert.equal(popup.querySelector('input[name="label"]').checked, true)
	assert.equal(storage.assignments[0].user, currentUser)
	popup.querySelector('input[name="comment"]').value = 'Recognized in old logs'
	popup.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments[0].comment, 'Recognized in old logs')
	assert.equal(storage.assignments[0].user.id, '123')
	assert.equal(storage.assignments[0].assignedAt, '2026-11-01T00:00:00Z')
	dialog.remove()
	await setImmediate()
	assert.equal(subscriptions.get('labels').size, 1)
	assert.equal(subscriptions.get('assignments').size, 1)
	integration.destroy()
	assert.equal(subscriptions.get('labels').size, 0)
	assert.equal(document.querySelector('.chatter-labels-icons'), null)
})

test('discards an editor that finishes creating after its card has closed', async () => {
	document.body.innerHTML = row('123')
	const { storage, subscriptions } = await setup()
	let finish
	const originalGet = storage.get.bind(storage)

	storage.get = key => new Promise(resolve => {
		finish = () => resolve(originalGet(key))
	})
	document.querySelector('button.font-bold').click()
	document.body.insertAdjacentHTML('beforeend', '<div data-dialog-content><h2 data-dialog-title>User card</h2></div>')
	await setImmediate()
	document.querySelector('[data-dialog-content]').remove()
	await setImmediate()
	storage.get = originalGet
	finish()
	await setImmediate()
	assert.equal(document.querySelector('.chatter-labels-control'), null)
	assert.equal(subscriptions.get('labels').size, 1)
})

test('adds and removes labels for an unassigned historical author without guessing a login', async () => {
	document.body.innerHTML = row('123')
	const { storage } = await setup()

	document.querySelector('button.font-bold').click()
	document.body.insertAdjacentHTML('beforeend', '<div data-dialog-content><h2 data-dialog-title>User card</h2></div>')
	await setImmediate()
	const form = document.querySelector('.chatter-labels form')

	form.querySelector('[name="label"]').click()
	form.dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments[0].user.id, '123')
	assert.equal(storage.assignments[0].user.username, 'HistoricalName')
	assert.equal(storage.assignments[0].user.login, undefined)
	assert.equal(document.querySelectorAll('.chatter-labels-icon').length, 1)
	form.querySelector('[name="label"]').click()
	form.dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments.length, 0)
	assert.equal(document.querySelector('.chatter-labels-icon'), null)
})
