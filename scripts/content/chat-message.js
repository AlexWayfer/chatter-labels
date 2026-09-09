export class ChatMessage {
	static USERNAME_SELECTOR = '.chat-line__username, .message-author__username--clickable'

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
			usernameElement = this.#element.querySelector(this.constructor.USERNAME_SELECTOR),
			userId = this.#chat.userIdFrom(this.#element),
			labels = this.#assignedLabels(userId)

		if (!usernameElement || !labels.length) {
			this.#iconsElement?.remove()
			this.#iconsElement = null
			return
		}

		if (!this.#iconsElement) {
			this.#iconsElement = document.createElement('span')
			this.#iconsElement.classList.add('chatter-labels-icons')
			usernameElement.before(this.#iconsElement)
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

		const userAssignments = this.#chat.assignments.filter(assignment => assignment.user.id == userId)

		if (!userAssignments.length) return []

		return this.#chat.labels.filter(
			label => userAssignments.some(assignment => assignment.label?.id == label.id)
		)
	}
}
