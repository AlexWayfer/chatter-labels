import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GitHubGist } from '../scripts/storage/providers/github-gist.js'

test('creates a gist only when no ID is provided', async t => {
	t.mock.method(globalThis, 'fetch', async (_url, options) => {
		assert.equal(options.method, 'POST')
		return Response.json({ id: 'created' })
	})
	assert.equal(await new GitHubGist('token').ensureGistAccess(), 'created')
})

test('reuses an accessible gist', async t => {
	const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
		assert.equal(url, `${GitHubGist.API_BASE}/existing`)
		assert.equal(options.method, 'GET')
		return Response.json({ id: 'existing' })
	})
	assert.equal(await new GitHubGist('token', 'existing').ensureGistAccess(), 'existing')
	assert.equal(fetch.mock.callCount(), 1)
})

for (const status of [401, 403, 404, 500]) {
	test(`reports ${status} without creating a replacement gist`, async t => {
		const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status }))
		const provider = new GitHubGist('token', 'existing')

		await assert.rejects(provider.ensureGistAccess())
		assert.equal(fetch.mock.callCount(), 1)
		assert.equal(provider.gistId, 'existing')
	})
}

test('reports network errors without creating a replacement gist', async t => {
	const fetch = t.mock.method(globalThis, 'fetch', async () => {
		throw new Error('Offline')
	})

	await assert.rejects(new GitHubGist('token', 'existing').ensureGistAccess(), /Offline/)
	assert.equal(fetch.mock.callCount(), 1)
})
