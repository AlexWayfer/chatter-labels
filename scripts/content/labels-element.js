import { logger } from '../logger.js'
import { OptionsStorage } from '../options/storage.js'
import { Assignment } from '../assignment.js'

const
	fetchResult = await fetch(chrome.runtime.getURL('pages/content/labels.html')),
	templatesHTML = await fetchResult.text(),
	parser = new DOMParser(),
	templatesDocument = parser.parseFromString(templatesHTML, 'text/html'),
	elementTemplate = templatesDocument.querySelector('template#chatter-labels'),
	labelElementTemplate = templatesDocument.querySelector('template#label-fieldset')

const instances = new Set()

export class LabelsElement {
	static CLASS_NAME = elementTemplate.content.firstElementChild.className

	static updateAll(options) {
		for (const instance of instances) {
			instance.options = options
		}
	}

	#chatterCard
	#options
	#user
	#element
	#formElement
	#formFieldsetsElement

	constructor(chatterCard, options) {
		this.#chatterCard = chatterCard
		this.#options = options

		this.#fetchUserInfo().then(() => {
			this.#createElement()

			this.#renderLabels()

			this.#observeRemoval()

			instances.add(this)
		})
	}

	/** @param {object} newValue */
	set options(newValue) {
		this.#options = newValue
		this.#formFieldsetsElement.replaceChildren()
		this.#renderLabels()
	}

	#renderLabels() {
		this.#options.labels.forEach(label => {
			this.#createLabelElement(
				label,
				this.#options.assignments.find(
					assignment => assignment.userId == this.#user.id && assignment.label.id == label.id
				)
			)
		})
	}

	async #fetchUserInfo() {
		const findUsername = () => {
			return this.#chatterCard.querySelector('.viewer-card-header__display-name a')?.textContent
		}

		const username = await new Promise(resolve => {
			const existingUsername = findUsername()
			if (existingUsername) return resolve(existingUsername)

			const observer = new MutationObserver(() => {
				const foundUsername = findUsername()
				if (foundUsername) {
					observer.disconnect()
					resolve(foundUsername)
				}
			})

			observer.observe(this.#chatterCard, { childList: true, subtree: true })
		})

		logger.debug('username = ', username)

		const requestBody = JSON.stringify({ query: `{ user(login: "${username}") { id } }` })
		logger.debug('user info request body = ', requestBody)

		const
			response = await fetch('https://gql.twitch.tv/gql', {
				method: 'POST',
				headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
				body: requestBody
			}),
			responseJSON = await response.json()

		logger.debug('user info response = ', response)
		logger.debug('user info response json = ', responseJSON)

		this.#user = { name: username, id: responseJSON.data.user.id }
	}

	#createElement() {
		this.#element = elementTemplate.content.cloneNode(true).firstElementChild

		this.#formElement = this.#element.querySelector('form')
		this.#formElement.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.#formFieldsetsElement = this.#formElement.querySelector('.fieldsets')

		this.#chatterCard.querySelector('.viewer-card-header__background').after(this.#element)
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

	#observeRemoval() {
		const observer = new MutationObserver(() => {
			if (this.#chatterCard.isConnected) return

			instances.delete(this)
			observer.disconnect()
		})

		observer.observe(this.#chatterCard.parentNode, { childList: true })
	}
}
