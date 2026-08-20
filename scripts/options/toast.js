export class Toast {
	#timeoutId

	constructor(element) {
		this._element = element
	}

	show(text = null) {
		clearTimeout(this.#timeoutId)

		if (text) this._element.textContent = text
		this._element.classList.remove('hidden')

		this.#timeoutId = setTimeout(() => {
			this._element.classList.add('hidden')
			if (text) this._element.textContent = ''
		}, 1500)
	}
}
