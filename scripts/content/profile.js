import { User } from '../models/user.js'
import { TwitchAPI } from '../twitch/api.js'
import { LabelsElement } from './labels-element.js'

const ANCHOR_SELECTOR = 'a:has(h1), a[data-a-target="channel-name"]'
const response = await fetch(chrome.runtime.getURL('pages/content/profile.html'))
const templates = new DOMParser().parseFromString(await response.text(), 'text/html')
const cloneTemplate = id => templates.getElementById(id).content.firstElementChild.cloneNode(true)

export class Profile {
	#mainStorage
	#anchor
	#login
	#version = 0
	#state = 'idle'
	#retryTimer
	#retryDelay = 1000
	#element
	#summary
	#popup
	#onKeyDown
	#editor
	#user
	#labels
	#assignments
	#subscriptions = []

	constructor(mainStorage) {
		this.#mainStorage = mainStorage
		this.refresh()
	}

	refresh(anchor = this.#anchor?.isConnected ? this.#anchor : document.querySelector(ANCHOR_SELECTOR)) {
		const login = anchor?.getAttribute('href')?.match(/^\/([\w]+)\/?$/)?.[1]?.toLowerCase()

		if (!login) {
			this.destroy()
			return
		}
		if (anchor !== this.#anchor || login !== this.#login) {
			this.destroy()
			this.#anchor = anchor
			this.#login = login
		}
		if (this.#state === 'loading' || this.#retryTimer) return
		if (this.#state === 'ready' && this.#element.isConnected && this.#popup.isConnected) return
		this.#clearView()
		this.#state = 'loading'
		const version = ++this.#version

		this.#load(anchor, login, version).catch(error => {
			if (version !== this.#version) return
			this.#clearView()
			this.#state = 'failed'
			console.error('[Chatter Labels] Could not load profile labels', error)
			this.#retryTimer = setTimeout(() => {
				this.#retryTimer = null
				this.refresh()
			}, this.#retryDelay)
			this.#retryDelay = Math.min(this.#retryDelay * 2, 30000)
		})
	}

	handleMutations(mutations) {
		if (this.#anchor && !this.#anchor.isConnected ||
			this.#element && (!this.#element.isConnected || !this.#popup.isConnected)) {
			this.refresh()
			return
		}
		for (const mutation of mutations) {
			if (mutation.type === 'attributes') {
				if (mutation.target === this.#anchor ||
					!this.#anchor && mutation.target.matches(ANCHOR_SELECTOR)) {
					this.refresh(mutation.target)
					return
				}
				continue
			}
			if (this.#anchor) continue
			for (const node of mutation.addedNodes) {
				if (node.nodeType !== Node.ELEMENT_NODE) continue
				const anchor = node.matches(ANCHOR_SELECTOR)
					? node
					: node.closest(ANCHOR_SELECTOR) ?? node.querySelector(ANCHOR_SELECTOR)

				if (!anchor) continue
				this.refresh(anchor)
				return
			}
		}
	}

	async #load(anchor, login, version) {
		const [response] = await TwitchAPI.fetchUsers([login])

		if (version !== this.#version || !anchor.isConnected) return
		if (!response) throw new Error(`Profile user not found: ${login}`)
		const user = User.fromTwitch(response)
		const editor = await LabelsElement.create(user, this.#mainStorage)

		try {
			const [labels, assignments] = await Promise.all([
				this.#mainStorage.get('labels'), this.#mainStorage.get('assignments')
			])

			if (version !== this.#version || !anchor.isConnected) return
			this.#user = user
			this.#labels = labels
			this.#assignments = assignments
			this.#editor = editor
			this.#createElements()
			this.#subscribe()
			this.#renderSummary()
			this.#state = 'ready'
			this.#retryDelay = 1000
		} finally {
			if (this.#editor !== editor) editor.unsubscribe()
		}
	}

	#createElements() {
		this.#element = cloneTemplate('profile-labels')
		this.#summary = this.#element.querySelector('.chatter-labels-profile-summary')
		this.#popup = cloneTemplate('profile-labels-popup')
		const trigger = this.#element.querySelector('button')
		const popupId = `chatter-labels-profile-${chrome.runtime.id}`
		const anchorName = `--${popupId}`

		trigger.setAttribute('popovertarget', popupId)
		trigger.style.anchorName = anchorName
		this.#popup.id = popupId
		this.#popup.setAttribute('aria-label', `Labels for ${this.#user.formattedUsername}`)
		this.#popup.style.positionAnchor = anchorName
		this.#popup.querySelector('button').setAttribute('popovertarget', popupId)
		this.#popup.append(this.#editor.element)
		this.#onKeyDown = event => {
			if (event.key !== 'Escape' || !this.#popup.matches(':popover-open')) return
			event.preventDefault()
			event.stopPropagation()
			this.#popup.hidePopover()
			trigger.focus()
		}
		document.addEventListener('keydown', this.#onKeyDown, true)
		const liveInfo = this.#anchor.closest('.metadata-layout__support')?.parentElement

		if (liveInfo) liveInfo.append(this.#element)
		else this.#anchor.after(this.#element)
		document.body.append(this.#popup)
	}

	#subscribe() {
		this.#subscriptions = [
			this.#mainStorage.subscribe('labels', labels => {
				this.#labels = labels
				this.#renderSummary()
			}),
			this.#mainStorage.subscribe('assignments', assignments => {
				this.#assignments = assignments
				this.#renderSummary()
			})
		]
	}

	#renderSummary() {
		const assignedIds = new Set(this.#assignments
			.filter(assignment => assignment.user.id == this.#user.id)
			.map(assignment => String(assignment.label.id)))
		const assigned = this.#labels.filter(label => assignedIds.has(String(label.id)))

		this.#summary.replaceChildren(...assigned.map(label => {
			const element = cloneTemplate('profile-label')

			element.querySelector('img').src = label.icon
			element.querySelector('.name').textContent = label.name
			return element
		}))
		if (!assigned.length) this.#summary.textContent = 'No labels'
	}

	#clearView() {
		if (this.#onKeyDown) document.removeEventListener('keydown', this.#onKeyDown, true)
		this.#onKeyDown = null
		this.#editor?.unsubscribe()
		this.#editor = null
		for (const unsubscribe of this.#subscriptions) unsubscribe()
		this.#subscriptions = []
		this.#element?.remove()
		this.#element = null
		this.#summary = null
		this.#popup?.remove()
		this.#popup = null
	}

	destroy() {
		this.#version++
		clearTimeout(this.#retryTimer)
		this.#retryTimer = null
		this.#retryDelay = 1000
		this.#state = 'idle'
		this.#clearView()
		this.#anchor = null
		this.#login = null
	}
}
