export class ChatMessage {
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
			userId = this.#chat.userIdFrom(this.#element),
			labels = this.#assignedLabels(userId)

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
				iconElement.title = label.name

				return iconElement
			})
		)
	}

	#assignedLabels(userId) {
		if (!userId) return []

		const userAssignments = this.#chat.assignments.filter(assignment => assignment.userId == userId)

		if (!userAssignments.length) return []

		return this.#chat.labels.filter(
			label => userAssignments.some(assignment => assignment.label?.id == label.id)
		)
	}
}
