import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { afterEach, mock, test } from 'node:test'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('', { url: 'https://www.twitch.tv/one' })

for (const name of ['document', 'Node', 'Event', 'MutationObserver', 'DOMParser']) {
	globalThis[name] = window[name]
}
globalThis.chrome = { runtime: { id: 'test', getURL: path => new URL(`../${path}`, import.meta.url) } }
const fetchMock = mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)))
const { Profile } = await import('../scripts/content/profile.js')
const { ChatterCard } = await import('../scripts/content/chatter-card.js')
const { TwitchAPI } = await import('../scripts/twitch/api.js')
const { User } = await import('../scripts/models/user.js')
const { LabelsElement } = await import('../scripts/content/labels-element.js')

fetchMock.mock.restore()
let profile

afterEach(() => {
	profile?.destroy()
	ChatterCard.destroyAll()
	document.body.replaceChildren()
	mock.restoreAll()
})

const setup = () => {
	const subscriptions = new Map()
	const storage = {
		labels: [{ id: 'friend', name: 'Friend', icon: 'https://example.com/icon.png', enabled: true }],
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
	mock.method(TwitchAPI, 'fetchUsers', async ([login]) => [{ id: login, login, displayName: login }])
	mock.method(TwitchAPI, 'fetchUser', async login => ({ id: login, login, displayName: login }))
	document.body.innerHTML = '<div><a href="/one"><h1>One</h1></a></div>'
	profile = new Profile(storage)
	return { storage, subscriptions }
}

const createCard = async storage => {
	const element = document.createElement('div')

	element.innerHTML = `
		<div class="viewer-card-header__background"></div>
		<div class="viewer-card-header__display-name"><a href="/two">Two</a></div>
	`
	document.body.append(element)
	await ChatterCard.create(element, storage)
	return element
}

test('disables label checkboxes throughout saving, including storage rerenders', async () => {
	const { storage } = setup()
	const editor = await LabelsElement.create(new User({ id: 'one', login: 'one' }), storage)
	const form = editor.element.querySelector('form')
	const button = form.querySelector('button[type="submit"]')
	const originalSet = storage.set.bind(storage)
	let finish
	const saving = mock.method(storage, 'set', async (key, value) => {
		await new Promise(resolve => {
			finish = resolve
		})
		await originalSet(key, value)
		assert.equal(form.querySelector('input').disabled, true)
	})

	try {
		form.querySelector('input').checked = true
		form.dispatchEvent(new Event('submit', { cancelable: true }))
		assert.equal(button.disabled, true)
		assert.equal(form.querySelector('input').disabled, true)
		form.querySelector('input').click()
		assert.equal(form.querySelector('input').checked, true)
		form.dispatchEvent(new Event('submit', { cancelable: true }))
		assert.equal(saving.mock.callCount(), 1)
		finish()
		await setImmediate()
		assert.equal(button.disabled, false)
		assert.equal(form.querySelector('input').disabled, false)
		assert.equal(form.querySelector('input').checked, true)
		form.querySelector('input').click()
		assert.equal(form.querySelector('input').checked, false)
	} finally {
		editor.unsubscribe()
	}
})

test('shares compact labels and independent popovers between cards and profiles', async () => {
	const { storage, subscriptions } = setup()

	await setImmediate()
	const card = await createCard(storage)
	const trigger = card.querySelector('button[popovertarget]')
	const popup = document.getElementById(trigger?.getAttribute('popovertarget'))
	const profileTrigger = document.querySelector('.chatter-labels-control button')

	assert.ok(popup)
	assert.notEqual(popup.id, profileTrigger.getAttribute('popovertarget'))
	assert.equal(card.querySelector('form'), null)
	assert.match(trigger.textContent, /No labels/)
	popup.querySelector('input').checked = true
	popup.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments[0].user.id, 'two')
	assert.match(trigger.textContent, /Friend/)
	assert.match(profileTrigger.textContent, /No labels/)
	let escapedToCard = false

	mock.method(popup, 'matches', selector => selector === ':popover-open')
	popup.hidePopover = () => {}
	card.addEventListener('keydown', () => {
		escapedToCard = true
	})
	trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
	assert.equal(escapedToCard, false)
	assert.equal(document.activeElement, trigger)
	card.remove()
	await setImmediate()
	assert.equal(popup.isConnected, false)
	assert.equal(subscriptions.get('assignments').size, 2)
})

