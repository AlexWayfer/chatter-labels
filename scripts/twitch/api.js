import { logger } from '../logger.js'

export class TwitchAPI {
	static #CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

	static async fetchUser(username) {
		const
			response = await fetch('https://gql.twitch.tv/gql', {
				method: 'POST',
				headers: { 'Client-Id': this.#CLIENT_ID },
				body: JSON.stringify({ query: `{ user(login: "${username}") { id } }` })
			}),
			json = await response.json()

		// logger.debug('Twitch fetchUser response = ', response)
		logger.debug('Twitch fetchUser response json = ', json)

		return json.data.user
	}
}
