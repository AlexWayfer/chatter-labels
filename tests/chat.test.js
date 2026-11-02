import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { beforeEach, afterEach, mock, test } from 'node:test'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('', { runScripts: 'outside-only' })

window.eval(await readFile(new URL('../scripts/content/page/message-user-id.js', import.meta.url), 'utf8'))

for (const name of ['document', 'Node', 'Element', 'Event', 'MutationObserver', 'DOMParser']) {
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
const { TwitchAPI } = await import('../scripts/twitch/api.js')

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

const attach = (html, prepare = () => {}) => {
	const wrapper = document.createElement('div')

	wrapper.innerHTML = html
	prepare(wrapper)
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
	mock.restoreAll()
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

const whisperHTML = login => `
	<div class="whispers-list-item">
		<button role="listitem" data-a-target="whisper-with-${login}">
			<div><strong class="whispers-list-item__user-name">${login}</strong>
				<div class="whispers-list-item__last-message">Preview</div>
			</div>
		</button>
		<button class="whispers-list-item__archive-button">Archive Thread</button>
	</div>
`

for (const [container, usernameClass] of [
	['moderation-actions-list-item', 'moderation-actions-list-item__clickable-name'],
	['activity-base-list-item__subtitle', 'tw-link']
]) {
	test(`labels each user in ${container} and follows reused buttons`, async () => {
		const lookup = mock.method(TwitchAPI, 'fetchUsers', () => assert.fail('Unexpected user lookup'))
		const wrapper = attach(`
			<div class="${container}">
				<span><button class="${usernameClass}">One</button></span>
				<button class="${usernameClass}">Two</button>
				<button aria-label="Menu">Menu</button>
			</div>
		`, wrapper => {
			const mod = container === 'moderation-actions-list-item'
			const fragments = mod ? 'localizedStringFragments' : 'fragments'
			const id = mod ? 'id' : 'userID'
			const owner = { memoizedProps: { [mod ? 'event' : 'activity']: {
				user: { id: '2', login: 'two' },
				title: { [fragments]: [{ token: { [id]: '1', login: 'one', displayName: '名前' } }] },
				content: { [fragments]: [{ token: { [id]: '2', login: 'two', displayName: 'Two' } }] }
			} } }

			for (const button of wrapper.querySelectorAll(`.${usernameClass}`)) {
				button.__reactFiber$test = { memoizedProps: {}, return: owner }
			}
		})
		const buttons = wrapper.querySelectorAll(`.${usernameClass}`)

		assert.equal(buttons[0].previousElementSibling?.querySelector('img')?.alt, 'Label')
		assert.equal(buttons[1].previousElementSibling?.matches('.chatter-labels-icons'), false)
		buttons[0].textContent = 'Two'
		buttons[1].textContent = '名前 (one)'
		await setImmediate()
		assert.equal(buttons[0].previousElementSibling, null)
		assert.equal(buttons[1].previousElementSibling?.querySelector('img')?.alt, 'Label')
		for (const chat of chats) chat.refresh()
		assert.equal(wrapper.querySelectorAll('.chatter-labels-icons').length, 1)
		buttons[1].textContent = 'Unknown'
		await setImmediate()
		assert.equal(buttons[1].dataset.userId, undefined)
		assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
		buttons[1].textContent = '名前'
		await setImmediate()
		assert.equal(wrapper.querySelectorAll('.chatter-labels-icons').length, 1)
		for (const callback of subscriptions.get('assignments')) callback([])
		assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
		for (const callback of subscriptions.get('assignments')) callback(storage.assignments)
		assert.equal(wrapper.querySelectorAll('.chatter-labels-icons').length, 1)
		buttons[1].remove()
		await setImmediate()
		assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
		assert.equal(lookup.mock.callCount(), 0)
	})
}

test('renders whisper labels synchronously from React without user lookups', () => {
	const lookup = mock.method(TwitchAPI, 'fetchUsers', () => assert.fail('Unexpected user lookup'))
	const wrapper = attach(`
		<div class="whispers-inbox__list-items">${whisperHTML('one')}${whisperHTML('two')}</div>
	`, wrapper => {
		for (const [index, row] of wrapper.querySelectorAll('.whispers-list-item').entries()) {
			row.__reactFiber$test = { memoizedProps: { user: { id: String(index + 1) } } }
		}
	})

	const rows = wrapper.querySelectorAll('.whispers-list-item')

	assert.equal(lookup.mock.callCount(), 0)
	assert.equal(rows[0].querySelector('.whispers-list-item__user-name')
		.previousElementSibling.className, 'chatter-labels-icons')
	assert.equal(rows[0].querySelector('.whispers-list-item__last-message').textContent, 'Preview')
	assert.equal(rows[1].querySelector('.chatter-labels-icons'), null)
	for (const callback of subscriptions.get('assignments')) {
		callback([{ user: { id: '2' }, label: { id: 'label' } }])
	}
	assert.equal(rows[0].querySelector('.chatter-labels-icons'), null)
	assert.equal(rows[1].querySelector('img').alt, 'Label')
	assert.equal(lookup.mock.callCount(), 0)
})

test('refreshes React IDs when a whisper row is reused or receives delayed user data', async () => {
	const wrapper = attach(`<div class="whispers-inbox__list-items">${whisperHTML('one')}</div>`, wrapper => {
		wrapper.querySelector('.whispers-list-item').__reactFiber$test = {
			memoizedProps: { user: { id: '1' } }
		}
	})
	const list = wrapper.firstElementChild
	const row = list.firstElementChild

	assert.equal(row.querySelectorAll('.chatter-labels-icon').length, 1)
	row.__reactFiber$test.memoizedProps = { user: { id: '2' } }
	row.querySelector('[role="listitem"]').dataset.aTarget = 'whisper-with-two'
	await setImmediate()
	assert.equal(row.querySelector('.chatter-labels-icons'), null)
	row.__reactFiber$test.memoizedProps = {}
	row.querySelector('.whispers-list-item__user-name').textContent = 'Pending'
	await setImmediate()
	assert.equal(row.dataset.userId, undefined)
	row.__reactFiber$test.memoizedProps = { user: { id: '1' } }
	row.querySelector('.whispers-list-item__user-name').textContent = '名前'
	await setImmediate()
	assert.equal(row.querySelectorAll('.chatter-labels-icon').length, 1)
})

const whisperMessageHTML = username => `
	<div class="thread-message__message"><div>
		<span class="thread-message__message--user-name">${username}</span>
		<span>: </span><span class="message">Hello</span>
	</div></div>
`

test('clears event IDs when props disappear and rejects conflicting tokens or unrelated ancestors', () => {
	const token = { userID: '1', login: 'one', displayName: 'One' }
	const wrapper = attach('<div class="activity-base-list-item__subtitle"><button class="tw-link">One</button></div>', wrapper => {
		wrapper.querySelector('button').__reactFiber$test = { memoizedProps: {
			activity: { title: { fragments: [{ token }] } }
		} }
	})
	const button = wrapper.querySelector('button')
	const fiber = button.__reactFiber$test

	assert.equal(button.dataset.userId, '1')
	fiber.return = { memoizedProps: {
		user: { id: '1' }, activity: { title: { fragments: [{ token }] } }
	} }
	fiber.memoizedProps.activity = {}
	for (const chat of chats) chat.refresh()
	assert.equal(button.dataset.userId, undefined)
	assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
	fiber.memoizedProps.activity = null
	for (const chat of chats) chat.refresh()
	assert.equal(button.dataset.userId, undefined)
	fiber.memoizedProps.activity = { title: { fragments: [
		{ token }, { token: { ...token, userID: '2' } }
	] } }
	for (const chat of chats) chat.refresh()
	assert.equal(button.dataset.userId, undefined)
	assert.equal(wrapper.querySelector('.chatter-labels-icons'), null)
	fiber.memoizedProps.activity = { title: { fragments: [null, { token }, { token }] } }
	for (const chat of chats) chat.refresh()
	assert.equal(button.dataset.userId, '1')
})

test('labels the whisper header and each message author independently', async () => {
	const lookup = mock.method(TwitchAPI, 'fetchUsers', () => assert.fail('Unexpected user lookup'))
	const wrapper = attach(`
		<div class="whispers__thread">
			<div class="whispers__header"><button class="tw-interactable"><div>
				<p>One</p><svg></svg>
			</div></button></div>
			<div class="whispers__messages">
				${whisperMessageHTML('One')}${whisperMessageHTML('Self')}
			</div>
		</div>
	`, wrapper => {
		wrapper.querySelector('.whispers__header').__reactFiber$test = {
			memoizedProps: { data: {
				currentUser: { id: '2' },
				whisperThread: { participants: [{ id: '1' }, { id: '2' }] }
			} }
		}
		for (const [index, message] of wrapper.querySelectorAll('.thread-message__message').entries()) {
			message.__reactFiber$test = { memoizedProps: { message: { from: String(index + 1) } } }
		}
	})

	assert.equal(lookup.mock.callCount(), 0)
	assert.equal(wrapper.querySelector('.whispers__header p').previousElementSibling
		.className, 'chatter-labels-icons')
	const messages = wrapper.querySelectorAll('.thread-message__message')

	assert.equal(messages[0].querySelectorAll('.chatter-labels-icon').length, 1)
	assert.equal(messages[1].querySelector('.chatter-labels-icons'), null)
	wrapper.querySelector('.whispers__messages').insertAdjacentHTML('beforeend', whisperMessageHTML('One'))
	wrapper.querySelector('.thread-message__message:last-child').__reactFiber$test = {
		memoizedProps: { message: { from: '1' } }
	}
	await setImmediate()
	assert.equal(wrapper.querySelectorAll('.chatter-labels-icon').length, 3)
	const headerName = wrapper.querySelector('.whispers__header p')

	wrapper.querySelector('.whispers__header').__reactFiber$test.memoizedProps = {
		data: { currentUser: { id: '2' }, whisperThread: { participants: [{ id: '2' }, { id: '3' }] } }
	}
	headerName.firstChild.data = 'Self'
	await setImmediate()
	assert.equal(wrapper.querySelector('.whispers__header .chatter-labels-icons'), null)
	assert.equal(lookup.mock.callCount(), 0)
})

test('labels the regular whispers inbox and multiple floating dialogs independently', () => {
	const wrapper = attach(`
		<div class="whispers-threads-box__scrollable-area">${whisperHTML('One')}</div>
		${['One', 'Other'].map(name => `
			<div class="whispers-thread">
				<div class="thread-header"><button><span id="whisper-thread-header-name-${name}">${name}</span></button></div>
				${whisperMessageHTML(name)}${whisperMessageHTML('Self')}
			</div>
		`).join('')}
	`, wrapper => {
		wrapper.querySelector('.whispers-list-item').__reactFiber$test = {
			memoizedProps: { user: { id: '1' } }
		}
		for (const [index, dialog] of wrapper.querySelectorAll('.whispers-thread').entries()) {
			const id = index === 0 ? '1' : '3'

			dialog.querySelector('.thread-header').__reactFiber$test = { memoizedProps: {
				currentUser: { id: '2', displayName: 'Self' },
				interlocutor: { id, displayName: index === 0 ? 'One' : 'Other' }
			} }
			for (const message of dialog.querySelectorAll('.thread-message__message')) {
				message.__reactFiber$test = { memoizedProps: { participantsByID: {
					[id]: { id, displayName: index === 0 ? 'One' : 'Other' },
					self: { id: '2', displayName: 'Self' }
				} } }
			}
		}
	})

	assert.equal(wrapper.querySelector('.whispers-list-item img')?.alt, 'Label')
	const dialogs = wrapper.querySelectorAll('.whispers-thread')

	assert.equal(dialogs[0].querySelector('.thread-header img')?.alt, 'Label')
	assert.equal(dialogs[0].querySelectorAll('.thread-message__message img').length, 1)
	assert.equal(dialogs[1].querySelector('.chatter-labels-icons'), null)
})
