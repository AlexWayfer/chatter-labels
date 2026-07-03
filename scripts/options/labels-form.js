import { logger } from '../logger.js'
import { Storage } from '../storage.js'
import { Label } from '../models/label.js'
import { ToastSaved } from './toast-saved.js'

export class LabelsForm {
	#labels
	#assignments
	#fieldsetsElement
	#fieldsetTemplate
	#toastSaved

	constructor(element, labels, assignments) {
		this.element = element
		this.#labels = labels
		this.#assignments = assignments

		this.#fieldsetsElement = this.element.querySelector('.fieldsets')
		this.#fieldsetTemplate = this.element.querySelector('template#label')
		this.#toastSaved = new ToastSaved(this.element.querySelector('.toast-saved'))

		this.element.querySelector('button.add').addEventListener('click', _event => { this.add() })

		this.element.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.#labels.forEach(label => { this.add(label) })
	}

	add(data = {}) {
		const
			fieldsetFragment = document.importNode(this.#fieldsetTemplate.content, true),
			fieldsetElement = fieldsetFragment.querySelector('fieldset'),
			assignmentsElement = fieldsetFragment.querySelector('.assignments'),
			assignmentTemplate = fieldsetFragment.querySelector('template#assignment')

		fieldsetElement.querySelectorAll('input[name]').forEach(input => {
			input.value = data[input.name] ?? (input.name == 'id' ? crypto.randomUUID(): '')
		})

		fieldsetElement.querySelector('button.delete').addEventListener('click', _event => {
			fieldsetElement.remove()
		})

		for (const assignment of this.#assignments) {
			if (assignment.label.id != data.id) continue

			const assignmentFragment = document.importNode(assignmentTemplate.content, true)

			assignmentFragment.querySelector('.username').textContent = assignment.username
			assignmentFragment.querySelector('.assigned-at').textContent = assignment.formattedAssignedAt

			assignmentsElement.append(assignmentFragment)
		}

		this.#fieldsetsElement.append(fieldsetFragment)
	}

	#save() {
		this.#labels = Array.from(this.#fieldsetsElement.children).map(fieldset => {
			logger.debug('fieldset inputs = ', fieldset.querySelectorAll('input[name]'))

			return new Label(
				Object.fromEntries(
					Array.from(fieldset.querySelectorAll('input[name]')).map(
						input => [input.name, input.value]
					)
				)
			)
		})

		logger.debug('this.#labels = ', this.#labels)

		Storage.set('labels', this.#labels)

		this.#toastSaved.show()
	}
}
