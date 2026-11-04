export class ThemeControl {
	#element
	#storage
	#buttons
	#error
	#media
	#mode = 'system'
	#selected = 'system'
	#pending = 0
	#request = 0

	static async create(element, storage) {
		const control = new this(element, storage)

		try {
			control.#setMode(await storage.get('theme'))
			control.#disable(false)
		} catch {
			control.#showError('Could not load theme. Reload to try again.')
		}
		return control
	}

	constructor(element, storage) {
		this.#element = element
		this.#storage = storage
		this.#buttons = [...element.querySelectorAll('button')]
		this.#error = element.querySelector('.error')
		this.#media = element.ownerDocument.defaultView.matchMedia('(prefers-color-scheme: dark)')
		this.#apply()
		this.#media.addEventListener('change', () => this.#apply())
		for (const button of this.#buttons) {
			button.addEventListener('click', () => this.save(button.value))
		}
		element.addEventListener('keydown', event => this.#keydown(event))
		storage.subscribe('theme', mode => {
			this.#mode = ['light', 'dark'].includes(mode) ? mode : 'system'
			if (!this.#pending) this.#setMode(this.#mode)
		})
	}

	async save(mode) {
		const request = ++this.#request

		this.#pending++
		this.#selected = mode
		this.#error.hidden = true
		this.#apply()
		try {
			await this.#storage.set('theme', mode)
			this.#mode = mode
		} catch {
			if (request == this.#request) this.#showError('Could not save theme. Please try again.')
		} finally {
			this.#pending--
			if (request == this.#request) this.#setMode(this.#mode)
		}
	}

	#setMode(mode) {
		this.#mode = ['light', 'dark'].includes(mode) ? mode : 'system'
		this.#selected = this.#mode
		this.#apply()
	}

	#apply() {
		const mode = this.#selected
		const dark = mode == 'dark' || mode == 'system' && this.#media.matches

		this.#element.ownerDocument.body.classList.toggle('dark', dark)
		for (const button of this.#buttons) {
			const selected = button.value == mode

			button.classList.toggle('active', selected)
			button.setAttribute('aria-pressed', String(selected))
		}
	}

	#disable(disabled) {
		for (const button of this.#buttons) button.disabled = disabled
	}

	#keydown(event) {
		const index = this.#buttons.indexOf(event.target)

		if (index < 0 || event.target.disabled) return
		const next = {
			ArrowRight: (index + 1) % this.#buttons.length,
			ArrowLeft: (index + this.#buttons.length - 1) % this.#buttons.length,
			Home: 0,
			End: this.#buttons.length - 1
		}[event.key]

		if (next == null) return
		event.preventDefault()
		this.#buttons[next].focus()
		this.save(this.#buttons[next].value)
	}

	#showError(message) {
		this.#error.textContent = message
		this.#error.hidden = false
	}
}
