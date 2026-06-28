import { logger } from '../logger.js'
import { OptionsStorage } from './storage.js'
import { Label } from '../models/label.js'
import { ToastSaved } from './toast-saved.js'

export class LabelsForm {
	#fieldsetsElement
	#fieldsetTemplate
	#toastSaved

	constructor(element, options) {
		this.element = element
		this.options = options

		this.#fieldsetsElement = this.element.querySelector('.fieldsets')
		this.#fieldsetTemplate = this.element.querySelector('template#label')
		this.#toastSaved = new ToastSaved(this.element.querySelector('.toast-saved'))

		this.element.querySelector('button.add').addEventListener('click', _event => { this.add() })

		this.element.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.options.labels.forEach(label => { this.add(label) })
	}

	add(data = {}) {
		const fieldset = document.importNode(this.#fieldsetTemplate.content, true)

		fieldset.querySelectorAll('input[name]').forEach(input => {
			input.value = data[input.name] ?? (input.name == 'id' ? crypto.randomUUID(): '')
		})

		fieldset.querySelector('button.delete').addEventListener('click', event => {
			event.target.closest('fieldset').remove()
		})

		this.#fieldsetsElement.append(fieldset)
	}

	#save() {
		this.options.labels = Array.from(this.#fieldsetsElement.children).map(fieldset => {
			logger.debug('fieldset inputs = ', fieldset.querySelectorAll('input[name]'))

			return new Label(
				Object.fromEntries(
					Array.from(fieldset.querySelectorAll('input[name]')).map(
						input => [input.name, input.value]
					)
				)
			)
		})

		logger.debug('options = ', this.options)

		OptionsStorage.save(this.options)

		this.#toastSaved.show()
	}
}
