class MessageUserId {
	static WHISPER_SELECTOR = '.whispers-list-item, .whispers__header, .thread-header, .thread-message__message'

	#element
	#whisper

	constructor(element) {
		this.#element = element
		this.#whisper = element.matches(this.constructor.WHISPER_SELECTOR)

		const userId = this.#fromFiber()

		if (userId) this.#element.dataset.userId = userId
		else if (this.#whisper) delete this.#element.dataset.userId
	}

	#fromFiber() {
		let fiber

		for (let element = this.#element; element; element = element.parentElement) {
			const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'))

			if (key) fiber = element[key]
			if (fiber || !this.#whisper) break
		}

		let root = fiber

		while (root?.return) root = root.return
		if (root?.stateNode?.current && root.stateNode.current !== root) fiber = fiber.alternate ?? fiber

		for (let depth = 0; depth < 40 && fiber; depth++) {
			const props = fiber.memoizedProps ?? {}

			if (this.#whisper) {
				const userId = this.#fromWhisperProps(props)

				if (userId) return String(userId)
				fiber = fiber.return
				continue
			}

			const
				message = props.message ?? props.autoModMessage,
				user = message?.user ?? message?.sender

			if (user?.login != 'automod') {
				const userId = user?.userID ?? user?.id ?? message?.userID

				if (userId) return String(userId)
			}

			fiber = fiber.return
		}
	}

	#fromWhisperProps(props) {
		if (this.#element.matches('.whispers-list-item')) return props.user?.id
		if (this.#element.matches('.thread-header')) return props.interlocutor?.id
		if (this.#element.matches('.whispers__header')) {
			const { currentUser, whisperThread } = props.data ?? {}

			if (!currentUser?.id || !Array.isArray(whisperThread?.participants)) return
			const peers = whisperThread.participants.filter(user => user?.id && user.id != currentUser.id)

			return peers.length === 1 ? peers[0].id : undefined
		}

		const from = props.message?.from

		if (typeof from === 'string' || typeof from === 'number') return from
		if (from?.id) return from.id
		if (!props.participantsByID) return

		const username = this.#element.querySelector('.thread-message__message--user-name')
			?.textContent.trim().toLowerCase()
		const matches = Object.values(props.participantsByID).filter(user => {
			return username && [user?.login, user?.displayName].some(name => name?.toLowerCase() === username)
		})

		return matches.length === 1 ? matches[0].id : undefined
	}
}

document.addEventListener(
	'chatter-labels:resolve-user-id',
	event => {
		const element = event.target

		if (!(element instanceof Element)) return
		if (element.dataset.userId && !element.matches(MessageUserId.WHISPER_SELECTOR)) return

		new MessageUserId(element)
	},
	true
)
