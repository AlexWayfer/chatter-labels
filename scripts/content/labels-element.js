import { logger } from '../logger.js'
import { Assignment } from '../models/assignment.js'
import { UserScriptsNotice } from './user-scripts-notice.js'

const
	fetchResult = await fetch(chrome.runtime.getURL('pages/content/labels.html')),
	templatesHTML = await fetchResult.text(),
	parser = new DOMParser(),
	templatesDocument = parser.parseFromString(templatesHTML, 'text/html'),
	elementTemplate = templatesDocument.querySelector('template#chatter-labels'),
	labelElementTemplate = templatesDocument.querySelector('template#label-fieldset')

export class LabelsElement {
	#user
	#source
	#mainStorage
	#labels
	#assignments
	#subscriptions
	#formElement
	#submitButtonElement
	#formFieldsetsElement
	#saving = false
	#checks = new Map()
	#destroyed = false
	#scriptAccess
	#scriptAccessEnabled = null
	#scriptAccessRequested = false

	static async create(user, mainStorage, source = null) {
		const
			labels = await mainStorage.get('labels'),
			assignments = await this.#syncUser(
				user,
				mainStorage,
				await mainStorage.get('assignments')
			)

		return new this(user, mainStorage, labels, assignments, source)
	}

	static async #syncUser(user, mainStorage, assignments) {
		if (!assignments.some(
			assignment => assignment.user.id == user.id && !assignment.user.equals(user)
		)) {
			return assignments
		}

		const updatedAssignments = assignments.map(assignment => {
			return assignment.user.id == user.id
				? new Assignment({ ...assignment, user })
				: assignment
		})

		await mainStorage.set('assignments', updatedAssignments)

		return updatedAssignments
	}

	constructor(user, mainStorage, labels, assignments, source = null) {
		this.#user = user
		this.#source = source
		this.#mainStorage = mainStorage
		this.#labels = labels
		this.#assignments = assignments

		this.#createElement()
		this.#renderLabels()

		this.#subscribe()
	}

	#subscribe() {
		this.#subscriptions = [
			this.#mainStorage.subscribe('labels', labels => {
				this.#labels = labels
				this.#renderLabels()
			}),
			this.#mainStorage.subscribe('assignments', assignments => {
				this.#assignments = assignments
				this.#renderLabels()
			})
		]
	}

	unsubscribe() {
		this.#destroyed = true
		this.#scriptAccess.destroy()
		this.#checks.clear()
		this.#subscriptions.forEach(subscription => subscription())
	}

	#renderLabels() {
		for (const fieldset of this.#formFieldsetsElement.children) {
			const check = this.#checks.get(fieldset.querySelector('[name="label"]').value)

			if (check) check.messagesOpen = fieldset.querySelector('.check-messages').open
		}
		for (const [id, check] of this.#checks) {
			if (!this.#labels.some(label => label.id === id && label.script === check.script)) this.#checks.delete(id)
		}
		this.#formFieldsetsElement.replaceChildren()

		logger.debug('renderLabels this.#assignments = ', this.#assignments)

		this.#labels.forEach(label => {
			this.#createLabelElement(
				label,
				this.#assignments.find(
					assignment => assignment.user.id == this.#user.id && assignment.label.id == label.id
				)
			)
		})
		if (!this.#labels.some(label => label.script?.trim())) this.#scriptAccess.hide()
		else if (this.#scriptAccessRequested) this.refreshScriptAccess()
	}

	refreshScriptAccess() {
		this.#scriptAccessRequested = true
		if (this.#labels.some(label => label.script?.trim())) return this.#scriptAccess.refresh()
		this.#scriptAccess.hide()
		return Promise.resolve()
	}

	#createElement() {
		this.element = document.importNode(elementTemplate.content, true).firstElementChild

		this.#formElement = this.element.querySelector('form')
		this.#submitButtonElement = this.#formElement.querySelector('button[type="submit"]')
		this.#formElement.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.#formFieldsetsElement = this.#formElement.querySelector('.fieldsets')
		this.#scriptAccess = new UserScriptsNotice(this.element.querySelector('.user-scripts-notice'), enabled => {
			this.#scriptAccessEnabled = enabled
			for (const fieldset of this.#formFieldsetsElement.children) {
				this.#renderCheck(fieldset, this.#checks.get(fieldset.querySelector('[name="label"]').value))
			}
		})
		this.element.querySelector('.configure').addEventListener('click', event => {
			event.preventDefault()
			chrome.runtime.sendMessage({ type: 'open-options' })
		})
	}

	#createLabelElement(label, assignment) {
		const
			labelElement = labelElementTemplate.content.cloneNode(true),
			checkboxElement = labelElement.querySelector('input[name="label"]'),
			commentElement = labelElement.querySelector('input[name="comment"]')

		checkboxElement.value = label.id
		checkboxElement.checked = !!assignment
		checkboxElement.disabled = this.#saving
		commentElement.value = assignment?.comment ?? ''
		commentElement.disabled = this.#saving || !checkboxElement.checked
		commentElement.parentElement.hidden = !checkboxElement.checked
		checkboxElement.addEventListener('change', () => {
			commentElement.disabled = this.#saving || !checkboxElement.checked
			commentElement.parentElement.hidden = !checkboxElement.checked
		})

		labelElement.querySelector('.icon').src = label.icon
		labelElement.querySelector('.name').textContent = label.name

		labelElement.querySelector('.assigned-at').textContent = assignment?.formattedAssignedAt ?? ''
		const fieldset = labelElement.querySelector('fieldset')

		fieldset.querySelector('.chatter-labels-check').hidden = !label.script?.trim()
		fieldset.querySelector('.check-label').addEventListener('click', () => this.#check(label))
		fieldset.querySelector('.cancel-check').addEventListener('click', () => this.#cancelCheck(label))
		fieldset.querySelector('.check-messages').addEventListener('toggle', event => {
			const check = this.#checks.get(label.id)

			if (check && !event.currentTarget.hidden) check.messagesOpen = event.currentTarget.open
		})
		this.#renderCheck(fieldset, this.#checks.get(label.id))

		this.#formFieldsetsElement.append(labelElement)
	}

	#renderCheck(fieldset, check) {
		const button = fieldset.querySelector('.check-label')

		button.hidden = check?.completed === true
		button.disabled = this.#saving || this.#scriptAccessEnabled === false || check?.running === true
		if (check?.running) {
			const { progress } = check

			button.textContent = progress
				? `${progress.request}/${progress.total}`
				: 'Checking...'
		} else {
			button.textContent = check?.error ? 'Retry' : 'Check'
		}
		button.title = check?.running && check.progress ? `Request ${check.progress.request}/${check.progress.total}` : ''
		button.setAttribute('aria-busy', String(check?.running === true))
		const cancel = fieldset.querySelector('.cancel-check')
		const counts = check?.running && check.progress
			? `${check.progress.count} of ${check.progress.checked} candidates`
			: ''

		cancel.hidden = !check?.running
		cancel.disabled = !!check?.cancelling
		cancel.textContent = check?.cancelling ? 'Stopping...' : 'Stop'
		const result = fieldset.querySelector('.check-result')

		result.hidden = !check?.cancelError && !counts && (!check?.completed && !check?.error && !check?.cancelled)
		const text = check?.cancelError ?? (counts || check?.text || '')

		if (result.textContent !== text) result.textContent = text
		result.classList.toggle('error', !!(check?.error || check?.cancelError))
		const details = fieldset.querySelector('.check-messages')
		const messages = check?.messages ?? []
		const list = details.querySelector('ol')

		details.hidden = messages.length === 0
		details.open = !details.hidden && !!check.messagesOpen
		details.querySelector('summary').textContent = `Messages (${messages.length})`
		list.replaceChildren(...messages.map(message => {
			const item = document.createElement('li')
			const text = document.createElement('p')
			const date = new Date(message.timestamp)

			if (!Number.isNaN(date.getTime())) {
				const time = document.createElement('time')

				time.dateTime = date.toISOString()
				time.textContent = date.toLocaleString()
				if (typeof message.id === 'string' && message.id && (/^\d+$/).test(message.channelId)) {
					const url = new URL('https://lurkology.com/logs')
					const link = document.createElement('a')

					url.search = new URLSearchParams({ c: 'id:' + message.channelId, d: date.toISOString().slice(0, 10) })
					url.hash = encodeURIComponent(message.id)
					link.href = url.href
					link.target = '_blank'
					link.rel = 'noopener noreferrer'
					link.title = 'Open in Lurkology chat'
					link.setAttribute('aria-label', time.textContent + ' — Open in Lurkology chat')
					link.append(time, ' ↗')
					item.append(link)
				} else {
					item.append(time)
				}
			}
			text.textContent = message.text
			item.append(text)
			return item
		}))
	}

	#updateCheck(label) {
		for (const fieldset of this.#formFieldsetsElement.children) {
			if (fieldset.querySelector('[name="label"]').value === label.id) {
				this.#renderCheck(fieldset, this.#checks.get(label.id))
			}
		}
	}

	async #check(label) {
		const previous = this.#checks.get(label.id)

		if (this.#saving || this.#scriptAccessEnabled === false || previous?.running || previous?.completed) return
		const requestId = crypto.randomUUID()
		const check = { script: label.script, running: true, requestId }
		const onProgress = (message, sender) => {
			if (message?.type !== 'label-check-progress' || message.requestId !== requestId ||
				sender.id !== chrome.runtime.id || this.#checks.get(label.id) !== check) return
			if (message.sequence > (check.progress?.sequence ?? 0)) {
				check.progress = message
				this.#updateCheck(label)
			}
		}

		this.#checks.set(label.id, check)
		this.#updateCheck(label)
		chrome.runtime.onMessage.addListener(onProgress)
		try {
			const response = await chrome.runtime.sendMessage({
				type: 'run-label-check',
				requestId,
				labelId: label.id,
				user: this.#user,
				source: this.#source,
				pageUrl: this.element.ownerDocument.location.href
			})

			if (!response?.ok) {
				throw Object.assign(new Error(response?.error ?? 'Could not run the check. Reload this page and try again.'), {
					code: response?.code, partial: response?.partial
				})
			}
			const value = response.value

			if (value && typeof value === 'object') {
				check.text = value.text
				check.messages = value.messages
			} else {
				check.text = value === true ? 'Yes' : value === false ? 'No' : value == null ? 'Unknown' : String(value)
			}
			check.completed = true
		} catch (error) {
			if (error.code === 'label-check-cancelled') {
				check.text = error.partial?.text ?? 'Stopped.'
				check.messages = error.partial?.messages ?? []
				check.cancelled = true
			} else if (error.code === 'user-scripts-disabled' && !this.#destroyed && this.#checks.get(label.id) === check) {
				check.text = ''
				await this.refreshScriptAccess()
			} else {
				check.text = `Error: ${error.message}`
				check.error = true
			}
		} finally {
			chrome.runtime.onMessage.removeListener(onProgress)
			check.running = false
			delete check.cancelError
			if (!this.#destroyed && this.#checks.get(label.id) === check) this.#updateCheck(label)
		}
	}

	async #cancelCheck(label) {
		const check = this.#checks.get(label.id)

		if (!check?.running || check.cancelling) return
		check.cancelling = true
		delete check.cancelError
		this.#updateCheck(label)
		try {
			const response = await chrome.runtime.sendMessage({ type: 'cancel-label-check', requestId: check.requestId })

			if (!response?.ok) throw new Error(response?.error ?? 'The extension did not respond.')
		} catch (error) {
			if (!check.running || this.#checks.get(label.id) !== check) return
			check.cancelling = false
			check.cancelError = `Could not cancel the check: ${error.message}`
			this.#updateCheck(label)
		}
	}

	#setSaving(saving) {
		this.#saving = saving
		this.#submitButtonElement.disabled = saving
		this.#formElement.querySelectorAll('input[name="label"]').forEach(checkbox => {
			checkbox.disabled = saving
			checkbox.closest('fieldset').querySelector('input[name="comment"]').disabled = saving || !checkbox.checked
			this.#renderCheck(checkbox.closest('fieldset'), this.#checks.get(checkbox.value))
		})
	}

	async #save() {
		if (this.#saving) return
		this.#setSaving(true)

		try {
			const newAssignments = Array.from(
				this.#formElement.querySelectorAll('input[name="label"]:checked'),
				checkbox => {
					const
						label = this.#labels.find(label => label.id == checkbox.value),
						existing = this.#assignments.find(
							assignment => assignment.user.id == this.#user.id &&
								assignment.label.id == checkbox.value
						)

					return new Assignment({
						user: this.#user,
						label,
						assignedAt: existing?.assignedAt ?? new Date().toISOString(),
						comment: checkbox.closest('fieldset').querySelector('input[name="comment"]').value
					})
				}
			)

			this.#assignments = [
				...this.#assignments.filter(assignment => assignment.user.id != this.#user.id),
				...newAssignments
			]

			logger.debug('save this.#assignments = ', this.#assignments)

			await this.#mainStorage.set('assignments', this.#assignments)
		} finally {
			this.#setSaving(false)
		}
	}
}
