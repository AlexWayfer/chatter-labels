import { User } from '../models/user.js'
import { TwitchAPI } from '../twitch/api.js'
import { LabelsControl } from './labels-control.js'

const ANCHOR_SELECTOR = 'a:has(h1), a[data-a-target="channel-name"]'

export class Profile {
	#mainStorage
	#anchor
	#login
	#version = 0
	#state = 'idle'
	#retryTimer
	#retryDelay = 1000
	#control

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
		if (this.#state === 'ready' && this.#control.isConnected) return
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
			this.#control && !this.#control.isConnected) {
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
		const control = await LabelsControl.create(user, this.#mainStorage)

		try {
			if (version !== this.#version || !anchor.isConnected) return
			this.#control = control
			const liveInfo = anchor.closest('.metadata-layout__support')?.parentElement

			if (liveInfo) liveInfo.append(control.element)
			else anchor.after(control.element)
			control.mountPopup()
			this.#state = 'ready'
			this.#retryDelay = 1000
		} finally {
			if (this.#control !== control) control.destroy()
		}
	}

	#clearView() {
		this.#control?.destroy()
		this.#control = null
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
