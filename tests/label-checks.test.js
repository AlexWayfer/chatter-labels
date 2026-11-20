import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { test, mock, afterEach } from 'node:test'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { Label } from '../scripts/models/label.js'

const { window } = new JSDOM('', { url: 'https://www.twitch.tv/example' })

for (const name of ['document', 'DOMParser', 'Event']) globalThis[name] = window[name]
const messageListeners = new Set()
globalThis.chrome = { runtime: {
	id: 'test',
	getURL: path => new URL(`../${path}`, import.meta.url),
	onMessage: {
		addListener: listener => messageListeners.add(listener),
		removeListener: listener => messageListeners.delete(listener)
	}
} }
const fetchMock = mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)))
const { LabelsElement } = await import('../scripts/content/labels-element.js')

fetchMock.mock.restore()
afterEach(() => mock.restoreAll())

function checkRuntime(runner, sender, runtime = {}) {
	return {
		...runtime,
		connect({ name }) {
			const messages = new Set()
			const disconnects = new Set()
			const port = {
				name,
				sender,
				onDisconnect: { addListener() {} },
				postMessage: message => queueMicrotask(() => messages.forEach(listener => listener(message))),
				disconnect: () => queueMicrotask(() => disconnects.forEach(listener => listener()))
			}

			queueMicrotask(() => runner.connect(port))
			return {
				onMessage: {
					addListener: listener => messages.add(listener),
					removeListener: listener => messages.delete(listener)
				},
				onDisconnect: { addListener: listener => disconnects.add(listener) }
			}
		}
	}
}

test('round-trips check scripts and supports labels saved before scripts existed', () => {
	assert.equal(new Label({ id: 'old' }).script, '')
	const label = new Label({ id: 'new', script: 'return await Promise.resolve(false)' })

	assert.equal(new Label(label.toJSON()).script, label.script)
})

test('checks replace the button with results and allow retries only after errors', async () => {
	let finish
	const send = mock.fn(() => new Promise(resolve => {
		finish = resolve
	}))

	chrome.runtime.sendMessage = send
	const storage = {
		labels: [new Label({ id: 'check', name: 'Check', script: 'return false' }), new Label({ id: 'manual' })],
		assignments: [],
		get(key) {
			return this[key]
		},
		set: mock.fn(),
		subscribe() {
			return () => {}
		}
	}
	const user = { id: '42', login: 'example', username: 'Example' }
	for (const [reply, text] of [
		[{ ok: true, value: false }, 'No'],
		[{ ok: true, value: true }, 'Yes'],
		[{ ok: true, value: null }, 'Unknown'],
		[{ ok: true, value: 0 }, '0'],
		[{ ok: true, value: 12 }, '12'],
		[{ ok: true, value: '<b>Plain text</b>' }, '<b>Plain text</b>'],
		[{ ok: false, error: 'Could not authenticate' }, 'Error: Could not authenticate']
	]) {
		const editor = await LabelsElement.create(user, storage)

		document.body.append(editor.element)
		try {
			const rows = editor.element.querySelectorAll('fieldset')
			const button = rows[0].querySelector('button.check-label')
			const result = rows[0].querySelector('.check-result')
			const before = send.mock.callCount()

			assert.equal(button.textContent, 'Check')
			assert.equal(result.hidden, true)
			assert.equal(rows[1].querySelector('.chatter-labels-check').hidden, true)
			const checkbox = rows[0].querySelector('[name="label"]')

			checkbox.click()
			const comment = rows[0].querySelector('[name="comment"]')

			comment.value = 'Unsaved comment'
			button.click()
			assert.equal(button.textContent, 'Checking...')
			assert.equal(button.disabled, true)
			assert.equal(result.hidden, true, 'do not show a second checking status beside the button')
			assert.equal(button.getAttribute('aria-busy'), 'true')
			button.click()
			assert.equal(send.mock.callCount(), before + 1)
			const { requestId, ...request } = send.mock.calls.at(-1).arguments[0]

			assert.ok(requestId)
			assert.deepEqual(request, {
				type: 'run-label-check', labelId: 'check', user, source: null, pageUrl: 'https://www.twitch.tv/example'
			})
			finish(reply)
			await setImmediate()
			assert.equal(result.textContent, text)
			assert.equal(result.hidden, false)
			assert.equal(result.children.length, 0)
			assert.equal(button.hidden, reply.ok)
			assert.equal(checkbox.checked, true)
			assert.equal(comment.value, 'Unsaved comment')
			assert.equal(storage.set.mock.callCount(), 0)
			if (!reply.ok) assert.equal(button.textContent, 'Retry')
			button.click()
			if (reply.ok) {
				assert.equal(send.mock.callCount(), before + 1, 'a completed check cannot be run twice')
			} else {
				assert.equal(send.mock.callCount(), before + 2)
				assert.equal(button.textContent, 'Checking...')
				assert.equal(result.hidden, true, 'retry hides the previous error')
				finish({ ok: true, value: false })
				await setImmediate()
				assert.equal(result.textContent, 'No')
				assert.equal(button.hidden, true)
			}
		} finally {
			editor.unsubscribe()
			editor.element.remove()
		}
	}
})

