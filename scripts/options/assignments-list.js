import { Assignment } from '../models/assignment.js'
import { User } from '../models/user.js'
import { TwitchAPI } from '../twitch/api.js'
import { confirm } from './confirm-dialog.js'
import { Toast } from './toast.js'

export class AssignmentsList {
	#mainStorage
	#element
	#label
	#assignments
	#unsubscribe
	#listElement
	#countElement
	#template
	#toggleAddButton
	#toggleRemoveButton
	#copyButton
	#sortSelect
	#form
	#textarea
	#comment
	#toastError
	#copyTimeoutId
	#unknownNicknames = []
	#rows = new Map()

	constructor(element, mainStorage, label, assignments) {
		this.#element = element
		this.#mainStorage = mainStorage
		this.#assignments = assignments

		this.#listElement = element.querySelector('ul')
		this.#countElement = element.querySelector('.count')
		this.#template = element.querySelector('template#assignment')
		this.#toggleAddButton = element.querySelector('button.toggle-add-assignments')
		this.#toggleRemoveButton = element.querySelector('button.toggle-remove-assignments')
		this.#copyButton = element.querySelector('button.copy-assignments')
		this.#sortSelect = element.querySelector('select.sort-assignments')
		this.#form = element.querySelector('form.add-assignments')
		this.#textarea = this.#form.querySelector('textarea')
		this.#comment = this.#form.querySelector('input[name="comment"]')
		this.toastAdded = new Toast(this.#form.querySelector('.added'))
		this.#toastError = new Toast(this.#form.querySelector('.error'))

		this.#toggleAddButton.addEventListener('click', _event => {
			this.#toggleAddButton.classList.toggle('active')
			this.#form.hidden = !this.#form.hidden

			if (this.#form.hidden) {
				this.#textarea.value = ''
				this.#comment.value = ''
			} else {
				this.#textarea.focus()
			}
		})

