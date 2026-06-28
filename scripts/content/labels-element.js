import { logger } from '../logger.js'

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
		const assignedLabels = this.#options.assignments?.[this.#user.id]?.labels ?? []

		this.#options.labels.forEach(label => {
			this.#createLabelElement(
				label,
				assignedLabels.find(assignedLabel => assignedLabel.id == label.id)
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

	#createLabelElement(label, assignedLabel) {
		const
			labelElement = labelElementTemplate.content.cloneNode(true),
			checkboxElement = labelElement.querySelector('input[name="label"]')

		checkboxElement.value = label.id
		checkboxElement.checked = !!assignedLabel

		labelElement.querySelector('.name').textContent = label.name

		const assignedAtText =
			assignedLabel?.assignedAt
				? new Intl.DateTimeFormat(navigator.language, {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					}).format(new Date(assignedLabel.assignedAt))
				: ''

		labelElement.querySelector('.assigned-at').textContent = assignedAtText

		this.#formFieldsetsElement.append(labelElement)
	}

	async #save() {
		this.#options.assignments ??= {}

		const existingLabels = this.#options.assignments[this.#user.id]?.labels ?? []

		this.#options.assignments[this.#user.id] = {
			username: this.#user.name,
			labels: Array.from(
				this.#formElement.querySelectorAll('input[name="label"]:checked'),
				checkbox => {
					const existing = existingLabels.find(label => label.id == checkbox.value)
					return {
						id: checkbox.value,
						assignedAt: existing?.assignedAt ?? new Date().toISOString()
					}
				}
			)
		}

		await chrome.storage.sync.set({ options: this.#options })
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
