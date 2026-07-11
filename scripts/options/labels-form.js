import { logger } from '../logger.js'
import { Label } from '../models/label.js'
import { ToastSaved } from './toast-saved.js'

export class LabelsForm {
	#storageClient
	#labels
	#assignments
	#fieldsetsElement
	#fieldsetTemplate
	#toastSaved

	static async create(element, storageClient) {
		const
			labels = await storageClient.get('labels'),
			assignments = await storageClient.get('assignments')

		new this(element, storageClient, labels, assignments)
	}

	constructor(element, storageClient, labels, assignments) {
		this.element = element
		this.#storageClient = storageClient
		this.#labels = labels
		this.#assignments = assignments

		this.#fieldsetsElement = this.element.querySelector('.fieldsets')
		this.#fieldsetTemplate = this.element.querySelector('template#label')
		this.#toastSaved = new ToastSaved(this.element.querySelector('.toast-saved'))

		this.element.querySelector('button.add').addEventListener('click', _event => {
			this.add()
		})

		this.element.addEventListener('input', _event => {
			this.#validateUniqueNames()
		})

		this.element.addEventListener('submit', event => {
			event.preventDefault()

			this.#validateUniqueNames()

			if (!this.element.checkValidity()) return

			this.#save()
		})

		this.#renderLabels()

		this.#subscribe()
	}

	add(data = {}) {
		const
			fieldsetFragment = document.importNode(this.#fieldsetTemplate.content, true),
			fieldsetElement = fieldsetFragment.querySelector('fieldset'),
			assignmentsListElement = fieldsetFragment.querySelector('.assignments ul'),
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

			assignmentsListElement.append(assignmentFragment)
		}

		this.#fieldsetsElement.append(fieldsetFragment)
	}

	#renderLabels() {
		this.#fieldsetsElement.replaceChildren()

		this.#labels.forEach(label => { this.add(label) })
	}

	#subscribe() {
		this.#storageClient.subscribe('labels', labels => {
			this.#labels = labels
			this.#renderLabels()
		})

		this.#storageClient.subscribe('assignments', assignments => {
			this.#assignments = assignments
			this.#renderLabels()
		})
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

		this.#storageClient.set('labels', this.#labels)

		this.#assignments = this.#assignments.filter(
			assignment => this.#labels.some(label => label.id == assignment.label.id)
		)

		this.#storageClient.set('assignments', this.#assignments)

		this.#toastSaved.show()
	}

	#validateUniqueNames() {
		const seen = new Set()

		Array.from(this.element.querySelectorAll('input[name="name"]')).forEach(input => {
			const value = input.value.trim()

			input.setCustomValidity('')

			if (!value) return

			if (seen.has(value)) {
				input.setCustomValidity('Name must be unique')
			} else {
				seen.add(value)
			}
		})
	}
}
