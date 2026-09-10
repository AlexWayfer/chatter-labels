import { logger } from '../logger.js'
import { User } from '../models/user.js'
import { TwitchAPI } from '../twitch/api.js'
import { LabelsElement } from './labels-element.js'

const claimedKey = `chatterLabels${chrome.runtime.id}`
const instances = new Set()

export class ChatterCard {
	static CARD_SELECTOR =
		'[data-a-target="viewer-card"], [data-a-target="mod-view-user-details"]'

	static createIfNeeded(node, mainStorage) {
		if (node.nodeType !== Node.ELEMENT_NODE) return

		const cards = node.matches(this.CARD_SELECTOR)
			? [node]
			: [...node.querySelectorAll(this.CARD_SELECTOR)]

		for (const element of cards) {
			if (claimedKey in element.dataset) continue

			element.dataset[claimedKey] = ''
			this.create(element, mainStorage)
		}
	}

	static destroyAll() {
		for (const instance of [...instances]) instance.destroy()
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
	#removalObserver

	constructor(element, labelsElement) {
		this.#element = element
		this.labelsElement = labelsElement

		instances.add(this)
		this.#observeRemoval()

		this.#element
			.querySelector('.viewer-card-header__background')
			.after(this.labelsElement.element)
	}

	destroy() {
		this.#removalObserver?.disconnect()
		this.labelsElement.unsubscribe()
		this.labelsElement.element.remove()
		delete this.#element.dataset[claimedKey]
		instances.delete(this)
	}

	#observeRemoval() {
		this.#removalObserver = new MutationObserver(() => {
			if (this.#element.isConnected) return

			this.destroy()
			logger.debug('Labels Element instance deleted.')
		})

		//// There can be multiple parents, and Twitch can remove one of them
		// logger.debug('Chatter Card parent node = ', this.#chatterCard.parentNode)
		this.#removalObserver.observe(document.body, { childList: true, subtree: true })
	}
}
