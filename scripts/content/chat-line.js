import { logger } from '../logger.js'

const instances = new Set()

export class ChatLine {
	static createIfNeeded(node, mainStorage) {
		if (node.nodeType !== Node.ELEMENT_NODE) return

		const lines = node.matches('.chat-line__message') ? [node] : [...node.querySelectorAll('.chat-line__message')]

		for (const line of lines) {
			if (line.dataset.labelsInjected) continue
			if (!line.querySelector('.chat-line__username')) continue

			line.dataset.labelsInjected = true
			this.create(line, mainStorage)
		}
	}

	static async create(element, mainStorage) {
		const
			labels = await mainStorage.get('labels'),
			assignments = await mainStorage.get('assignments')

		return new this(element, mainStorage, labels, assignments)
	}

	#element
	#mainStorage
	#labels
	#assignments
	#subscriptions
	#iconsElement

	constructor(element, mainStorage, labels, assignments) {
		this.#element = element
		this.#mainStorage = mainStorage
		this.#labels = labels
		this.#assignments = assignments

		instances.add(this)

		this.#subscribe()
		this.#observeRemoval()
		this.#render()
	}

	#subscribe() {
		this.#subscriptions = [
			this.#mainStorage.subscribe('labels', labels => {
				this.#labels = labels
				this.#render()
			}),
			this.#mainStorage.subscribe('assignments', assignments => {
				this.#assignments = assignments
				this.#render()
			})
		]
	}

	#unsubscribe() {
		this.#subscriptions.forEach(subscription => subscription())
	}

	#observeRemoval() {
		const observer = new MutationObserver(() => {
			if (this.#element.isConnected) return

			this.#unsubscribe()
			instances.delete(this)
			observer.disconnect()
			logger.debug('Chat Line instance deleted.')
		})

		observer.observe(document.body, { childList: true, subtree: true })
	}

	#render() {
		const labels = this.#assignedLabels()

		if (!labels.length) {
			this.#iconsElement?.remove()
			this.#iconsElement = null
			return
		}

		if (!this.#iconsElement) {
			this.#iconsElement = document.createElement('span')
			this.#iconsElement.classList.add('chatter-labels-icons')
			this.#element.querySelector('.chat-line__username').before(this.#iconsElement)
		}

		this.#iconsElement.replaceChildren(
			...labels.map(label => {
				const iconElement = document.createElement('img')

				iconElement.classList.add('chatter-labels-icon')
				iconElement.src = label.icon
				iconElement.alt = label.name

				return iconElement
			})
		)
	}

	#assignedLabels() {
		const userId = this.#element.dataset.userId

		if (!userId) return []

		const userAssignments = this.#assignments.filter(assignment => assignment.userId == userId)

		if (!userAssignments.length) return []

		return this.#labels.filter(
			label => userAssignments.some(assignment => assignment.label?.id == label.id)
		)
	}
}
