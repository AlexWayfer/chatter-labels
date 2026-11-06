import { Toast } from './toast.js'

export class Form {
	constructor(element) {
		this._element = element
		this._submitButtonElement = this._element.querySelector('button[type="submit"]')
		this._toastError = new Toast(this._element.querySelector('.toast.error'))
	}

	async _save(logic) {
		if (this._submitButtonElement.disabled) return

		this._saving = true

		try {
			await logic()
			this._submitButtonElement.classList.add('saved')
			setTimeout(() => {
				this._submitButtonElement.classList.remove('saved')
				this._submitButtonElement.disabled = false
			}, 1500)
		} catch (error) {
			this._toastError.show(error.message)

			throw error
		} finally {
			this._saving = false
		}
	}

	get _saving() {
		return this._submitButtonElement.classList.contains('saving')
	}

	set _saving(saving) {
		this._submitButtonElement.classList.toggle('saving', saving)
		this._submitButtonElement.disabled = saving || this._submitButtonElement.classList.contains('saved')
	}
}