test('shows current BestLogs request only on the matching check button', async () => {
	const pending = []
	chrome.runtime.sendMessage = request => new Promise(resolve => pending.push({ request, resolve }))
	const storage = {
		labels: ['first', 'second'].map(id => new Label({ id, script: 'return false' })),
		assignments: [],
		get(key) {
			return this[key]
		},
		subscribe() {
			return () => {}
		}
	}
	const editor = await LabelsElement.create({ id: '42' }, storage)
	const [first, second] = editor.element.querySelectorAll('.check-label')
	const publish = (requestId, sequence, request, total, checked, count, id = 'test') => {
		for (const listener of messageListeners) {
			listener({ type: 'label-check-progress', requestId, sequence, request, total, checked, count }, { id })
		}
	}

	first.click()
	second.click()
	try {
		const [firstCheck, secondCheck] = pending
		const { requestId } = firstCheck.request

		assert.equal(first.getAttribute('aria-busy'), 'true')
		assert.notEqual(requestId, secondCheck.request.requestId)
		const [firstProgress, secondProgress] = editor.element.querySelectorAll('.check-result')

		publish(requestId, 1, 1, 3, 0, 0, 'other-extension')
		assert.equal(first.textContent, 'Checking...')
		publish(requestId, 1, 1, 3, 0, 0)
		assert.equal(first.textContent, '1/3')
		assert.equal(firstProgress.textContent, '0 of 0 candidates')
		publish(requestId, 3, 3, 4, 14, 5)
		publish(requestId, 2, 2, 3, 8, 2)
		assert.equal(first.textContent, '3/4')
		assert.equal(firstProgress.textContent, '5 of 14 candidates')
		assert.equal(secondProgress.hidden, true)
		assert.equal(second.textContent, 'Checking...')
		firstCheck.resolve({ ok: false, error: 'Failed' })
		await setImmediate()
		assert.equal(first.textContent, 'Retry')
		assert.equal(firstProgress.textContent, 'Error: Failed')
		assert.equal(first.getAttribute('aria-busy'), 'false')
		first.click()
		publish(requestId, 4, 4, 4, 15, 5)
		assert.equal(first.textContent, 'Checking...')
	} finally {
		for (const check of pending) check.resolve({ ok: true, value: false })
		await setImmediate()
		editor.unsubscribe()
	}
})

