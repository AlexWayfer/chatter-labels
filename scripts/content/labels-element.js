import { OptionsStorage } from '../options/storage.js'
import { Assignment } from '../models/assignment.js'

const
	fetchResult = await fetch(chrome.runtime.getURL('pages/content/labels.html')),
	templatesHTML = await fetchResult.text(),
	parser = new DOMParser(),
	templatesDocument = parser.parseFromString(templatesHTML, 'text/html'),
	elementTemplate = templatesDocument.querySelector('template#chatter-labels'),
	labelElementTemplate = templatesDocument.querySelector('template#label-fieldset')

export class LabelsElement {
	static CLASS_NAME = elementTemplate.content.firstElementChild.className

	#options
	#user
	#formElement
	#formFieldsetsElement

	constructor(user, options) {
		this.#user = user
		this.#options = options

		this.#createElement()
		this.#renderLabels()
	}

	/** @param {object} newValue */
	set options(newValue) {
		this.#options = newValue
		this.#renderLabels()
	}

	#renderLabels() {
		this.#formFieldsetsElement.replaceChildren()

		this.#options.labels.forEach(label => {
			this.#createLabelElement(
				label,
				this.#options.assignments.find(
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
					label = this.#options.labels.find(label => label.id == checkbox.value),
					existing = this.#options.assignments.find(
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

		this.#options.assignments = [
			...this.#options.assignments.filter(assignment => assignment.userId != this.#user.id),
			...newAssignments
		]

		await OptionsStorage.save(this.#options)
	}
}
