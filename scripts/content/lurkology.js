import { User } from '../models/user.js'
import { ChatMessage } from './chat-message.js'
import { LabelsControl } from './labels-control.js'
import { logger } from '../logger.js'

export class Lurkology {
	static ROW_SELECTOR = 'span.row-start-3:has(> a[title="Permalink"])'
	static USERNAME_SELECTOR = 'button.font-bold'

	#storage
	#rows = new Map()
	#subscriptions = []
	#observer
	#onClick
	#onUsers
	#selectedUser
	#card
	#control
	#request
	#destroyed = false

	kind = { usernameSelector: Lurkology.USERNAME_SELECTOR }

	static async create(storage) {
		const [labels, assignments] = await Promise.all([storage.get('labels'), storage.get('assignments')])

		return new this(storage, labels, assignments)
	}

	constructor(storage, labels, assignments) {
		document.documentElement.classList.add('chatter-labels-lurkology-page')
		this.#storage = storage
		this.labels = labels
		this.assignments = assignments
		this.#subscriptions = ['labels', 'assignments'].map(key => storage.subscribe(key, value => {
			this[key] = value
			this.#refresh(true)
		}))
		this.#onUsers = () => this.#refresh()
		this.#onClick = event => {
			const author = event.target.closest?.(this.constructor.USERNAME_SELECTOR)
			const row = author?.closest(this.constructor.ROW_SELECTOR)

			if (row) {
				this.userIdFrom(row)
				this.#selectedUser = row.dataset.userId
					? new User({ id: row.dataset.userId, username: row.dataset.username })
					: null
				this.#clearCard()
			} else if (!event.target.closest?.('[data-dialog-content], .chatter-labels-popup')) {
				this.#selectedUser = null
				this.#clearCard()
			}
		}
		document.addEventListener('click', this.#onClick, true)
		document.addEventListener('chatter-labels:lurkology-users', this.#onUsers)
		this.#observer = new MutationObserver(() => this.#refresh())
		this.#observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: ['href', 'data-state']
		})
		this.#refresh()
	}

	userIdFrom(row) {
		row.dispatchEvent(new Event('chatter-labels:resolve-lurkology-user', { bubbles: true }))
		return row.dataset.userId
	}

	#refresh(force = false) {
		if (this.#destroyed) return
		const rows = new Set(document.querySelectorAll(this.constructor.ROW_SELECTOR))

		for (const [row] of this.#rows) {
			if (rows.has(row)) continue
			row.querySelectorAll(ChatMessage.ICONS_SELECTOR).forEach(icons => icons.remove())
			this.#rows.delete(row)
		}
		for (const row of rows) {
			const author = row.querySelector(this.constructor.USERNAME_SELECTOR)
			const id = this.userIdFrom(row)
			const previous = this.#rows.get(row)
			const icons = row.querySelector(ChatMessage.ICONS_SELECTOR)

			if (!force && previous?.id === id && previous?.author === author &&
				previous?.hasIcons === !!icons && (!icons || icons.nextElementSibling === author)) continue
			const message = previous?.message ?? new ChatMessage(row, this)

			if (previous) message.render()
			this.#rows.set(row, { id, author, message, hasIcons: !!row.querySelector(ChatMessage.ICONS_SELECTOR) })
		}
		this.#refreshCard()
	}

	#clearCard() {
		this.#request = null
		this.#control?.destroy()
		this.#control = null
		this.#card = null
	}

	#refreshCard() {
		const card = [...document.querySelectorAll('[data-dialog-content]')].find(element => {
			return element.dataset.state !== 'closed' &&
				element.querySelector('[data-dialog-title]')?.textContent.trim() === 'User card'
		})

		if (card !== this.#card) this.#clearCard()
		if (!card || !this.#selectedUser || this.#request) return
		this.#card = card
		const request = {}
		const user = this.assignments.find(assignment => assignment.user.id == this.#selectedUser.id)?.user ?? this.#selectedUser

		this.#request = request
		LabelsControl.create(user, this.#storage).then(control => {
			if (this.#destroyed || this.#request !== request || !card.isConnected) {
				control.destroy()
				return
			}
			this.#control = control
			control.element.classList.add('chatter-labels-lurkology')
			control.popup.classList.add('chatter-labels-lurkology')
			card.append(control.element)
			control.mountPopup(card)
		})
			.catch(error => {
				if (this.#request === request) this.#request = null
				logger.debug('Could not create Lurkology labels control', error)
			})
	}

	destroy() {
		if (this.#destroyed) return
		this.#destroyed = true
		document.documentElement.classList.remove('chatter-labels-lurkology-page')
		this.#observer.disconnect()
		document.removeEventListener('click', this.#onClick, true)
		document.removeEventListener('chatter-labels:lurkology-users', this.#onUsers)
		for (const unsubscribe of this.#subscriptions) unsubscribe()
		for (const row of this.#rows.keys()) {
			row.querySelectorAll(ChatMessage.ICONS_SELECTOR).forEach(icons => icons.remove())
			delete row.dataset.userId
			delete row.dataset.username
		}
		this.#rows.clear()
		this.#clearCard()
	}
}
