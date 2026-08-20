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
	#lettersElement

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
		const letters = this.#letters()

		if (!letters.length) {
			this.#lettersElement?.remove()
			this.#lettersElement = null
			return
		}

		if (!this.#lettersElement) {
			this.#lettersElement = document.createElement('span')
			this.#lettersElement.classList.add('chatter-labels-letters')
			this.#element.querySelector('.chat-line__username').before(this.#lettersElement)
		}

		this.#lettersElement.replaceChildren(
			...letters.map(letter => {
				const letterElement = document.createElement('span')

				letterElement.classList.add('chatter-labels-letter')
				letterElement.textContent = letter

				return letterElement
			})
		)
	}

	#letters() {
		const userId = this.#element.dataset.userId

		if (!userId) return []

		const userAssignments = this.#assignments.filter(assignment => assignment.userId == userId)

		if (!userAssignments.length) return []

		return this.#labels
			.filter(label => userAssignments.some(assignment => assignment.label?.id == label.id))
			.map(label => label.letter)
	}
}
