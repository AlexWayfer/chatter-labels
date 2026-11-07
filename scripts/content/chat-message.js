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
			usernameElement = this.#chat.kind.usernameSelector
				? this.#element.querySelector(this.#chat.kind.usernameSelector)
				: this.#element,
			userId = this.#chat.userIdFrom(this.#element),
			labels = this.#assignedLabels(userId)

		if (!usernameElement || !labels.length) {
			for (const icons of this.#existingIcons()) {
				icons.remove()
			}

			this.#iconsElement = null
			return
		}

		const existingIcons = this.#existingIcons()

		this.#iconsElement = existingIcons[0]

		if (!this.#iconsElement) {
			this.#iconsElement = document.createElement('span')
			this.#iconsElement.classList.add('chatter-labels-icons')
			this.#iconsElement.dataset.chatterLabelsExt = chrome.runtime.id
		}

		for (const extra of existingIcons) {
			if (extra != this.#iconsElement) extra.remove()
		}

		if (this.#chat.kind.usernameSelector || !existingIcons.length) {
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

	#existingIcons() {
		if (this.#chat.kind.usernameSelector) {
			return [...this.#element.querySelectorAll(this.constructor.ICONS_SELECTOR)]
		}
		const icons = []

		for (let previous = this.#element.previousElementSibling;
			previous?.matches('.chatter-labels-icons');
			previous = previous.previousElementSibling) {
			if (previous.matches(this.constructor.ICONS_SELECTOR)) icons.push(previous)
		}
		return icons
	}

	destroy() {
		if (!this.#chat.kind.usernameSelector) this.#iconsElement?.remove()
	}

	#assignedLabels(userId) {
		if (!userId) return []

		const userAssignments = this.#chat.assignments.filter(assignment => assignment.user.id == userId)

		if (!userAssignments.length) return []

		return this.#chat.labels.filter(
			label => label.enabled && userAssignments.some(assignment => assignment.label?.id == label.id)
		)
	}
}
