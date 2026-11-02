class MessageUserId {
	static WHISPER_SELECTOR = '.whispers-list-item, .whispers__header, .thread-header, .thread-message__message'
	static EVENT_SELECTOR = '.moderation-actions-list-item__clickable-name, .activity-base-list-item__subtitle button.tw-link'
	static DYNAMIC_SELECTOR = `${this.WHISPER_SELECTOR}, ${this.EVENT_SELECTOR}`

	#element
	#whisper
	#eventUser

	constructor(element) {
		this.#element = element
		this.#whisper = element.matches(this.constructor.WHISPER_SELECTOR)
		this.#eventUser = element.matches(this.constructor.EVENT_SELECTOR)

		const userId = this.#fromFiber()

		if (userId) this.#element.dataset.userId = userId
		else if (this.#whisper || this.#eventUser) delete this.#element.dataset.userId
	}

	#fromFiber() {
		let fiber

		for (let element = this.#element; element; element = element.parentElement) {
			const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'))

			if (key) fiber = element[key]
			if (fiber || !this.#whisper && !this.#eventUser) break
		}

		let root = fiber

		while (root?.return) root = root.return
		if (root?.stateNode?.current && root.stateNode.current !== root) fiber = fiber.alternate ?? fiber

		for (let depth = 0; depth < 40 && fiber; depth++) {
			const props = fiber.memoizedProps ?? {}

			if (this.#eventUser) {
				const key = this.#element.matches('.moderation-actions-list-item__clickable-name')
					? 'event'
					: 'activity'

				if (Object.hasOwn(props, key)) return this.#fromEvent(props[key])
				fiber = fiber.return
				continue
			}

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

	#fromEvent(data) {
		if (!data) return
		const username = this.#element.textContent.trim().toLowerCase()
		const ids = new Set()

		for (const text of [data.title, data.content]) {
			const fragments = text?.localizedStringFragments ?? text?.fragments

			if (!Array.isArray(fragments)) continue
			for (const fragment of fragments) {
				const token = fragment?.token
				const id = token?.userID ?? token?.id

				if (!id || typeof token.login !== 'string') continue
				const names = [token.login, token.displayName, `${token.displayName} (${token.login})`]

				if (names.some(name => name?.toLowerCase() === username)) ids.add(String(id))
			}
		}
		return ids.size === 1 ? [...ids][0] : undefined
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
		if (element.dataset.userId && !element.matches(MessageUserId.DYNAMIC_SELECTOR)) return

		new MessageUserId(element)
	},
	true
)
