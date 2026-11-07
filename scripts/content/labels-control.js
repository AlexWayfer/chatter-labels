import { LabelsElement } from './labels-element.js'

const response = await fetch(chrome.runtime.getURL('pages/content/labels-control.html'))
const templates = new DOMParser().parseFromString(await response.text(), 'text/html')
const cloneTemplate = id => templates.getElementById(id).content.firstElementChild.cloneNode(true)
let nextId = 0

export class LabelsControl {
	#user
	#editor
	#summary
	#labels
	#assignments
	#subscriptions = []
	#onKeyDown

	static async create(user, mainStorage, source = null) {
		const editor = await LabelsElement.create(user, mainStorage, source)

		try {
			const [labels, assignments] = await Promise.all([
				mainStorage.get('labels'), mainStorage.get('assignments')
			])

			return new this(user, mainStorage, editor, labels, assignments)
		} catch (error) {
			editor.unsubscribe()
			throw error
		}
	}

	constructor(user, mainStorage, editor, labels, assignments) {
		this.#user = user
		this.#editor = editor
		this.#labels = labels
		this.#assignments = assignments
		this.element = cloneTemplate('labels-control')
		this.#summary = this.element.querySelector('.chatter-labels-summary')
		this.popup = cloneTemplate('labels-popup')
		const trigger = this.element.querySelector('button')
		const popupId = `chatter-labels-${chrome.runtime.id}-${++nextId}`
		const anchorName = `--${popupId}`

		trigger.setAttribute('popovertarget', popupId)
		trigger.style.anchorName = anchorName
		this.popup.id = popupId
		this.popup.setAttribute('aria-label', `Labels for ${user.formattedUsername}`)
		this.popup.style.positionAnchor = anchorName
		this.popup.querySelector('button').setAttribute('popovertarget', popupId)
		this.popup.append(editor.element)
		this.popup.addEventListener('toggle', event => {
			if (event.newState === 'open') editor.refreshScriptAccess()
		})
		this.#onKeyDown = event => {
			if (event.key !== 'Escape' || !this.popup.matches(':popover-open')) return
			event.preventDefault()
			event.stopImmediatePropagation()
			this.popup.hidePopover()
			trigger.focus()
		}
		document.addEventListener('keydown', this.#onKeyDown, true)
		this.#subscriptions = [
			mainStorage.subscribe('labels', labels => {
				this.#labels = labels
				this.#renderSummary()
			}),
			mainStorage.subscribe('assignments', assignments => {
				this.#assignments = assignments
				this.#renderSummary()
			})
		]
		this.#renderSummary()
	}

	mountPopup(parent = document.body) {
		parent.append(this.popup)
	}

	get isConnected() {
		return this.element.isConnected && this.popup.isConnected
	}

	#renderSummary() {
		const assignedIds = new Set(this.#assignments
			.filter(assignment => assignment.user.id == this.#user.id)
			.map(assignment => String(assignment.label.id)))
		const assigned = this.#labels.filter(label => assignedIds.has(String(label.id)))

		this.#summary.replaceChildren(...assigned.map(label => {
			const element = cloneTemplate('label-summary')

			element.querySelector('img').src = label.icon
			element.querySelector('.name').textContent = label.name
			return element
		}))
		if (!assigned.length) this.#summary.textContent = 'No labels'
	}

	destroy() {
		document.removeEventListener('keydown', this.#onKeyDown, true)
		this.#editor.unsubscribe()
		for (const unsubscribe of this.#subscriptions) unsubscribe()
		this.#subscriptions = []
		this.element.remove()
		this.popup.remove()
	}
}
