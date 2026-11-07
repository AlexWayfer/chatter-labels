import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestTwitch } from '../scripts/label-checks/twitch-request.js'

function setup() {
	const controller = new AbortController()
	let request
	let response = { ok: true, json: async () => ({ data: { user: { id: '42' } } }) }
	const context = {
		token: 'test-session',
		stores: [{ id: 'normal', tabIds: [7] }, { id: 'private', tabIds: [8] }],
		cookieDetails: null,
		tabId: 7
	}
	const dependencies = {
		cookies: {
			getAllCookieStores: async () => context.stores,
			async get(details) {
				context.cookieDetails = details
				return context.token ? { value: context.token } : null
			}
		},
		fetchRequest: async (url, options) => {
			request = { url, ...options }
			options.signal.throwIfAborted()
			return response
		}
	}
	const client = {
		gql(query, variables = {}, { authenticated = false } = {}) {
			return requestTwitch({ query, variables, authenticated }, { signal: controller.signal, tabId: context.tabId }, dependencies)
		}
	}

	return {
		client,
		controller,
		context,
		request: () => request,
		respond: value => {
			response = value
		}
	}
}

test('background requests use Twitch cookies and return data without exposing the session', async () => {
	const { client, context, request } = setup()
	const query = 'query($id: ID!) { user(id: $id) { id } }'
	const data = await client.gql(query, { id: '42' })

	assert.equal(data.user.id, '42')
	assert.equal(request().url, 'https://gql.twitch.tv/gql')
	assert.equal(request().method, 'POST')
	assert.equal(request().headers.Authorization, 'OAuth test-session')
	assert.equal(request().headers['Client-Id'], 'kimne78kx3ncx6brgo4mv6wki5h1ko')
	assert.deepEqual(JSON.parse(request().body), { query, variables: { id: '42' } })
	assert.equal(request().signal.aborted, false)
	assert.deepEqual(context.cookieDetails, { url: 'https://www.twitch.tv/', name: 'auth-token', storeId: 'normal' })
	assert.equal(JSON.stringify(data).includes(context.token), false)
	assert.equal(client.isBlockedBy, undefined)
	await client.gql('{ currentUser { id } }')
	assert.deepEqual(JSON.parse(request().body).variables, {})
	context.token = 'changed-session'
	await client.gql(query)
	assert.equal(request().headers.Authorization, 'OAuth changed-session')
})

test('gql surfaces HTTP, GraphQL, invalid-response and abort errors', async () => {
	const { client, respond, controller } = setup()

	respond({ ok: false, status: 401 })
	await assert.rejects(client.gql('{ currentUser { id } }'), /401/)
	respond({ ok: true, json: async () => ({ data: { partial: true }, errors: [{ message: 'Denied' }, { message: 'Unknown field' }] }) })
	await assert.rejects(client.gql('{ currentUser { id } }'), /Denied; Unknown field/)
	respond({ ok: true, json: async () => ({}) })
	await assert.rejects(client.gql('{ currentUser { id } }'), /no data/)
	controller.abort(new Error('Deadline reached'))
	await assert.rejects(client.gql('{ currentUser { id } }'), /Deadline reached/)
})

test('background requests reject missing sessions and use the caller tab cookie store', async () => {
	const { client, context, request } = setup()

	context.token = ''
	await assert.rejects(client.gql('{ currentUser { id } }'), /Sign in to Twitch/)
	assert.equal(request(), undefined)
	context.token = 'private-session'
	context.tabId = 8
	await client.gql('{ currentUser { id } }')
	assert.equal(context.cookieDetails.storeId, 'private')
	assert.equal(request().headers.Authorization, 'OAuth private-session')
	context.stores = []
	await assert.rejects(client.gql('{ currentUser { id } }'), /cookie store/)
})

test('authenticated mode verifies the current user in the same HTTP request', async () => {
	const { client, respond, request } = setup()
	const query = 'query($id: ID!) { user(id: $id) { id } }'

	respond({
		ok: true,
		json: async () => [
			{ data: { user: { id: '42' } } }, { data: { currentUser: { id: '123' } } }
		]
	})
	assert.equal((await client.gql(query, { id: '42' }, { authenticated: true })).user.id, '42')
	const body = JSON.parse(request().body)

	assert.equal(Array.isArray(body), true)
	assert.deepEqual(body[0], { query, variables: { id: '42' } })
	assert.match(body[1].query, /currentUser\s*\{\s*id\s*\}/)
	respond({
		ok: true,
		json: async () => [
			{ data: { user: { id: '42' } } }, { data: { currentUser: null } }
		]
	})
	await assert.rejects(client.gql(query, {}, { authenticated: true }), /authenticate/)
	respond({ ok: true, json: async () => ({ data: { user: { id: '42' } } }) })
	await assert.rejects(client.gql(query, {}, { authenticated: true }), /verification/)
})