test('does not attach a card editor after the card is removed during loading', async () => {
	const { storage, subscriptions } = setup()

	await setImmediate()
	let resolve

	mock.method(TwitchAPI, 'fetchUser', () => new Promise(done => {
		resolve = done
	}))
	const element = document.createElement('div')

	element.innerHTML = '<div class="viewer-card-header__display-name"><a href="/late">Late</a></div>'
	document.body.append(element)
	const creating = ChatterCard.create(element, storage)

	element.remove()
	resolve({ id: 'late', login: 'late', displayName: 'Late' })
	await creating
	assert.equal(subscriptions.get('assignments').size, 2)
	assert.equal(document.querySelectorAll('[popover]').length, 1)
})

test('shows and edits saved labels on a suspended account with a disabled name button', async () => {
	const { storage } = setup()

	await setImmediate()
	const user = new User({ id: '52608844', login: 'olegsvs', username: 'olegsvs' })

	await storage.set('assignments', [{ user, label: storage.labels[0] }])
	const lookup = mock.method(TwitchAPI, 'fetchUser', async () => ({
		id: user.id, login: user.login, displayName: user.username
	}))
	const card = document.createElement('div')

	card.innerHTML = `
		<div class="viewer-card-header__background"></div>
		<div class="viewer-card-header__display-name"><h4><button disabled>olegsvs</button></h4></div>
	`
	document.body.append(card)
	await ChatterCard.create(card, storage)
	assert.deepEqual(lookup.mock.calls[0].arguments, ['olegsvs'])
	assert.equal(card.dataset.userId, user.id)
	const trigger = card.querySelector('button[popovertarget]')
	const popup = document.getElementById(trigger.getAttribute('popovertarget'))

	assert.match(trigger.textContent, /Friend/)
	assert.equal(popup.querySelector('input').checked, true)
	popup.querySelector('input').checked = false
	popup.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments.length, 0)
	assert.match(trigger.textContent, /No labels/)
	popup.querySelector('input').checked = true
	popup.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments[0].user.id, user.id)
	assert.match(trigger.textContent, /Friend/)
})

test('shows an empty summary, assigns and removes labels through the shared editor', async () => {
	const { storage } = setup()

	await setImmediate()
	const summary = document.querySelector('.chatter-labels-control button')

	assert.match(summary.textContent, /No labels/)
	const checkbox = document.querySelector('input[name="label"]')

	checkbox.checked = true
	document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments[0].user.id, 'one')
	assert.equal(summary.querySelector('img').alt, '')
	assert.match(summary.textContent, /Friend/)
	document.querySelector('input[name="label"]').checked = false
	document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments.length, 0)
	assert.match(summary.textContent, /No labels/)
})

test('replaces the editor on reused profile headers and cleans up subscriptions', async () => {
	const { storage, subscriptions } = setup()

	await setImmediate()
	const anchor = document.querySelector('a')

	anchor.href = '/two'
	profile.refresh()
	await setImmediate()
	assert.equal(document.querySelectorAll('.chatter-labels-control').length, 1)
	document.querySelector('input').checked = true
	document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments[0].user.id, 'two')
	assert.equal(subscriptions.get('assignments').size, 2)
	anchor.parentElement.remove()
	profile.refresh()
	assert.equal(subscriptions.get('assignments').size, 0)
})

test('ignores late user lookups after navigation and teardown', async () => {
	setup()
	let resolve

	mock.method(TwitchAPI, 'fetchUsers', () => new Promise(done => {
		resolve = done
	}))
	document.querySelector('a').href = '/late'
	profile.refresh()
	profile.destroy()
	resolve([new User({ id: 'late', username: 'Late', login: 'late' })])
	await setImmediate()
	assert.equal(document.querySelector('.chatter-labels-control'), null)
})

test('places live labels after stream information without splitting the existing header', async () => {
	setup()
	document.body.innerHTML = `
		<div><div class="metadata-layout__support">
			<div><a href="/live"><h1>Live</h1></a><span class="verified">Verified</span></div>
			<button>Subscribe</button>
		</div><div class="stream-info">
			<p class="stream-title">Stream title</p>
			<a href="/directory/category/game">Game</a><span>Tag</span>
		</div></div>
	`
	profile.refresh()
	await setImmediate()
	const support = document.querySelector('.metadata-layout__support')

	assert.equal(support.querySelector('.chatter-labels-control'), null)
	assert.equal(support.nextElementSibling.className, 'stream-info')
	assert.equal(document.querySelector('.stream-info').nextElementSibling.className, 'chatter-labels-control')
	assert.equal(document.querySelector('a').nextElementSibling.className, 'verified')
})

