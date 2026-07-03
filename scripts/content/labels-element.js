import { Assignment } from '../models/assignment.js'
import { Storage } from '../storage.js'

const
	fetchResult = await fetch(chrome.runtime.getURL('pages/content/labels.html')),
	templatesHTML = await fetchResult.text(),
	parser = new DOMParser(),
	templatesDocument = parser.parseFromString(templatesHTML, 'text/html'),
	elementTemplate = templatesDocument.querySelector('template#chatter-labels'),
	labelElementTemplate = templatesDocument.querySelector('template#label-fieldset')

export class LabelsElement {
	#labels
	#assignments
	#user
	#formElement
	#formFieldsetsElement

	static async create(user) {
		const instance = new this(user)

		instance.update()

		return instance
	}

	constructor(user) {
		this.#user = user

		this.#createElement()
	}

	async update() {
		this.#labels = await Storage.getLabels()
		this.#assignments = await Storage.getAssignments()

		this.#renderLabels()
	}

	#renderLabels() {
		this.#formFieldsetsElement.replaceChildren()

		this.#labels.forEach(label => {
			this.#createLabelElement(
				label,
				this.#assignments.find(
					assignment => assignment.userId == this.#user.id && assignment.label.id == label.id
				)
			)
		})
	}

	#createElement() {
		this.element = elementTemplate.content.cloneNode(true).firstElementChild

		this.#formElement = this.element.querySelector('form')
		this.#formElement.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.#formFieldsetsElement = this.#formElement.querySelector('.fieldsets')
	}

	#createLabelElement(label, assignment) {
		const
			labelElement = labelElementTemplate.content.cloneNode(true),
			checkboxElement = labelElement.querySelector('input[name="label"]')

		checkboxElement.value = label.id
		checkboxElement.checked = !!assignment

		labelElement.querySelector('.name').textContent = label.name

		labelElement.querySelector('.assigned-at').textContent = assignment?.formattedAssignedAt ?? ''

		this.#formFieldsetsElement.append(labelElement)
	}

	async #save() {
		const newAssignments = Array.from(
			this.#formElement.querySelectorAll('input[name="label"]:checked'),
			checkbox => {
				const
					label = this.#labels.find(label => label.id == checkbox.value),
					existing = this.#assignments.find(
						assignment => assignment.userId == this.#user.id
							&& assignment.label.id == checkbox.value
					)

				return new Assignment({
					userId: this.#user.id,
					username: this.#user.name,
					label,
					assignedAt: existing?.assignedAt ?? new Date().toISOString()
				})
			}
		)

		this.#assignments = [
			...this.#assignments.filter(assignment => assignment.userId != this.#user.id),
			...newAssignments
		]

		await Storage.setAssignments(this.#assignments)
	}
}