		this.#toggleRemoveButton.addEventListener('click', _event => {
			this.#removing = !this.#removing
		})

		this.#copyButton.addEventListener('click', _event => {
			this.#copy()
		})

		this.#sortSelect.addEventListener('change', _event => {
			this.#render()
		})

		this.#form.addEventListener('submit', event => {
			event.preventDefault()

			this.#add()
		})

		this.#unsubscribe = mainStorage.subscribe('assignments', assignments => {
			if (!this.#listElement.isConnected) {
				this.#unsubscribe()
				return
			}

			this.#assignments = assignments
			this.#render()
		})

		this.label = label
	}

	/** @param {import('../models/label.js').Label | null} newLabel */
	set label(newLabel) {
		if (this.#label?.id != newLabel?.id) {
			this.#rows.clear()
			this.#listElement.replaceChildren()
		}
		this.#label = newLabel
		this.#element.hidden = !newLabel
		this.#render()
	}

	async takePending() {
		this.#unknownNicknames = []

		if (!this.#label) return []

		const nicknames = this.#parseNicknames()

		if (!nicknames.length) return []

		const
			newAssignments = [],
			unknownNicknames = [],
			users = await TwitchAPI.fetchUsers(nicknames)

		for (const [index, nickname] of nicknames.entries()) {
			const user = users[index]

			if (!user) {
				unknownNicknames.push(nickname)
				continue
			}

			if (
				this.#assignments.some(assignment => {
					return assignment.label.id == this.#label.id && assignment.user.id == user.id
				})
			) {
				continue
			}

			newAssignments.push(
				new Assignment({
					user: User.fromTwitch(user),
					label: this.#label,
					assignedAt: new Date().toISOString(),
					comment: this.#comment.value
				})
			)
		}

		this.#unknownNicknames = unknownNicknames

		return newAssignments
	}

	keepUnknownNicknames() {
		this.#textarea.value = this.#unknownNicknames.join('\n')
		if (!this.#unknownNicknames.length) this.#comment.value = ''

		if (this.#unknownNicknames.length) {
			this.#toastError.show(`Unknown nicknames: ${this.#unknownNicknames.join(', ')}`)
		}
	}

	get #removing() {
		return this.#toggleRemoveButton.classList.contains('active')
	}

	/** @param {boolean} removing */
	set #removing(removing) {
		this.#toggleRemoveButton.classList.toggle('active', removing)
		this.#listElement.querySelectorAll('button.delete-assignment').forEach(button => {
			button.classList.toggle('invisible', !removing)
		})
	}

	#render() {
		if (!this.#label) {
			this.#countElement.textContent = '0'
			this.#copyButton.hidden = true
			this.#sortSelect.hidden = true
			this.#toggleRemoveButton.hidden = true
			this.#removing = false
			return
		}

		const labelAssignments = this.#sort(
			this.#assignments.filter(assignment => assignment.label.id == this.#label.id)
		)

		this.#countElement.textContent = labelAssignments.length
		this.#copyButton.hidden = !labelAssignments.length
		this.#sortSelect.hidden = !labelAssignments.length
		this.#toggleRemoveButton.hidden = !labelAssignments.length

		const nextRows = new Map()

		for (const [index, assignment] of labelAssignments.entries()) {
			const key = String(assignment.user.id)
			const row = this.#rows.get(key) ?? this.#createRow(assignment)
			const comment = row.element.querySelector('input[name="comment"]')

			row.assignment = assignment
			row.element.querySelector('.username').textContent = assignment.user.formattedUsername
			row.element.querySelector('.assigned-at').textContent = assignment.formattedAssignedAt
			if (comment.value === row.savedComment) {
				comment.value = assignment.comment
				if (row.savedComment !== assignment.comment) {
					row.element.querySelector('details').open = !!assignment.comment
				}
			}
			row.savedComment = assignment.comment
			comment.setAttribute('aria-label', `Comment for ${assignment.user.formattedUsername} (optional)`)
			nextRows.set(key, row)
			const current = this.#listElement.children[index]

			if (current !== row.element) this.#listElement.insertBefore(row.element, current ?? null)
		}
		for (const [key, row] of this.#rows) {
			if (!nextRows.has(key)) row.element.remove()
		}
		this.#rows = nextRows

		this.#removing = !this.#toggleRemoveButton.hidden && this.#removing

		this.#listElement.classList.toggle(
			'scrollable',
			this.#listElement.scrollHeight > this.#listElement.clientHeight
		)
	}

	#createRow(assignment) {
		const element = document.importNode(this.#template.content, true).querySelector('li')
		const row = { element, assignment, savedComment: assignment.comment }
		const form = element.querySelector('form')

		form.querySelector('input[name="comment"]').value = assignment.comment
		element.querySelector('details').open = !!assignment.comment
		form.addEventListener('submit', event => {
			event.preventDefault()
			this.#saveComment(form, row.assignment)
		})
		element.querySelector('button.delete-assignment').addEventListener('click', event => {
			this.#delete(event.currentTarget, row.assignment)
		})
		return row
	}

	#sort(assignments) {
		const sorted = [...assignments]

		switch (this.#sortSelect.value) {
			case 'alphabet': {
				const key = user => user.login || user.username

				sorted.sort((a, b) => key(a.user).localeCompare(
					key(b.user),
					undefined,
					{ sensitivity: 'base' }
				))
				break
			}
			case 'date':
				sorted.sort((a, b) => a.assignedAt.localeCompare(b.assignedAt))
				break
		}

		return sorted
	}

	async #copy() {
		const nicknames = this.#sort(
			this.#assignments.filter(assignment => assignment.label.id == this.#label.id)
		).map(assignment => assignment.user.login || assignment.user.username)

		try {
			await navigator.clipboard.writeText(nicknames.join('\n'))

			this.#copyButton.classList.add('copied')
			this.#copyButton.disabled = true

			clearTimeout(this.#copyTimeoutId)
			this.#copyTimeoutId = setTimeout(() => {
				this.#copyButton.classList.remove('copied')
				this.#copyButton.disabled = false
			}, 1500)
		} catch (error) {
			this.#toastError.show(error.message)
			throw error
		}
	}

	async #saveComment(form, assignment) {
		const button = form.querySelector('button')
		const comment = form.querySelector('input[name="comment"]')

		if (button.disabled) return
		const value = comment.value

		button.disabled = true
		comment.disabled = true

		try {
			await this.#mainStorage.update('assignments', assignments => assignments.map(existing => {
				return existing.user.id == assignment.user.id && existing.label.id == assignment.label.id
					? new Assignment({ ...existing, comment: value })
					: existing
			}))
			form.closest('details').open = !!comment.value
		} catch (error) {
			new Toast(form.querySelector('.error')).show(error.message)
		} finally {
			button.disabled = false
			comment.disabled = false
		}
	}

	async #delete(deleteButton, assignment) {
		if (!await confirm(`Delete assignment "${assignment.user.formattedUsername}" from "${assignment.label.name}"?`)) return

		deleteButton.disabled = true

		try {
			await this.#mainStorage.set(
				'assignments',
				this.#assignments.filter(existing => {
					return existing.user.id != assignment.user.id || existing.label.id != assignment.label.id
				})
			)
		} catch (error) {
			deleteButton.disabled = false
			this.#toastError.show(error)
			throw error
		}
	}

	async #add() {
		const saveButton = this.#form.querySelector('button[type="submit"]')

		saveButton.disabled = true

		try {
			const newAssignments = await this.takePending()

			if (!newAssignments.length) {
				this.keepUnknownNicknames()
				return
			}

			this.#assignments = [...this.#assignments, ...newAssignments]
			await this.#mainStorage.set('assignments', this.#assignments)
			this.keepUnknownNicknames()
			this.toastAdded.show()
		} catch (error) {
			this.#toastError.show(error)
			throw error
		} finally {
			saveButton.disabled = false
		}
	}

	#parseNicknames() {
		const nicknames = []

		for (const line of this.#textarea.value.split('\n')) {
			const nickname = line.trim().replace(/^@/, '')

			if (!nickname) continue
			if (nicknames.some(existing => existing.toLowerCase() == nickname.toLowerCase())) continue

			nicknames.push(nickname)
		}

		return nicknames
	}
}
