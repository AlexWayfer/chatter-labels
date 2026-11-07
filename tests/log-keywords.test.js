import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext as runInVm } from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import { scriptExamples } from '../scripts/label-checks/examples.js'
import { checkChannel } from '../scripts/label-checks/check-context.js'
import { createBestLogsClient } from '../scripts/label-checks/bestlogs-client.js'

function runInNewContext(source, context) {
	context.setTimeout ??= setTimeout
	context.clearTimeout ??= clearTimeout
	return runInVm(source, context)
}

test('channel context is available only for chatter cards on known Twitch channel routes', () => {
	for (const path of ['/example', '/popout/example/chat', '/embed/example/chat', '/moderator/example']) {
		assert.equal(checkChannel('chat', `https://www.twitch.tv${path}`).login, 'example')
	}
	for (const source of [undefined, 'profile', 'lurkology']) {
		assert.equal(checkChannel(source, 'https://www.twitch.tv/example'), null)
	}
	assert.equal(checkChannel('chat', 'https://www.twitch.tv/example', 'https://lurkology.com/logs'), null)
	for (const url of [
		'https://lurkology.com/logs?c=example',
		'https://www.twitch.tv/directory',
		'https://www.twitch.tv/videos/123',
		'https://www.twitch.tv/example/about',
		'https://gql.twitch.tv/example'
	]) {
		assert.equal(checkChannel('chat', url), null)
	}
})

test('log example counts unique messages by the selected author in the current channel', async () => {
	assert.equal(scriptExamples.some(example => example.id === 'live-now'), false)
	const example = scriptExamples.find(example => example.id === 'log-keywords')?.script

	assert.ok(example)
	assert.match(example, /const keywords = \[\]/)
	const script = example.replace('const keywords = []', 'const keywords = ["видела", "писала", "сделала"]')
	const message = (id, text, userId = '42', channelId = '99') => ({
		id, text, tags: { 'user-id': userId, 'room-id': channelId }
	})
	const requests = []
	let response = { messages: [
		message('one', 'Я ВИДЕЛА и писала'),
		message('two', 'я вчера сделала'),
		message('third-person', 'она сделала'),
		message('wrong-author', 'видела', '100'),
		message('wrong-channel', 'писала', '42', '100')
	] }
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async (_query, variables) => {
			assert.equal(variables.login, 'example')
			return { user: { id: '99' } }
		} },
		fetch: async (url, options) => {
			requests.push(url)
			assert.equal(options.signal, context.signal)
			return Response.json(response)
		}
	}
	const run = (source = script) => runInNewContext(`(async () => {
		const bestLogs = (${createBestLogsClient.toString()})(user, channel, twitch, signal);
		${source}
	})()`, context)

	await assert.rejects(run(example), /Add at least one/)
	assert.equal(requests.length, 0, 'the empty starter example makes no archive requests')
	assert.equal(await run(), 3, 'generic searches count every matching message regardless of grammatical person')
	assert.equal(requests.length, 3)
	assert.equal(requests[0].pathname, '/channelid/99/userid/42/search')
	assert.deepEqual(Object.fromEntries(requests[0].searchParams), { q: 'видела', jsonBasic: '1', reverse: '1', limit: '500', offset: '0' })
	assert.deepEqual(requests.map(url => url.searchParams.get('q')), ['видела', 'писала', 'сделала'])
	response = { messages: [] }
	assert.equal(await run(), 0)
	response = {}
	await assert.rejects(run(), /invalid search response/)
	context.fetch = async () => new Response('No user logs found', { status: 404 })
	await assert.rejects(run(), /No archived logs/)
	context.fetch = async () => new Response('Not found', { status: 404 })
	assert.equal(await run(), 0, 'rustlog uses a distinct 404 response for an empty search')
	context.fetch = async () => new Response('', { status: 429, headers: { 'Retry-After': '20' } })
	await assert.rejects(run(), /429/)
	context.channel = null
	requests.length = 0
	await assert.rejects(run(), /chatter card in a Twitch channel chat/)
	assert.equal(requests.length, 0)
})

