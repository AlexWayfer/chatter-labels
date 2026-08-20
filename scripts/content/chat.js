import { logger } from '../logger.js'
import { ChatMessage } from './chat-message.js'

export class Chat {
	static CONTAINER_SELECTOR = '.chat-scrollable-area__message-container'
	static MESSAGE_SELECTOR = '.chat-line__message'

	static async create(mainStorage) {
		const
			labels = await mainStorage.get('labels'),
			assignments = await mainStorage.get('assignments')

		return new this(mainStorage, labels, assignments)
	}

	#mainStorage
	#labels
	#assignments
	#messages = new Set()
	#messagesByElement = new WeakMap()
	#containers = new Map()

	constructor(mainStorage, labels, assignments) {
		this.#mainStorage = mainStorage
		this.#labels = labels
		this.#assignments = assignments

		this.#subscribe()
	}

	get labels() {
		return this.#labels
	}

	get assignments() {
		return this.#assignments
	}

	userIdFrom(element) {
		if (element.dataset.userId) return element.dataset.userId

		element.dispatchEvent(new Event('chatter-labels:resolve-user-id'))

		return element.dataset.userId
	}

	attachIfNeeded(node) {
		for (const container of this.#containersIn(node)) {
			this.#watchContainer(container)
		}
	}

	detachIfNeeded(node) {
		for (const container of this.#containersIn(node)) {
			this.#unwatchContainer(container)
		}
	}

	#containersIn(node) {
		if (node.nodeType !== Node.ELEMENT_NODE) return []

		return node.matches(this.constructor.CONTAINER_SELECTOR)
			? [node]
			: [...node.querySelectorAll(this.constructor.CONTAINER_SELECTOR)]
	}

	#watchContainer(container) {
		logger.debug('Chat watch container')

		if (this.#containers.has(container)) return

		const observer = new MutationObserver(mutations => {
			for (const mutation of mutations) {
				for (const addedNode of mutation.addedNodes) {
					this.#createMessagesIfNeeded(addedNode)
				}

				for (const removedNode of mutation.removedNodes) {
					this.#forgetMessagesIn(removedNode)
				}
			}
		})

		observer.observe(container, { childList: true, subtree: true })
		this.#containers.set(container, observer)
		this.#createMessagesIfNeeded(container)
	}

	#unwatchContainer(container) {
		logger.debug('Chat unwatch container')

		this.#containers.get(container)?.disconnect()
		this.#containers.delete(container)
		this.#forgetMessagesIn(container)
	}

	#createMessagesIfNeeded(node) {
		if (node.nodeType !== Node.ELEMENT_NODE) return

		const messages =
			node.matches(this.constructor.MESSAGE_SELECTOR)
				? [node]
				: [...node.querySelectorAll(this.constructor.MESSAGE_SELECTOR)]

		for (const element of messages) {
			if (element.dataset.labelsInjected) continue
			if (!element.querySelector('.chat-line__username')) continue

			element.dataset.labelsInjected = true

			const message = new ChatMessage(element, this)

			this.#messages.add(message)
			this.#messagesByElement.set(element, message)
		}
	}

	#forgetMessagesIn(node) {
		if (node.nodeType !== Node.ELEMENT_NODE) return

		const messages =
			node.matches(this.constructor.MESSAGE_SELECTOR)
				? [node]
				: [...node.querySelectorAll(this.constructor.MESSAGE_SELECTOR)]

		for (const element of messages) {
			const message = this.#messagesByElement.get(element)

			if (!message) continue

			this.#messages.delete(message)
			this.#messagesByElement.delete(element)
		}
	}

	#subscribe() {
		this.#mainStorage.subscribe('labels', labels => {
			this.#labels = labels
			this.#renderMessages()
		})

		this.#mainStorage.subscribe('assignments', assignments => {
			this.#assignments = assignments
			this.#renderMessages()
		})
	}

	#renderMessages() {
		for (const message of this.#messages) message.render()
	}
}
