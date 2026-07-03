import { logger } from '../logger.js'
import { Storage } from '../storage.js'
import { Label } from '../models/label.js'
import { ToastSaved } from './toast-saved.js'

export class LabelsForm {
	#fieldsetsElement
	#fieldsetTemplate
	#toastSaved

	constructor(element, labels) {
		this.element = element
		this.labels = labels

		this.#fieldsetsElement = this.element.querySelector('.fieldsets')
		this.#fieldsetTemplate = this.element.querySelector('template#label')
		this.#toastSaved = new ToastSaved(this.element.querySelector('.toast-saved'))

		this.element.querySelector('button.add').addEventListener('click', _event => { this.add() })

		this.element.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.labels.forEach(label => { this.add(label) })
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
		this.labels = Array.from(this.#fieldsetsElement.children).map(fieldset => {
			logger.debug('fieldset inputs = ', fieldset.querySelectorAll('input[name]'))

			return new Label(
				Object.fromEntries(
					Array.from(fieldset.querySelectorAll('input[name]')).map(
						input => [input.name, input.value]
					)
				)
			)
		})

		logger.debug('labels = ', this.labels)

		Storage.set('labels', this.labels)

		this.#toastSaved.show()
	}
}