test('custom filters receive matching words and metadata once per message and can be asynchronous', async () => {
	const calls = []
	const message = (id, text, timestamp, userId = '42') => ({
		id, text, timestamp, tags: { 'user-id': userId, 'room-id': '99' }
	})
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => Response.json({ messages: [
			message('accepted', 'HELLO Hey hey', '2026-11-06'),
			message('rejected', 'hey', '2020-01-01'),
			message('other-author', 'hello', '2026-11-06', '100'),
			message('unrelated', 'something else', '2026-11-06')
		] })
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const filter = async (entry, matchedWords) => {
		calls.push({ id: entry.id, words: [...matchedWords] })
		return entry.timestamp >= '2026-01-01'
	}

	assert.equal(await client.countMessages(['hello', 'hey'], { filter }), 1)
	assert.deepEqual(calls, [
		{ id: 'accepted', words: ['hello', 'hey'] },
		{ id: 'rejected', words: ['hey'] }
	])
	await assert.rejects(client.countMessages(['hello'], { filter: () => 1 }), /must return a boolean/)
	await assert.rejects(client.countMessages(['hello'], { filter: () => {
		throw new Error('Custom filter failed')
	} }), /Custom filter failed/)
})

test('detailed searches report actual unique messages checked and only accepted matches', async () => {
	const message = (id, text, userId = '42') => ({
		id, text, timestamp: '2026-11-07T12:00:00Z', tags: { 'user-id': userId, 'room-id': '99' }
	})
	let messages = [
		message('one', 'hello'),
		message('one', 'hello'),
		message('two', 'unrelated'),
		message('three', 'hello rejected'),
		message('wrong-author', 'hello', '100')
	]
	let requests = 0
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => {
			requests++
			return Response.json({ messages })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const result = await client.searchMessages(['hello'], { filter: entry => !entry.text.includes('rejected') })

	assert.equal(result.count, 1)
	assert.equal(result.checked, 3, 'ignore duplicate and foreign messages; include nonmatches and filter rejections')
	assert.equal(result.messages.length, 1)
	assert.equal(result.messages[0].text, 'hello')
	assert.equal(result.messages[0].timestamp, '2026-11-07T12:00:00Z')
	assert.equal(result.messages[0].id, 'one')
	assert.equal(result.messages[0].channelId, '99', 'retain the channel ID for a link into the full chat')
	assert.equal(requests, 1, 'details require no additional archive requests')
	messages = Array.from({ length: 127 }, (_, index) => message(String(index), index < 3 ? 'hello' : 'unrelated'))
	const small = await client.searchMessages(['hello'])

	assert.equal(small.count, 3)
	assert.equal(small.checked, 127, 'report the actual sample instead of the configured maximum')
	assert.equal(small.messages.length, 3)
	const limited = await client.searchMessages(['hello'], { limit: 2 })

	assert.equal(limited.count, 2)
	assert.equal(limited.checked, 2, 'an early match cap reports only messages actually checked')
	context.fetch = async () => new Response('Not found', { status: 404 })
	const empty = await client.searchMessages(['hello'])

	assert.equal(empty.count, 0)
	assert.equal(empty.checked, 0)
	assert.equal(empty.messages.length, 0)
})

test('moderation events in the message sample are excluded without hiding malformed chat messages', async () => {
	const tags = { 'user-id': '42', 'room-id': '99' }
	let messages = [
		{ id: 'one', text: 'hello', tags },
		{ id: '', text: 'hello has been banned', tags: { ...tags, 'target-user-id': '42' } },
		{ id: '', text: 'hello has been timed out', tags: { ...tags, 'target-user-id': '42', 'ban-duration': '60' } },
		{ id: 'delete-event', text: 'hello', tags: { ...tags, 'target-msg-id': 'deleted-message' } },
		{ id: 'two', text: 'unrelated', tags }
	]
	let requests = 0
	const filtered = []
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => {
			requests++
			return Response.json({ messages })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const result = await client.searchMessages(['hello'], { filter: message => {
		filtered.push(message.id)
		return true
	} })

	assert.equal(result.count, 1)
	assert.equal(result.checked, 2, 'moderation actions are not messages authored by the user')
	assert.equal(result.messages[0].id, 'one')
	assert.deepEqual(filtered, ['one'], 'do not pass generated moderation text to custom filters')
	assert.equal(requests, 1, 'do not fetch more records to replace moderation events')
	for (const malformed of [null, { id: '', text: 'hello', tags }, { id: 'three', text: null, tags }]) {
		messages = [malformed]
		await assert.rejects(client.searchMessages(['hello']), /invalid search response/)
	}
})

test('a match limit stops on a full page without requesting subsequent pages or keywords', async () => {
	let requests = 0
	let filtered = 0
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => {
			requests++
			return Response.json({ messages: Array.from({ length: 500 }, (_, index) => ({
				id: String(Math.floor(index / 2)), text: 'hello', tags: { 'user-id': '42', 'room-id': '99' }
			})) })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const filter = entry => {
		filtered++
		return Number(entry.id) >= 5
	}

	const result = await client.searchMessages(['hello', 'hey', 'hi'], { limit: 10, filter })

	assert.equal(result.count, 10)
	assert.equal(result.messages.length, 10)
	assert.equal(result.checked, 15, 'stop checking the rest of the current page too')
	assert.equal(filtered, 15, 'rejected and duplicate messages do not consume the limit')
	assert.equal(requests, 1, 'do not fetch another full page or query after reaching ten accepted matches')
	for (const limit of [0, -1, 1.5, NaN, '10']) {
		await assert.rejects(client.countMessages(['hello'], { limit }), /limit/)
	}
	assert.equal(requests, 1)
})

test('archive queries paginate past rejected candidates and deduplicate across keywords', async () => {
	const requests = []
	const messages = Array.from({ length: 501 }, (_, index) => ({
		id: String(index),
		text: index === 500 ? 'hello hey accepted' : 'hello rejected',
		tags: { 'user-id': '42', 'room-id': '99' }
	}))
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async url => {
			requests.push(url)
			const candidates = messages.filter(message => message.text.includes(url.searchParams.get('q')))
			const offset = Number(url.searchParams.get('offset'))
			const limit = Number(url.searchParams.get('limit'))

			return Response.json({ messages: candidates.slice(offset, offset + limit) })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const filtered = []
	const result = await client.searchMessages(['hello', '*hello', 'hey'], { filter: message => {
		filtered.push(message.id)
		return message.text.includes('accepted')
	} })

	assert.equal(result.count, 1, 'an old match is found after 500 newer candidates failed the custom filter')
	assert.equal(result.checked, 501)
	assert.equal(result.messages[0].id, '500')
	assert.equal(filtered.length, 501, 'a message found by multiple keywords is filtered only once')
	assert.deepEqual(requests.map(url => [url.searchParams.get('q'), url.searchParams.get('offset')]), [
		['hello', '0'], ['hello', '500'], ['hey', '0']
	])
	assert.ok(requests.every(url => url.searchParams.get('limit') === '500'))
})

test('an explicit candidate budget is optional and separate from the accepted-match limit', async () => {
	const requests = []
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async url => {
			requests.push(url)
			return Response.json({ messages: Array.from({ length: Math.min(150, Number(url.searchParams.get('limit'))) }, (_, index) => ({
				id: String(index), text: 'hello', tags: { 'user-id': '42', 'room-id': '99' }
			})) })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	let filtered = 0
	const filter = () => {
		filtered++
		return false
	}

	const result = await client.searchMessages(['hello', 'hey'], { maxMessages: 100, filter })

	assert.equal(result.count, 0)
	assert.equal(result.checked, 100)
	assert.equal(filtered, 100, 'rejected candidates consume an explicitly requested budget')
	assert.equal(requests.length, 1)
	assert.equal(requests[0].searchParams.get('limit'), '100')
	assert.equal(await client.countMessages(['hello'], { maxMessages: Infinity }), 150)
	for (const maxMessages of [0, -1, 1.5, NaN, '500']) {
		await assert.rejects(client.countMessages(['hello'], { maxMessages }), /candidate limit/)
	}
	assert.equal(requests.length, 2, 'invalid budgets make no archive requests')
})

test('empty keyword searches are paced and the delay can be cancelled', async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const controller = new AbortController()
	let requests = 0
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: controller.signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => {
			requests++
			return new Response('Not found', { status: 404 })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const pending = client.searchMessages(['hello', 'hey'])

	await setImmediate()
	assert.equal(requests, 1)
	t.mock.timers.tick(399)
	await setImmediate()
	assert.equal(requests, 1)
	t.mock.timers.tick(1)
	assert.equal((await pending).count, 0)
	assert.equal(requests, 2)
	const cancelled = client.searchMessages(['hello', 'hey'])
	const rejected = assert.rejects(cancelled, /Cancelled search/)

	await setImmediate()
	controller.abort(new Error('Cancelled search'))
	await rejected
	t.mock.timers.tick(10000)
	assert.equal(requests, 3, 'no next query is started after cancellation')
})

test('a server that repeats a full page fails rather than silently truncating or looping', async () => {
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => Response.json({ messages: Array.from({ length: 500 }, (_, index) => ({
			id: String(index), text: 'hello', tags: { 'user-id': '42', 'room-id': '99' }
		})) })
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)

	await assert.rejects(client.searchMessages(['hello']), /pagination did not advance/)
})

test('429 respects a short Retry-After once and rejects long or repeated throttling', async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	let requests = 0
	let alwaysThrottle = false
	let retryAfter = '1'
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		setTimeout,
		clearTimeout,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => {
			requests++
			if (requests === 1 || alwaysThrottle) {
				return new Response('', { status: 429, headers: { 'Retry-After': retryAfter } })
			}
			return Response.json({ messages: [{ id: 'one', text: 'hello', tags: { 'user-id': '42', 'room-id': '99' } }] })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const pending = client.countMessages(['hello'], { limit: 10 })

	await setImmediate()
	assert.equal(requests, 1)
	t.mock.timers.tick(999)
	await setImmediate()
	assert.equal(requests, 1)
	t.mock.timers.tick(1)
	assert.equal(await pending, 1)
	assert.equal(requests, 2)
	alwaysThrottle = true
	retryAfter = '20'
	await assert.rejects(client.countMessages(['hello']), /20 seconds/)
	assert.equal(requests, 3, 'do not wait beyond the short retry budget')
	retryAfter = '1'
	const repeated = client.countMessages(['hello'])
	const rejected = assert.rejects(repeated, /rate limit.*429.*1 second\./i)

	await setImmediate()
	t.mock.timers.tick(1000)
	await rejected
	assert.equal(requests, 5, 'do not keep retrying a throttled check')
})

test('cancelling a check during the rate-limit delay prevents another request', async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const controller = new AbortController()
	let requests = 0
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: controller.signal,
		URL,
		URLSearchParams,
		setTimeout,
		clearTimeout,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async () => {
			requests++
			return new Response('', { status: 429 })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)
	const pending = client.countMessages(['hello'])
	const rejected = assert.rejects(pending, /Check cancelled/)

	await setImmediate()
	controller.abort(new Error('Check cancelled'))
	await rejected
	t.mock.timers.tick(10000)
	assert.equal(requests, 1)
})

test('BestLogs matches whole Unicode words and expands masks only within a word', async () => {
	let messages = []
	const requests = []
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: new AbortController().signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => ({ user: { id: '99' } }) },
		fetch: async url => {
			requests.push(url)
			return Response.json({ messages: messages.map((text, index) => ({
				id: String(index), text, tags: { 'user-id': '42', 'room-id': '99' }
			})) })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)

	messages = [
		'писала',
		'Я ПИСАЛА!',
		'«писала»',
		'написала',
		'переписала',
		'писала2',
		'2писала',
		'писала_бы',
		'онаписала',
		'приписалась'
	]
	assert.equal(await client.countMessages(['писала']), 3)
	messages = ['писала', 'написала', 'переписала', 'писала2', 'приписалась', 'пи сала']
	assert.equal(await client.countMessages(['*писала']), 3)
	messages = ['говорила', 'делала', 'видела', 'школа', 'ала', 'скала', 'ааала!']
	assert.equal(await client.countMessages(['*ала']), 4)
	messages = ['писала', 'переписала', 'пи сала', 'писала2', 'пиXсала', 'сказала']
	assert.equal(await client.countMessages(['пи*сала']), 2)
	messages = ['ПИСАЛА', 'писалась', 'написала', 'писала_бы', 'писала2']
	assert.equal(await client.countMessages(['писала*']), 4)
	messages = ['е\u0308лка', 'ЁЛКА', 'ёлками']
	assert.equal(await client.countMessages(['ЁЛКА']), 2)
	requests.length = 0
	messages = ['писала и переписала']
	assert.equal(await client.countMessages(['писала', '*писала', '**писала', ' ПИСАЛА ']), 1)
	assert.equal(requests.length, 1, 'masks with the same literal search share one query')
	assert.equal(requests[0].searchParams.get('q'), 'писала', 'the server searches the literal part; whole-word masks are checked locally')
})

test('BestLogs rejects empty keywords and stops requests when the check is aborted', async () => {
	const controller = new AbortController()
	let requests = 0
	const context = {
		user: { id: '42' },
		channel: { login: 'example' },
		signal: controller.signal,
		URL,
		URLSearchParams,
		twitch: { gql: async () => {
			requests++
			return { user: { id: '99' } }
		} },
		fetch: async () => {
			requests++
			controller.abort(new Error('Check finished'))
			return Response.json({ messages: [] })
		}
	}
	const client = runInNewContext(`(${createBestLogsClient.toString()})(user, channel, twitch, signal)`, context)

	for (const keywords of [[], ['  '], ['hello', null], 'hello', ['***'], ['я писала'], ['писал[а]']]) {
		await assert.rejects(client.countMessages(keywords), /keyword/)
	}
	await assert.rejects(client.countMessages(['hello'], { unknown: true }), /Unknown BestLogs search option/)
	await assert.rejects(client.countMessages(['hello'], { filter: true }), /must be a function/)
	assert.equal(requests, 0)
	await assert.rejects(client.countMessages(['hello', 'hey']), /Check finished/)
	assert.equal(requests, 2, 'stop after channel lookup and the cancelled sample request')
})
