import { logger } from '../logger.js'
import { TwitchAPI } from '../twitch/api.js'
import { LabelsElement } from './labels-element.js'

const instances = new Set()

export class ChatterCard {
	static updateAll(options) {
		for (const instance of instances) {
			instance.labelsElement.options = options
		}
	}

	#element
	#user

	constructor(element, options) {
		this.#element = element

		instances.add(this)
		this.#observeRemoval()

		this.#fetchUserInfo().then(() => {
			this.labelsElement = new LabelsElement(this.#user, options)

			this.#element
				.querySelector('.viewer-card-header__background')
				.after(this.labelsElement.element)
		})
	}

	async #fetchUserInfo() {
		const findUsername = () => {
			return this.#element.querySelector('.viewer-card-header__display-name a')?.textContent
		}

		const username = await new Promise(resolve => {
			const existingUsername = findUsername()
			if (existingUsername) return resolve(existingUsername)

			const observer = new MutationObserver(() => {
				const foundUsername = findUsername()
				if (foundUsername) {
					observer.disconnect()
					resolve(foundUsername)
				}
			})

			observer.observe(this.#element, { childList: true, subtree: true })
		})

		logger.debug('username = ', username)

		const user = await TwitchAPI.fetchUser(username)

		this.#user = { name: username, id: user.id }
	}

	#observeRemoval() {
		const observer = new MutationObserver(() => {
			if (this.#element.isConnected) return

			instances.delete(this)
			observer.disconnect()
			logger.debug('Labels Element instance deleted.')
		})

		//// There can be multiple parents, and Twitch can remove one of them
		// logger.debug('Chatter Card parent node = ', this.#chatterCard.parentNode)
		observer.observe(document.body, { childList: true, subtree: true })
	}
}
