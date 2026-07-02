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
		const login =
			this.#element.querySelector('.viewer-card-header__display-name a').href.split('/').pop()

		logger.debug('login = ', login)

		const user = await TwitchAPI.fetchUser(login)

		this.#user = { name: user.displayName, id: user.id }
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
