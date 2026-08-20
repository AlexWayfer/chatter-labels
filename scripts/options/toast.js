export class Toast {
	#timeoutId

	constructor(element) {
		this.element = element
	}

	show(text = null) {
		clearTimeout(this.#timeoutId)

		if (text) this.element.textContent = text
		this.element.classList.remove('hidden')

		this.#timeoutId = setTimeout(() => {
			this.element.classList.add('hidden')
			if (text) this.element.textContent = ''
		}, 1500)
	}
}