test('opens the shared editor in a native popover outside the profile layout and removes it on teardown', async () => {
	setup()
	await setImmediate()
	const trigger = document.querySelector('.chatter-labels-control button')
	const popup = document.getElementById(trigger?.getAttribute('popovertarget'))

	assert.ok(popup)
	assert.equal(popup.getAttribute('popover'), 'auto')
	assert.equal(popup.getAttribute('role'), 'dialog')
	assert.equal(popup.parentElement, document.body)
	assert.equal(document.querySelector('.chatter-labels-control form'), null)
	assert.ok(popup.querySelector('form'))
	assert.equal(popup.querySelector('[popovertargetaction="hide"]').getAttribute('popovertarget'), popup.id)
	let hidden = false

	mock.method(popup, 'matches', selector => selector === ':popover-open')
	popup.hidePopover = () => {
		hidden = true
	}
	document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
	assert.equal(hidden, true)
	assert.equal(document.activeElement, trigger)
	profile.destroy()
	assert.equal(popup.isConnected, false)
})

test('retries a temporary lookup failure without duplicate requests or subscriptions', async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const { subscriptions } = setup()
	let attempts = 0
	const lookup = mock.method(TwitchAPI, 'fetchUsers', async ([login]) => {
		if (++attempts === 1) throw new Error('Temporary failure')
		return [{ id: login, login, displayName: login }]
	})

	mock.method(console, 'error', () => {})
	document.querySelector('a').href = '/retry'
	profile.refresh()
	await setImmediate()
	for (let i = 0; i < 10; i++) profile.refresh()
	assert.equal(lookup.mock.callCount(), 1)
	t.mock.timers.tick(1000)
	await setImmediate()
	assert.equal(lookup.mock.callCount(), 2)
	assert.equal(document.querySelectorAll('.chatter-labels-control').length, 1)
	assert.equal(subscriptions.get('assignments').size, 2)
})

test('cancels scheduled retries when navigating away or destroying the profile', async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	setup()
	const lookup = mock.method(TwitchAPI, 'fetchUsers', async () => {
		throw new Error('Offline')
	})

	mock.method(console, 'error', () => {})
	document.querySelector('a').href = '/offline'
	profile.refresh()
	await setImmediate()
	document.body.replaceChildren()
	profile.refresh()
	t.mock.timers.tick(30000)
	await setImmediate()
	assert.equal(lookup.mock.callCount(), 1)
	assert.equal(document.querySelector('.chatter-labels-popup'), null)
})

test('ignores unrelated mutations and follows replaced or reused profile headers', async t => {
	setup()
	await setImmediate()
	const observer = new MutationObserver(mutations => profile.handleMutations(mutations))

	t.after(() => observer.disconnect())
	observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] })
	const search = mock.method(document, 'querySelector')
	const chat = document.createElement('div')

	document.body.append(chat)
	for (let i = 0; i < 20; i++) {
		chat.innerHTML = `<a href="/other">Message ${i}</a>`
		await setImmediate()
	}
	assert.equal(search.mock.callCount(), 0)
	const anchor = document.querySelector('a:has(h1)')

	anchor.href = '/two'
	await setImmediate()
	assert.equal(document.querySelector('.chatter-labels-popup').getAttribute('aria-label'), 'Labels for two')
	anchor.parentElement.innerHTML = '<a href="/three"><h1>Three</h1></a>'
	await setImmediate()
	assert.equal(document.querySelectorAll('.chatter-labels-control').length, 1)
	assert.equal(document.querySelector('.chatter-labels-popup').getAttribute('aria-label'), 'Labels for three')
})

test('keeps the pencil element when assignments change', async () => {
	const { storage } = setup()

	await setImmediate()
	const pencil = document.querySelector('.chatter-labels-edit')

	document.querySelector('input').checked = true
	document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
	await setImmediate()
	assert.equal(storage.assignments.length, 1)
	assert.equal(document.querySelector('.chatter-labels-edit'), pencil)
})

test('discovers a header when its login arrives after the heading', async t => {
	setup()
	await setImmediate()
	document.querySelector('a').setAttribute('href', '')
	profile.refresh()
	const observer = new MutationObserver(mutations => profile.handleMutations(mutations))

	t.after(() => observer.disconnect())
	observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['href'] })
	document.querySelector('a').href = '/loaded'
	await setImmediate()
	assert.equal(document.querySelector('.chatter-labels-popup')?.getAttribute('aria-label'), 'Labels for loaded')
})
