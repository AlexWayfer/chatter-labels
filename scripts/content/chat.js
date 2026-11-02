import { logger } from '../logger.js'
import { ChatMessage } from './chat-message.js'
import { ChatterCard } from './chatter-card.js'

export class Chat {
	static KINDS = [
		{
			name: 'live',
			containerSelector: '.chat-scrollable-area__message-container, .chat-input-tray__open',
			messageSelector: '.chat-line__message',
			usernameSelector: '.chat-line__username'
		},
		{
			name: 'whispers',
			containerSelector: '.whispers-inbox__list-items, .whispers-threads-box__scrollable-area',
			messageSelector: '.whispers-list-item',
			usernameSelector: '.whispers-list-item__user-name',
			resolveUserEachRender: true,
			userAttributes: ['data-a-target']
		},
		{
			name: 'whisper-dialog',
			containerSelector: '.whispers__thread, .whispers-thread',
			messageSelector: '.whispers__header, .thread-header, .thread-message__message',
			usernameSelector: '.tw-interactable p, [id^="whisper-thread-header-name-"], .thread-message__message--user-name',
			resolveUserEachRender: true
		},
		{
			name: 'history',
			containerSelector: '.message-list',
			messageSelector: '.vcml-message',
			usernameSelector: '.message-author__username'
		},
		{
			name: 'automod',
			containerSelector: '[role="list"]:has(.automod-queue-item)',
			messageSelector: '.automod-queue-item',
			usernameSelector: '.message-author__username--clickable'
		}
	]

	static async createAll(mainStorage) {
		const
			labels = await mainStorage.get('labels'),
			assignments = await mainStorage.get('assignments')

		return this.KINDS.map(kind => new this(mainStorage, labels, assignments, kind))
	}

	#mainStorage
	#labels
	#assignments
	#kind
	#messages = new Set()
	#messagesByElement = new WeakMap()
	#containers = new Map()

	constructor(mainStorage, labels, assignments, kind) {
		this.#mainStorage = mainStorage
		this.#labels = labels
		this.#assignments = assignments
		this.#kind = kind

		this.#subscribe()
	}

	get labels() {
		return this.#labels
	}

	get assignments() {
		return this.#assignments
	}

	get kind() {
		return this.#kind
	}

	userIdFrom(element) {
		const target = this.#kind.resolveUserEachRender
			? element
			: element.querySelector('.chat-line__message--alert .message') ??
				element.querySelector(':scope > [id]') ??
				element

		if (target.dataset.userId && !this.#kind.resolveUserEachRender) return target.dataset.userId

		target.dispatchEvent(new Event('chatter-labels:resolve-user-id'))

		return target.dataset.userId ?? element.closest(ChatterCard.CARD_SELECTOR)?.dataset.userId
	}

	attachIfNeeded(node) {
		for (const container of this.#containersIn(node)) {
			this.#watchContainer(container)
		}

		if (node.nodeType !== Node.ELEMENT_NODE) return

		const closest = node.closest(this.#kind.containerSelector)

		if (closest) this.#watchContainer(closest)
	}

	detachIfNeeded(node) {
		for (const container of this.#containersIn(node)) {
			this.#unwatchContainer(container)
		}
	}

	#containersIn(node) {
		if (node.nodeType !== Node.ELEMENT_NODE) return []

		return node.matches(this.#kind.containerSelector)
			? [node]
			: [...node.querySelectorAll(this.#kind.containerSelector)]
	}

	#watchContainer(container) {
		logger.debug(`Chat watch ${this.#kind.name} container`)

		if (this.#containers.has(container)) return

		const observer = new MutationObserver(mutations => {
			for (const mutation of mutations) {
				if (mutation.type !== 'childList') this.#createMessagesIfNeeded(mutation.target)

				for (const addedNode of mutation.addedNodes) {
					this.#createMessagesIfNeeded(addedNode)
				}

				for (const removedNode of mutation.removedNodes) {
					this.#forgetMessagesIn(removedNode)
				}
			}
		})

		observer.observe(container, {
			childList: true,
			subtree: true,
			characterData: !!this.#kind.resolveUserEachRender,
			...this.#kind.userAttributes && {
				attributes: true,
				attributeFilter: this.#kind.userAttributes
			}
		})
		this.#containers.set(container, observer)
		this.#createMessagesIfNeeded(container)
	}

	#unwatchContainer(container) {
		logger.debug(`Chat unwatch ${this.#kind.name} container`)

		this.#containers.get(container)?.disconnect()
		this.#containers.delete(container)
		this.#forgetMessagesIn(container)
	}

	destroy() {
		for (const container of [...this.#containers.keys()]) this.#unwatchContainer(container)
	}

	#createMessagesIfNeeded(node) {
		if (node.nodeType === Node.TEXT_NODE && this.#kind.resolveUserEachRender) {
			node = node.parentElement
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return

		const messages = this.#messageElementsIn(node)
		const closest = node.closest(this.#kind.messageSelector)

		if (closest && !messages.includes(closest)) messages.push(closest)

		for (const element of messages) {
			const existing = this.#messagesByElement.get(element)

			if (existing) {
				if (this.#kind.resolveUserEachRender &&
					!node.closest(ChatMessage.ICONS_SELECTOR)) {
					existing.render()
				}
				continue
			}
			if (!element.querySelector(this.#kind.usernameSelector)) continue

			const message = new ChatMessage(element, this)

			this.#messages.add(message)
			this.#messagesByElement.set(element, message)
		}
	}

	#forgetMessagesIn(node) {
		if (node.nodeType !== Node.ELEMENT_NODE) return

		for (const element of this.#messageElementsIn(node)) {
			const message = this.#messagesByElement.get(element)

			if (!message) continue

			this.#messages.delete(message)
			this.#messagesByElement.delete(element)
		}
	}

	#messageElementsIn(node) {
		return node.matches(this.#kind.messageSelector)
			? [node]
			: [...node.querySelectorAll(this.#kind.messageSelector)]
	}

	#subscribe() {
		this.#mainStorage.subscribe('labels', labels => {
			this.#labels = labels
			this.refresh()
		})

		this.#mainStorage.subscribe('assignments', assignments => {
			this.#assignments = assignments
			this.refresh()
		})
	}

	refresh() {
		for (const container of this.#containers.keys()) this.#createMessagesIfNeeded(container)

		this.#renderMessages()
	}

	#renderMessages() {
		for (const message of this.#messages) message.render()
	}
}
