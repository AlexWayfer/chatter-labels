export class UserScriptsNotice {
	#element
	#onChange
	#send
	#pending
	#generation = 0
	#active = false
	#destroyed = false
	#onFocus
	#window

	constructor(element, onChange = () => {}, send = message => chrome.runtime.sendMessage(message)) {
		this.#element = element
		this.#onChange = onChange
		this.#send = send
		this.#window = element.ownerDocument.defaultView
		element.querySelector('.retry-user-scripts').addEventListener('click', () => this.refresh())
		element.querySelector('.open-user-scripts-settings').addEventListener('click', async () => {
			try {
				const response = await this.#send({ type: 'open-user-scripts-settings' })

				if (!response?.ok) throw new Error(response?.error ?? 'Could not open extension settings.')
			} catch (error) {
				if (!this.#destroyed) this.#message(`${error.message} Open chrome://extensions manually.`)
			}
		})
		this.#onFocus = () => {
			if (this.#active) this.refresh()
		}
		this.#window.addEventListener('focus', this.#onFocus)
	}

	#message(text) {
		this.#element.querySelector('[role="status"]').textContent = text
		this.#element.hidden = false
	}

	refresh() {
		if (this.#destroyed) return Promise.resolve()
		this.#active = true
		if (this.#pending) return this.#pending
		const generation = ++this.#generation
		const retry = this.#element.querySelector('.retry-user-scripts')

		retry.disabled = true
		this.#pending = (async () => {
			try {
				const status = await Promise.resolve().then(() => this.#send({ type: 'user-scripts-status' }))

				if (this.#destroyed || generation !== this.#generation) return
				if (typeof status?.enabled !== 'boolean') throw new Error('Could not check user script access. Reload this page and try again.')
				this.#element.hidden = status.enabled
				if (!status.enabled) this.#message(status.message)
				this.#onChange(status.enabled)
			} catch (error) {
				if (!this.#destroyed && generation === this.#generation) this.#message(error.message)
			} finally {
				if (generation === this.#generation) {
					retry.disabled = false
					this.#pending = null
				}
			}
		})()
		return this.#pending
	}

	hide() {
		this.#generation++
		this.#pending = null
		this.#active = false
		this.#element.hidden = true
		this.#element.querySelector('.retry-user-scripts').disabled = false
		this.#onChange(null)
	}

	destroy() {
		this.#destroyed = true
		this.#window.removeEventListener('focus', this.#onFocus)
	}
}
