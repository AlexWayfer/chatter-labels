import { Assignment } from '../models/assignment.js'
import { User } from '../models/user.js'
import { TwitchAPI } from '../twitch/api.js'
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
	#form
	#textarea
	#toastError
	#copyTimeoutId
	#unknownNicknames = []

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
		this.#form = element.querySelector('form.add-assignments')
		this.#textarea = this.#form.querySelector('textarea')
		this.toastAdded = new Toast(this.#form.querySelector('.added'))
		this.#toastError = new Toast(this.#form.querySelector('.error'))

		this.#toggleAddButton.addEventListener('click', _event => {
			this.#toggleAddButton.classList.toggle('active')
			this.#form.hidden = !this.#form.hidden

			if (this.#form.hidden) {
				this.#textarea.value = ''
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
					assignedAt: new Date().toISOString()
				})
			)
		}

		this.#unknownNicknames = unknownNicknames

		return newAssignments
	}

	keepUnknownNicknames() {
		this.#textarea.value = this.#unknownNicknames.join('\n')

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
		this.#listElement.replaceChildren()

		if (!this.#label) {
			this.#countElement.textContent = '0'
			this.#copyButton.hidden = true
			this.#toggleRemoveButton.hidden = true
			this.#removing = false
			return
		}

		const labelAssignments = this.#assignments.filter(
			assignment => assignment.label.id == this.#label.id
		)

		this.#countElement.textContent = labelAssignments.length
		this.#copyButton.hidden = !labelAssignments.length
		this.#toggleRemoveButton.hidden = !labelAssignments.length

		for (const assignment of labelAssignments) {
			const
				assignmentFragment = document.importNode(this.#template.content, true),
				assignmentElement = assignmentFragment.querySelector('li'),
				deleteButton = assignmentElement.querySelector('button.delete-assignment')

			assignmentElement.querySelector('.username').textContent = assignment.user.formattedUsername
			assignmentElement.querySelector('.assigned-at').textContent = assignment.formattedAssignedAt

			deleteButton.addEventListener('click', event => {
				this.#delete(event.currentTarget, assignment)
			})

			this.#listElement.append(assignmentFragment)
		}

		this.#removing = !this.#toggleRemoveButton.hidden && this.#removing
	}

	async #copy() {
		const nicknames = this.#assignments
			.filter(assignment => assignment.label.id == this.#label.id)
			.map(assignment => assignment.user.login || assignment.user.username)

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

	async #delete(deleteButton, assignment) {
		if (!confirm(`Delete assignment "${assignment.user.formattedUsername}" from "${assignment.label.name}"?`)) return

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
