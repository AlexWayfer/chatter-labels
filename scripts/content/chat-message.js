export class ChatMessage {
	static ICONS_SELECTOR = `.chatter-labels-icons[data-chatter-labels-ext="${chrome.runtime.id}"]`

	#element
	#chat
	#iconsElement

	constructor(element, chat) {
		this.#element = element
		this.#chat = chat

		this.render()
	}

	render() {
		const
			usernameElement = this.#element.querySelector(this.#chat.kind.usernameSelector),
			userId = this.#chat.userIdFrom(this.#element),
			labels = this.#assignedLabels(userId)

		if (!usernameElement || !labels.length) {
			for (const icons of this.#element.querySelectorAll(this.constructor.ICONS_SELECTOR)) {
				icons.remove()
			}

			this.#iconsElement = null
			return
		}

		this.#iconsElement = this.#element.querySelector(this.constructor.ICONS_SELECTOR)

		if (!this.#iconsElement) {
			this.#iconsElement = document.createElement('span')
			this.#iconsElement.classList.add('chatter-labels-icons')
			this.#iconsElement.dataset.chatterLabelsExt = chrome.runtime.id
		}

		for (const extra of this.#element.querySelectorAll(this.constructor.ICONS_SELECTOR)) {
			if (extra != this.#iconsElement) extra.remove()
		}

		usernameElement.before(this.#iconsElement)

		this.#iconsElement.replaceChildren(
			...labels.map(label => {
				const iconElement = document.createElement('img')

				iconElement.classList.add('chatter-labels-icon')
				iconElement.src = label.icon
				iconElement.alt = label.name
				iconElement.title = label.name

				return iconElement
			})
		)
	}

	#assignedLabels(userId) {
		if (!userId) return []

		const userAssignments = this.#chat.assignments.filter(assignment => assignment.user.id == userId)

		if (!userAssignments.length) return []

		return this.#chat.labels.filter(
			label => userAssignments.some(assignment => assignment.label?.id == label.id)
		)
	}
}