test('Stop preserves the partial result and messages and allows a fresh check', async () => {
	let finish
	const send = mock.fn(message => {
		if (message.type === 'cancel-label-check') {
			finish({
				ok: false,
				code: 'label-check-cancelled',
				partial: { text: '1 of 3 candidates', messages: [{ text: 'я видела', id: 'one' }] }
			})
			return Promise.resolve({ ok: true })
		}
		return new Promise(resolve => {
			finish = resolve
		})
	})

	chrome.runtime.sendMessage = send
	const editor = await LabelsElement.create({ id: '42' }, {
		get(key) {
			return key === 'labels' ? [new Label({ id: 'check', script: 'return false' })] : []
		},
		subscribe: () => () => {}
	})
	const button = editor.element.querySelector('.check-label')
	const cancel = editor.element.querySelector('.cancel-check')
	const result = editor.element.querySelector('.check-result')

	try {
		assert.equal(cancel.hidden, true)
		button.click()
		assert.equal(cancel.hidden, false)
		assert.equal(cancel.textContent, 'Stop')
		cancel.click()
		await setImmediate()
		const { requestId } = send.mock.calls[0].arguments[0]

		assert.deepEqual(send.mock.calls[1].arguments[0], { type: 'cancel-label-check', requestId })
		assert.equal(result.textContent, '1 of 3 candidates')
		assert.equal(editor.element.querySelector('.check-messages summary').textContent, 'Messages (1)')
		assert.equal(editor.element.querySelector('.check-messages li p').textContent, 'я видела')
		assert.equal(result.classList.contains('error'), false)
		assert.equal(cancel.hidden, true)
		assert.equal(button.textContent, 'Check')
		button.click()
		assert.notEqual(send.mock.calls[2].arguments[0].requestId, requestId)
		finish({ ok: true, value: true })
		await setImmediate()
		assert.equal(result.textContent, 'Yes')
	} finally {
		finish?.({ ok: true, value: false })
		await setImmediate()
		editor.unsubscribe()
	}
})

test('runner executes stored code in a user-script world and returns async values', async () => {
	const { LabelCheckRunner } = await import('../scripts/label-checks/runner.js')
	const label = new Label({ id: 'check', script: 'return await Promise.resolve(user.login === "example")' })
	const storage = { get: async () => [label] }
	let injection

	chrome.userScripts = {
		async getScripts() {
			return []
		},
		async configureWorld() {},
		async execute(options) {
			injection = options
			const runtime = checkRuntime(runner, sender)

			return [{ result: await runInNewContext(options.js[0].code, { AbortSignal, AbortController, chrome: { runtime } }) }]
		}
	}
	const runner = new LabelCheckRunner(storage)
	const sender = { id: 'test', tab: { id: 7 }, frameId: 0, documentId: 'document-one', url: 'https://www.twitch.tv/example' }
	const request = { labelId: 'check', user: { id: '42', login: 'example', username: 'Example' } }

	assert.equal(await runner.run(request, sender), true)
	assert.equal(injection.world, 'USER_SCRIPT')
	assert.deepEqual(injection.target, { tabId: 7, documentIds: ['document-one'] })
	label.script = 'return channel?.login ?? null'
	assert.equal(await runner.run({ ...request, source: 'chat' }, sender), 'example')
	assert.equal(await runner.run(request, sender), null, 'profile checks have no chat channel')
	assert.equal(await runner.run({ ...request, source: 'chat' }, { ...sender, url: 'https://lurkology.com/logs?c=example' }), null)
	assert.equal(
		await runner.run({ ...request, source: 'chat', pageUrl: 'https://www.twitch.tv/another' }, sender),
		'another',
		'use the URL at click time even if Chrome retains the document’s original URL'
	)
	label.script = 'return typeof twitch.gql === "function" && typeof bestLogs.countMessages === "function" && twitch.isBlockedBy === undefined'
	assert.equal(await runner.run(request, sender), true)
	label.script = 'throw new Error("Broken check")'
	await assert.rejects(runner.run(request, sender), /Broken check/)
	label.script = 'return {}'
	await assert.rejects(runner.run(request, sender), /Return true, false/)
	label.script = 'return { text: "3 of 127", messages: [{ id: "one", channelId: "99", text: "hello", timestamp: "2026-11-07T12:00:00Z", tags: { secret: "omit" } }] }'
	const detailed = await runner.run(request, sender)

	assert.equal(detailed.text, '3 of 127')
	assert.equal(detailed.messages[0].text, 'hello')
	assert.equal(detailed.messages[0].id, 'one')
	assert.equal(detailed.messages[0].channelId, '99')
	assert.equal(detailed.messages[0].tags, undefined, 'only display fields cross the result boundary')
	for (const source of [
		'return { text: "Invalid", messages: [null] }',
		'return { text: "Invalid", messages: [{ text: 3 }] }',
		'return { text: "Invalid", messages: "hello" }'
	]) {
		label.script = source
		await assert.rejects(runner.run(request, sender), /message/i)
	}
	label.script = 'return false'
	chrome.userScripts.execute = async () => [{ error: { message: 'Syntax error' } }]
	await assert.rejects(runner.run(request, sender), /Syntax error/)
	chrome.userScripts.execute = async () => []
	await assert.rejects(runner.run(request, sender), /no result/)
	chrome.userScripts.execute = async () => new Promise(() => {})
	mock.timers.enable({ apis: ['setTimeout'] })
	const pending = runner.run(request, sender)

	await setImmediate()
	mock.timers.tick(65000)
	await assert.rejects(pending, /timed out/)
	mock.timers.reset()
	delete chrome.userScripts
	await assert.rejects(runner.run(request, sender), /Allow user scripts/)
	await assert.rejects(runner.run(request, { ...sender, url: 'https://example.com' }), /Unsupported/)
	await assert.rejects(runner.run(request, { ...sender, id: 'another-extension' }), /Unsupported/)
})

