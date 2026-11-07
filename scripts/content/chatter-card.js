import { logger } from '../logger.js'
import { User } from '../models/user.js'
import { TwitchAPI } from '../twitch/api.js'
import { LabelsControl } from './labels-control.js'

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
		const userInfo = await this.#fetchUserInfo(element)

		if (!element.isConnected) return
		element.dataset.userId = userInfo.id
		element.dispatchEvent(new Event('chatter-labels:user-id', { bubbles: true }))

		const control = await LabelsControl.create(userInfo, mainStorage, 'chat')

		if (!element.isConnected) {
			control.destroy()
			return
		}
		return new this(element, control)
	}

	static async #fetchUserInfo(element) {
		const name = element.querySelector('.viewer-card-header__display-name a, .viewer-card-header__display-name button')
		const login = name.getAttribute('href')?.split('/')
			.filter(Boolean)
			.pop() ?? name.textContent.trim()

		logger.debug('login = ', login)

		const userResponse = await TwitchAPI.fetchUser(login)

		return User.fromTwitch(userResponse)
	}

	#element
	#removalObserver
	#control

	constructor(element, control) {
		this.#element = element
		this.#control = control
		control.element.classList.add('chatter-labels-card')

		instances.add(this)
		this.#observeRemoval()

		this.#element
			.querySelector('.viewer-card-header__background')
			.after(control.element)
		control.mountPopup()
	}

	destroy() {
		this.#removalObserver?.disconnect()
		this.#control.destroy()
		delete this.#element.dataset[claimedKey]
		delete this.#element.dataset.userId
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
