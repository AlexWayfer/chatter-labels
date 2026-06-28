export class ToastSaved {
	#timeoutId

	constructor(element) {
		this.element = element
	}

	show() {
		clearTimeout(this.#timeoutId)

		this.element.classList.remove('hidden')
		this.#timeoutId = setTimeout(() => {
			this.element.classList.add('hidden')
		}, 1500)
	}
}
