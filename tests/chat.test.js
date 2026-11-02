import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { beforeEach, afterEach, mock, test } from 'node:test'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM()

for (const name of ['document', 'Node', 'MutationObserver', 'DOMParser']) {
	globalThis[name] = window[name]
}

globalThis.chrome = {
	runtime: {
		id: 'test-extension',
		getURL: path => new URL(`../${path}`, import.meta.url)
	}
}

const fetchMock = mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)))
const { Chat } = await import('../scripts/content/chat.js')

fetchMock.mock.restore()

let chats, storage, subscriptions

const messageHTML = userId => `
	<div class="chat-line__message" data-user-id="${userId}">
		<div class="chat-line__message-container">
			<span class="chat-line__message--badges"></span>
			<span class="chat-line__username" role="button">User ${userId}</span>
			<span class="message">Hello</span>
		</div>
	</div>
`

const attach = html => {
	const wrapper = document.createElement('div')

	wrapper.innerHTML = html
	document.body.append(wrapper)
	for (const chat of chats) chat.attachIfNeeded(wrapper)
	return wrapper
}

beforeEach(async () => {
	subscriptions = new Map()
	storage = {
		labels: [{ id: 'label', enabled: true, name: 'Label', icon: 'https://example.com/icon.png' }],
		assignments: [{ user: { id: '1' }, label: { id: 'label' } }],
		get(key) {
			return this[key]
		},
		subscribe(key, callback) {
			if (!subscriptions.has(key)) subscriptions.set(key, [])
			subscriptions.get(key).push(callback)
		}
	}
	chats = await Chat.createAll(storage)
})

afterEach(() => {
	for (const chat of chats) chat.destroy()
	document.body.replaceChildren()
})

test('renders labels in an already open thread and the main chat without duplicates', () => {
	document.body.innerHTML = `
		<div class="chat-scrollable-area__message-container">${messageHTML('1')}</div>
		<div class="chat-input-tray__open">${messageHTML('1')}</div>
	`
	for (const chat of chats) {
		chat.attachIfNeeded(document.body)
		chat.attachIfNeeded(document.body)
		chat.refresh()
	}

	for (const message of document.querySelectorAll('.chat-line__message')) {
		assert.equal(message.querySelectorAll('.chatter-labels-icon').length, 1)
		assert.equal(message.querySelector('.chat-line__username').previousElementSibling
			.className, 'chatter-labels-icons')
	}
})

test('observes replies, switching threads, and reopening the reply tray', async () => {
	const wrapper = attach(`<div class="chat-input-tray__open">${messageHTML('1')}</div>`)
	const tray = wrapper.firstElementChild

	tray.insertAdjacentHTML('beforeend', messageHTML('1'))
	await setImmediate()
	assert.equal(tray.querySelectorAll('.chatter-labels-icon').length, 2)

	tray.innerHTML = messageHTML('2')
	await setImmediate()
	assert.equal(tray.querySelectorAll('.chatter-labels-icon').length, 0)

	tray.innerHTML = messageHTML('1')
	await setImmediate()
	assert.equal(tray.querySelectorAll('.chatter-labels-icon').length, 1)

	wrapper.remove()
	for (const chat of chats) chat.detachIfNeeded(wrapper)
	const reopened = attach(`<div class="chat-input-tray__open">${messageHTML('1')}</div>`)

	assert.equal(reopened.querySelectorAll('.chatter-labels-icon').length, 1)
})

test('renders each author independently in the thread parent and reply list', () => {
	const wrapper = attach(`
		<div class="chat-input-tray__open">
			<div class="font-scale--default">
				<div data-test-selector="parent">${messageHTML('1')}</div>
			</div>
			<div class="base-chat-replies-list chat-replies-list">
				<div class="scrollable-area">
					<div class="chat-replies-border" data-test-selector="replies">
						<div class="reply-list-item">${messageHTML('2')}</div>
						<div class="reply-list-item">${messageHTML('1')}</div>
					</div>
				</div>
			</div>
		</div>
	`)

	assert.equal(wrapper.querySelector('[data-test-selector="parent"] img').alt, 'Label')
	const replies = wrapper.querySelectorAll('.reply-list-item')

	assert.equal(replies[0].querySelector('.chatter-labels-icons'), null)
	assert.equal(replies[1].querySelector('img').alt, 'Label')
	for (const callback of subscriptions.get('assignments')) {
		callback([{ user: { id: '2' }, label: { id: 'label' } }])
	}
	assert.equal(wrapper.querySelector('[data-test-selector="parent"] img'), null)
	assert.equal(replies[0].querySelector('img').alt, 'Label')
	assert.equal(replies[1].querySelector('.chatter-labels-icons'), null)
})

test('updates thread labels when labels or assignments change', () => {
	const wrapper = attach(`<div class="chat-input-tray__open">${messageHTML('1')}</div>`)
	const update = (key, value) => {
		for (const callback of subscriptions.get(key)) callback(value)
	}

	assert.equal(wrapper.querySelectorAll('.chatter-labels-icon').length, 1)
	update('labels', [{ ...storage.labels[0], name: 'Renamed' }])
	assert.equal(wrapper.querySelector('img').title, 'Renamed')
	update('labels', [{ ...storage.labels[0], enabled: false }])
	assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
	update('labels', storage.labels)
	assert.equal(wrapper.querySelectorAll('.chatter-labels-icon').length, 1)
	update('assignments', [])
	assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
	update('assignments', storage.assignments)
	assert.equal(wrapper.querySelectorAll('.chatter-labels-icon').length, 1)
	update('labels', [])
	assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
})
