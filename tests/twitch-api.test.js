import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { TwitchAPI } from '../scripts/twitch/api.js'

test('looks up suspended accounts by login with lookupType ALL', async t => {
	const user = { id: '52608844', login: 'olegsvs', displayName: 'olegsvs' }
	const request = mock.method(globalThis, 'fetch', async () => Response.json({ data: { user } }))

	t.after(() => request.mock.restore())
	assert.deepEqual(await TwitchAPI.fetchUser('olegsvs'), user)
	const [url, options] = request.mock.calls[0].arguments
	const body = JSON.parse(options.body)

	assert.equal(url, 'https://gql.twitch.tv/gql')
	assert.match(body.query, /user\(login: \$login, lookupType: ALL\)/)
	assert.deepEqual(body.variables, { login: 'olegsvs' })
})
