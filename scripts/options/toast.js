export class Toast {
	#timeoutId

	constructor(element) {
		this._element = element
	}

	show(text = null) {
		clearTimeout(this.#timeoutId)

		if (text) this._element.textContent = text
		this._element.hidden = false

		this.#timeoutId = setTimeout(() => {
			this._element.hidden = true
			if (text) this._element.textContent = ''
		}, 1500)
	}
}
