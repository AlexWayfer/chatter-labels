class MessageUserId {
	#element

	constructor(element) {
		this.#element = element

		const userId = this.#fromFiber()

		if (userId) this.#element.dataset.userId = userId
	}

	#fromFiber() {
		let fiber

		for (const key of Object.keys(this.#element)) {
			if (key.startsWith('__reactFiber$')) {
				fiber = this.#element[key]
				break
			}
		}

		for (let depth = 0; depth < 40 && fiber; depth++) {
			const message = fiber.memoizedProps?.message

			if (message?.user?.userID && message.user.login != 'automod')
				return String(message.user.userID)

			if (message?.sender?.id) return String(message.sender.id)

			fiber = fiber.return
		}
	}
}

document.addEventListener(
	'chatter-labels:resolve-user-id',
	event => {
		const element = event.target

		if (!(element instanceof Element)) return
		if (element.dataset.userId) return

		new MessageUserId(element)
	},
	true
)