test('detailed results stay cached with messages until the saved script changes', async () => {
	let value = {
		text: '3 of 127',
		messages: [
			{ id: 'one', channelId: '99', text: '<img src=x onerror=alert(1)>', timestamp: '2026-11-07T00:30:00+03:00' },
			{ text: 'Second line\nNext line' },
			{ text: 'Third', timestamp: 'not a date' }
		]
	}
	const send = mock.fn(async () => ({ ok: true, value }))

	chrome.runtime.sendMessage = send
	const subscriptions = new Map()
	const storage = {
		labels: [new Label({ id: 'check', script: 'return null' })],
		assignments: [],
		get(key) {
			return this[key]
		},
		set: mock.fn(),
		subscribe(key, callback) {
			subscriptions.set(key, callback)
			return () => subscriptions.delete(key)
		}
	}
	const editor = await LabelsElement.create({ id: '42' }, storage)

	document.body.append(editor.element)
	try {
		const button = editor.element.querySelector('.check-label')
		const checkbox = editor.element.querySelector('[name="label"]')
		const comment = editor.element.querySelector('[name="comment"]')

		checkbox.click()
		comment.value = 'Draft'
		button.click()
		await setImmediate()
		const details = editor.element.querySelector('.check-messages')

		assert.equal(editor.element.querySelector('.check-result').textContent, '3 of 127')
		assert.equal(details.hidden, false)
		assert.equal(details.open, false)
		assert.equal(details.querySelector('summary').textContent, 'Messages (3)')
		assert.equal(details.querySelectorAll('li').length, 3)
		details.querySelector('summary').click()
		assert.equal(details.open, true)
		assert.equal(details.querySelector('li p').textContent, value.messages[0].text)
		assert.equal(details.querySelector('img'), null, 'message content is never interpreted as HTML')
		assert.equal(details.querySelectorAll('time').length, 1, 'missing or invalid timestamps do not render invalid dates')
		const contextLink = details.querySelector('a')
		const url = new URL(contextLink.href)

		assert.equal(url.origin + url.pathname, 'https://lurkology.com/logs')
		assert.equal(url.searchParams.get('c'), 'id:99')
		assert.equal(url.searchParams.get('d'), '2026-11-06', 'use the UTC archive day rather than the displayed local day')
		assert.equal(url.hash, '#one')
		assert.equal(url.searchParams.has('u'), false, 'open the full channel chat, without restricting it to one author')
		assert.equal(url.searchParams.has('q'), false, 'include surrounding nonmatching messages')
		assert.equal(contextLink.target, '_blank')
		assert.equal(contextLink.rel, 'noopener noreferrer')
		assert.equal(details.querySelectorAll('a').length, 1, 'messages without context metadata stay readable without a link')
		assert.equal(send.mock.callCount(), 1, 'opening messages does not query the archive again')
		assert.equal(comment.value, 'Draft')
		assert.equal(checkbox.checked, true)
		subscriptions.get('assignments')([])
		assert.equal(editor.element.querySelector('.check-messages').open, true, 'unrelated updates preserve expanded messages')
		assert.equal(storage.set.mock.callCount(), 0)
		const completedButton = editor.element.querySelector('.check-label')

		assert.equal(completedButton.hidden, true, 'the detailed result replaces Check')
		completedButton.click()
		await setImmediate()
		assert.equal(send.mock.callCount(), 1, 'storage updates must not allow another successful check')
		subscriptions.get('labels')([new Label({ id: 'check', script: 'return false' })])
		assert.equal(editor.element.querySelector('.check-label').hidden, false)
		assert.equal(editor.element.querySelector('.check-messages').hidden, true)
		value = { text: '0 of 127', messages: [] }
		const currentComment = editor.element.querySelector('[name="comment"]')

		currentComment.value = 'Current draft'
		editor.element.querySelector('.check-label').click()
		assert.equal(editor.element.querySelector('.check-messages').hidden, true, 'the changed script starts without previous matches')
		await setImmediate()
		assert.equal(editor.element.querySelector('.check-messages').hidden, true)
		assert.equal(editor.element.querySelector('.check-messages li'), null)
		assert.equal(currentComment.value, 'Current draft')
	} finally {
		editor.unsubscribe()
		editor.element.remove()
	}
})

