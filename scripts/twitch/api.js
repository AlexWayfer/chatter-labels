import { logger } from '../logger.js'

export class TwitchAPI {
	static #CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

	static async fetchUsers(usernames) {
		if (!usernames.length) return []

		const
			response = await fetch('https://gql.twitch.tv/gql', {
				method: 'POST',
				headers: { 'Client-Id': this.#CLIENT_ID },
				body: JSON.stringify({
					query: 'query($logins: [String!]) { users(logins: $logins) { id login displayName } }',
					variables: { logins: usernames }
				})
			}),
			json = await response.json()

		logger.debug('Twitch fetchUsers response json = ', json)

		return json.data.users
	}
}
