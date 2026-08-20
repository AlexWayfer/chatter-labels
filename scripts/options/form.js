import { Toast } from './toast.js'

export class Form {
	constructor(element) {
		this._element = element
		this._submitButtonElement = this._element.querySelector('button[type="submit"]')
		this._toastSaved = new Toast(this._element.querySelector('.toast.saved'))
		this._toastError = new Toast(this._element.querySelector('.toast.error'))
	}

	async _save(logic) {
		this._submitButtonElement.disabled = true

		try {
			await logic()
			this._toastSaved.show()
		} catch (error) {
			this._toastError.show(error)

			throw error
		} finally {
			this._submitButtonElement.disabled = false
		}
	}
}