test('disabled scripts prompt for access while preserving manual edits and recover on retry', async () => {
	const messages = []
	let enabled = false

	chrome.runtime.sendMessage = async message => {
		messages.push(message)
		if (message.type === 'user-scripts-status') return { enabled, message: 'Turn on Allow user scripts.' }
		return { ok: true, value: true }
	}
	const storage = {
		labels: [new Label({ id: 'check', script: 'return true' })],
		assignments: [],
		get(key) {
			return this[key]
		},
		subscribe() {
			return () => {}
		}
	}
	const editor = await LabelsElement.create({ id: '42' }, storage)

	document.body.append(editor.element)
	const button = editor.element.querySelector('.check-label')
	const checkbox = editor.element.querySelector('[name="label"]')
	const comment = editor.element.querySelector('[name="comment"]')

	try {
		assert.equal(messages.length, 0, 'wait until the popup is opened')
		checkbox.click()
		comment.value = 'Draft'
		await editor.refreshScriptAccess()
		assert.equal(button.disabled, true)
		assert.equal(editor.element.querySelector('.user-scripts-notice').hidden, false)
		assert.equal(checkbox.disabled, false)
		assert.equal(comment.disabled, false)
		assert.equal(editor.element.querySelector('[type="submit"]').disabled, false)
		button.click()
		assert.equal(messages.length, 1)
		enabled = true
		await editor.refreshScriptAccess()
		assert.equal(button.disabled, false)
		assert.equal(editor.element.querySelector('.user-scripts-notice').hidden, true)
		assert.equal(comment.value, 'Draft')
		assert.equal(checkbox.checked, true)
		enabled = false
		chrome.runtime.sendMessage = async message => {
			return message.type === 'user-scripts-status'
				? { enabled, message: 'Turn on Allow user scripts.' }
				: enabled ? { ok: true, value: true } : { ok: false, code: 'user-scripts-disabled', error: 'Disabled' }
		}
		button.click()
		await setImmediate()
		assert.equal(editor.element.querySelector('.user-scripts-notice').hidden, false)
		assert.equal(button.disabled, true)
		assert.equal(comment.value, 'Draft')
		enabled = true
		await editor.refreshScriptAccess()
		assert.equal(button.textContent, 'Check')
		button.click()
		await setImmediate()
		assert.equal(editor.element.querySelector('.check-result').textContent, 'Yes')
		assert.equal(button.hidden, true)
	} finally {
		editor.unsubscribe()
		editor.element.remove()
	}
})

