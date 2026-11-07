import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createTwitchClient } from '../scripts/label-checks/twitch-client.js'

test('the injected helper forwards requests without reading site storage or cookies', async () => {
	let message
	const controller = new AbortController()
	const context = {
		signal: controller.signal,
		chrome: { runtime: { async sendMessage(value) {
			message = value
			return { ok: true, data: { user: { id: '42' } } }
		} } }
	}
	const client = runInNewContext(`(${createTwitchClient.toString()})(signal, 'run-one')`, context)
	const data = await client.gql('{ currentUser { id } }', {}, { authenticated: true })

	assert.equal(data.user.id, '42')
	assert.deepEqual(JSON.parse(JSON.stringify(message)), {
		type: 'label-check-twitch-gql', runId: 'run-one', query: '{ currentUser { id } }', variables: {}, authenticated: true
	})
	assert.equal(client.isBlockedBy, undefined)
})

test('the injected helper propagates background errors and aborts pending requests', async () => {
	const controller = new AbortController()
	const context = {
		signal: controller.signal,
		chrome: { runtime: { sendMessage: async () => ({ ok: false, error: 'Sign in to Twitch.' }) } }
	}
	const client = runInNewContext(`(${createTwitchClient.toString()})(signal, 'run-one')`, context)

	await assert.rejects(client.gql('{ currentUser { id } }'), /Sign in to Twitch/)
	context.chrome.runtime.sendMessage = async () => new Promise(() => {})
	const pending = client.gql('{ currentUser { id } }')

	controller.abort(new Error('Deadline reached'))
	await assert.rejects(pending, /Deadline reached/)
})

test('getUser returns selected fields, uses an ID lookup and rejects missing users', async () => {
	let message
	let reply = { ok: true, data: { user: { login: 'example' } } }
	const context = {
		signal: new AbortController().signal,
		chrome: { runtime: { async sendMessage(value) {
			message = value
			return reply
		} } }
	}
	const client = runInNewContext(`(${createTwitchClient.toString()})(signal, 'run-one')`, context)
	const { getUser } = client

	assert.equal((await getUser('42', 'login')).login, 'example')
	assert.equal(message.runId, 'run-one')
	assert.equal(message.type, 'label-check-twitch-gql')
	assert.match(message.query, /user\(id: \$id, lookupType: ALL\)/)
	assert.equal(message.variables.id, '42')
	assert.equal(message.authenticated, false)
	reply = { ok: true, data: { user: { stream: { id: 'live' } } } }
	assert.equal((await getUser('42', 'stream { id }')).stream.id, 'live')
	assert.match(message.query, /stream \{ id \}/)
	reply = { ok: true, data: { user: null } }
	await assert.rejects(getUser('42', 'login'), /Twitch user not found/)
	reply = { ok: false, error: 'Sign in to Twitch.' }
	await assert.rejects(getUser('42', 'login'), /Sign in to Twitch/)
	message = null
	await assert.rejects(getUser('', 'login'), /user ID/)
	await assert.rejects(getUser('42', '  '), /fields/)
	assert.equal(message, null, 'invalid arguments do not send requests')
})
