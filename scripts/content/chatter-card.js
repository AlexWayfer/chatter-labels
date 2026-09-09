import { logger } from '../logger.js'
import { User } from '../models/user.js'
import { TwitchAPI } from '../twitch/api.js'
import { LabelsElement } from './labels-element.js'

const claimedKey = `chatterLabels${chrome.runtime.id}`

export class ChatterCard {
	static createIfNeeded(node, mainStorage) {
		if (node.nodeType !== Node.ELEMENT_NODE) return

		const element = node.matches('[data-a-target]') ? node : node.querySelector('[data-a-target]')

		if (!element) return
		if (!['viewer-card', 'mod-view-user-details'].includes(element.dataset.aTarget)) return
		if (claimedKey in element.dataset) return

		element.dataset[claimedKey] = ''
		this.create(element, mainStorage)
	}

	static async create(element, mainStorage) {
		const
			userInfo = await this.#fetchUserInfo(element),
			labelsElement = await LabelsElement.create(userInfo, mainStorage)

		return new this(element, labelsElement)
	}

	static async #fetchUserInfo(element) {
		const login = element.querySelector('.viewer-card-header__display-name a').href.split('/').pop()

		logger.debug('login = ', login)

		const [userResponse] = await TwitchAPI.fetchUsers([login])

		return User.fromTwitch(userResponse)
	}

	#element

	constructor(element, labelsElement) {
		this.#element = element
		this.labelsElement = labelsElement

		this.#observeRemoval()

		this.#element
			.querySelector('.viewer-card-header__background')
			.after(this.labelsElement.element)
	}

	#observeRemoval() {
		const observer = new MutationObserver(() => {
			if (this.#element.isConnected) return

			this.labelsElement.unsubscribe()
			delete this.#element.dataset[claimedKey]
			observer.disconnect()
			logger.debug('Labels Element instance deleted.')
		})

		//// There can be multiple parents, and Twitch can remove one of them
		// logger.debug('Chatter Card parent node = ', this.#chatterCard.parentNode)
		observer.observe(document.body, { childList: true, subtree: true })
	}
}