test('ignores stale completions after a script changes or its editor is removed', async () => {
	let finish

	chrome.runtime.sendMessage = () => new Promise(resolve => {
		finish = resolve
	})
	const storage = {
		labels: [new Label({ id: 'check', script: 'return true' })],
		assignments: [],
		get(key) {
			return this[key]
		},
		subscribe(key, callback) {
			this[key + 'Changed'] = callback
			return () => {}
		}
	}
	const editor = await LabelsElement.create({ id: '42', login: 'example' }, storage)

	document.body.append(editor.element)
	try {
		editor.element.querySelector('.check-label').click()
		storage.labelsChanged([new Label({ id: 'check', script: 'return false' })])
		finish({ ok: true, value: true })
		await setImmediate()
		assert.equal(editor.element.querySelector('.check-result').textContent, '')
		editor.element.querySelector('.check-label').click()
		editor.unsubscribe()
		editor.element.remove()
		finish({ ok: true, value: false })
		await setImmediate()
		assert.equal(editor.element.querySelector('.check-label').textContent, 'Checking...')
	} finally {
		editor.element.remove()
	}
})

test('block example distinguishes blocks, other restrictions and anonymous responses', async () => {
	const { blockedCheckScript } = await import('../scripts/label-checks/blocked-example.js')
	const { createTwitchClient } = await import('../scripts/label-checks/twitch-client.js')
	let authorization = { isForbidden: true, forbiddenReasonCode: 'UNAUTHORIZED' }
	let viewerId = 123
	let hasToken = true
	let channel = { login: 'example' }
	let request
	const context = {
		user: { id: '42', login: 'example' },
		location: { hostname: 'www.twitch.tv' },
		AbortSignal,
		signal: AbortSignal.timeout(10000),
		chrome: { runtime: { async sendMessage(message) {
			request = message
			if (message.query.includes('user(id:')) {
				assert.equal(message.variables.id, '42')
				return { ok: true, data: { user: channel } }
			}
			if (!viewerId) return { ok: false, error: 'Twitch did not authenticate this check.' }
			return {
				ok: true,
				data: {
					currentUser: viewerId ? { id: String(viewerId) } : null,
					streamPlaybackAccessToken: {
						value: hasToken ? JSON.stringify({ user_id: viewerId, channel_id: 42 }) : null,
						authorization
					}
				}
			}
		} } }
	}
	context.twitch = runInNewContext(`(${createTwitchClient.toString()})(signal)`, context)
	const run = () => runInNewContext(`(async () => {${blockedCheckScript}\n})()`, context)

	assert.equal(await run(), true)
	assert.equal(request.type, 'label-check-twitch-gql')
	assert.equal(request.authenticated, true)
	hasToken = false
	assert.equal(await run(), true, 'a blocked user may not receive a playback token')
	hasToken = true
	authorization = { isForbidden: false, forbiddenReasonCode: 'NONE' }
	assert.equal(await run(), false)
	viewerId = null
	await assert.rejects(run(), /authenticate/)
	viewerId = 123
	for (const reason of ['CHANNEL_RESTRICTED_BANNED_USER', 'GEOBLOCKED', 'FUTURE_UNKNOWN_REASON']) {
		authorization = { isForbidden: true, forbiddenReasonCode: reason }
		await assert.rejects(run(), /restricted/)
	}
	context.location.hostname = 'lurkology.com'
	authorization = { isForbidden: true, forbiddenReasonCode: 'UNAUTHORIZED' }
	delete context.user.login
	assert.equal(await run(), true)
	channel = null
	await assert.rejects(run(), /Twitch user not found/)
	channel = { login: null }
	await assert.rejects(run(), /no login/)
})

