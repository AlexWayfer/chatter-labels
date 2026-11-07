import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { test, mock, afterEach } from 'node:test'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { Label } from '../scripts/models/label.js'

const { window } = new JSDOM('', { url: 'https://www.twitch.tv/example' })

for (const name of ['document', 'DOMParser', 'Event']) globalThis[name] = window[name]
globalThis.chrome = { runtime: { id: 'test', getURL: path => new URL(`../${path}`, import.meta.url) } }
const fetchMock = mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)))
const { LabelsElement } = await import('../scripts/content/labels-element.js')

fetchMock.mock.restore()
afterEach(() => mock.restoreAll())

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
			assert.equal(rows[1].querySelector('.label-check').hidden, true)
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
			assert.deepEqual(send.mock.calls.at(-1).arguments[0], {
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
			return [{ result: await runInNewContext(options.js[0].code, { AbortSignal }) }]
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
			return [{ result: await runInNewContext(options.js[0].code, { AbortSignal, chrome: { runtime } }) }]
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