test('background requests are bound to an active check and its original tab and document', async () => {
	const { LabelCheckRunner } = await import('../scripts/label-checks/runner.js')
	let message
	let finish
	let requestSignal
	const request = mock.fn(async (payload, { signal, tabId }) => {
		requestSignal = signal
		assert.equal(tabId, 7)
		assert.equal(payload.query, '{ currentUser { id } }')
		assert.equal(payload.url, undefined)
		assert.equal(payload.headers, undefined)
		return { allowed: true }
	})
	const sender = { id: 'test', tab: { id: 7 }, frameId: 0, documentId: 'lurk-document', url: 'https://lurkology.com/logs' }
	const runtime = { sendMessage(value) {
		message = value
		return new Promise(resolve => {
			finish = resolve
		})
	} }
	chrome.userScripts = {
		async getScripts() {
			return []
		},
		configureWorld: mock.fn(async () => {}),
		async execute(options) {
			assert.equal(options.worldId, 'label-checks')
			return [{ result: await runInNewContext(options.js[0].code, {
				AbortSignal, AbortController, chrome: { runtime: checkRuntime(runner, sender, runtime) }
			}) }]
		}
	}
	const runner = new LabelCheckRunner({ get: async () => [{ id: 'check', script: 'const data = await twitch.gql("{ currentUser { id } }"); return data.allowed' }] }, { request })
	const running = runner.run({ labelId: 'check', user: { id: '42', login: 'example' } }, sender)

	await setImmediate()
	assert.ok(message.runId)
	assert.deepEqual(chrome.userScripts.configureWorld.mock.calls[0].arguments[0], { worldId: 'label-checks', messaging: true })
	await assert.rejects(runner.requestTwitch(message, { ...sender, tab: { id: 8 } }), /Unsupported/)
	await assert.rejects(runner.requestTwitch(message, { ...sender, documentId: 'new-document' }), /Unsupported/)
	await assert.rejects(runner.requestTwitch(message, { ...sender, tab: { id: 7, incognito: true } }), /Unsupported/)
	await assert.rejects(runner.requestTwitch(message, { ...sender, frameId: 1 }), /Unsupported/)
	await assert.rejects(runner.requestTwitch(message, { ...sender, url: 'https://example.com' }), /Unsupported/)
	const data = await runner.requestTwitch({ ...message, url: 'https://example.com', headers: { Authorization: 'injected' } }, sender)

	finish({ ok: true, data })
	assert.equal(await running, true)
	assert.equal(requestSignal.aborted, true)
	await assert.rejects(runner.requestTwitch(message, sender), /no longer running/)
	assert.equal(request.mock.callCount(), 1)
})

test('cancellation reaches the injected signal and an in-flight background request', async () => {
	const { LabelCheckRunner } = await import('../scripts/label-checks/runner.js')
	const sender = { id: 'test', tab: { id: 7 }, frameId: 0, documentId: 'document-one', url: 'https://www.twitch.tv/example' }
	const background = Promise.withResolvers()
	const archive = Promise.withResolvers()
	const injected = Promise.withResolvers()
	const waitForAbort = signal => new Promise((_, reject) => {
		signal.addEventListener('abort', () => reject(signal.reason), { once: true })
	})
	const runner = new LabelCheckRunner({ get: async () => [{
		id: 'check', script: 'await Promise.all([twitch.gql("{ currentUser { id } }"), fetch("https://example.test", { signal })])'
	}] }, { request: (_payload, { signal }) => {
		background.resolve(signal)
		return waitForAbort(signal)
	} })
	const request = { labelId: 'check', user: { id: '42' }, requestId: 'check-request' }
	let runId
	const runtime = checkRuntime(runner, sender, {
		sendMessage(message) {
			runId = message.runId
			return runner.requestTwitch(message, sender).then(data => ({ ok: true, data }))
		}
	})

	chrome.userScripts = {
		async getScripts() {
			return []
		},
		async configureWorld() {},
		async execute(options) {
			const result = await runInNewContext(options.js[0].code, {
				AbortSignal,
				AbortController,
				chrome: { runtime },
				fetch(_url, { signal }) {
					archive.resolve(signal)
					return waitForAbort(signal)
				}
			})

			injected.resolve(result)
			return [{ result }]
		}
	}
	const running = runner.run(request, sender)
	const rejected = assert.rejects(running, error => {
		assert.equal(error.code, 'label-check-cancelled')
		assert.equal(error.partial.text, '1 of 3 candidates')
		assert.equal(error.partial.messages[0].text, 'hello')
		return true
	})
	const [backgroundSignal, archiveSignal] = await Promise.all([background.promise, archive.promise])
	const checkMessage = {
		runId,
		sequence: 1,
		request: 1,
		total: 3,
		checked: 3,
		count: 1,
		messages: [{ text: 'hello', id: 'one', channelId: '99' }]
	}

	chrome.tabs = { sendMessage: async () => {} }
	await runner.reportProgress(checkMessage, sender)
	await runner.reportProgress({ ...checkMessage, sequence: 2, request: 2, messages: undefined }, sender)
	await runner.reportProgress({ ...checkMessage, sequence: 1, checked: 1, count: 0, messages: [] }, sender)
	runner.cancel(request, { ...sender, documentId: 'another-document' })
	assert.equal(backgroundSignal.aborted, false)
	assert.equal(archiveSignal.aborted, false)
	runner.cancel(request, sender)
	await rejected
	assert.equal(backgroundSignal.aborted, true)
	assert.equal((await injected.promise).ok, false)
	assert.equal(archiveSignal.aborted, true)
})

test('forwards BestLogs request and candidate progress across pages and empty queries', async () => {
	const { LabelCheckRunner } = await import('../scripts/label-checks/runner.js')
	const sender = { id: 'test', tab: { id: 7 }, frameId: 0, documentId: 'document-one', url: 'https://www.twitch.tv/example' }
	const send = mock.fn(async () => {})
	const progress = []
	const runner = new LabelCheckRunner({ get: async () => [{
		id: 'check', script: 'return await bestLogs.countMessages(["missing", "hello", "absent"])'
	}] }, { request: async () => ({ user: { id: '99' } }) })
	const runtime = { sendMessage: async message => {
		if (message.type === 'label-check-twitch-gql') return { ok: true, data: await runner.requestTwitch(message, sender) }
		progress.push(message)
		await assert.rejects(runner.reportProgress(message, { ...sender, documentId: 'another-document' }), /Unsupported/)
		await runner.reportProgress(message, sender)
	} }
	chrome.tabs = { sendMessage: send }
	chrome.userScripts = {
		async getScripts() {
			return []
		},
		async configureWorld() {},
		async execute(options) {
			return [{ result: await runInNewContext(options.js[0].code, {
				AbortSignal,
				AbortController,
				URL,
				URLSearchParams,
				setTimeout,
				clearTimeout,
				chrome: { runtime: checkRuntime(runner, sender, runtime) },
				async fetch(url) {
					const offset = Number(url.searchParams.get('offset'))
					const query = url.searchParams.get('q')
					const { request, total } = progress.at(-1)
					const expected = { missing: [1, 3], hello: offset ? [3, 4] : [2, 3], absent: [4, 4] }

					assert.deepEqual([request, total], expected[query])
					if (query !== 'hello') return new Response('Not found', { status: 404 })
					return Response.json({ messages: Array.from({ length: offset ? 3 : 500 }, (_, index) => ({
						id: String(offset + index),
						text: offset ? 'hello' : 'helloing',
						tags: { 'user-id': '42', 'room-id': '99' }
					})) })
				}
			}) }]
		}
	}
	const result = await runner.run({ labelId: 'check', user: { id: '42' }, source: 'chat', requestId: 'check-request' }, sender)

	assert.equal(result, 3)
	assert.deepEqual(send.mock.calls.map(call => call.arguments), [
		[1, 3, 0, 0], [2, 3, 0, 0], [2, 3, 500, 0], [3, 4, 500, 0], [3, 4, 503, 3], [4, 4, 503, 3]
	].map(([request, total, checked, count], index) => [7, {
		type: 'label-check-progress', requestId: 'check-request', sequence: index + 1, request, total, checked, count
	}, { documentId: 'document-one' }]))
	await assert.rejects(runner.reportProgress(progress[0], sender), /no longer running/)
})
