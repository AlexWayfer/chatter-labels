import { Assignment } from '../models/assignment.js'
import { TwitchAPI } from '../twitch/api.js'
import { Toast } from './toast.js'

export class AssignmentsList {
	#mainStorage
	#element
	#label
	#assignments
	#unsubscribe
	#listElement
	#template
	#toggleAddButton
	#toggleRemoveButton
	#form
	#textarea
	#toastAdded
	#toastError

	constructor(element, mainStorage, label, assignments) {
		this.#element = element
		this.#mainStorage = mainStorage
		this.#assignments = assignments

		this.#listElement = element.querySelector('ul')
		this.#template = element.querySelector('template#assignment')
		this.#toggleAddButton = element.querySelector('button.toggle-add-assignments')
		this.#toggleRemoveButton = element.querySelector('button.toggle-remove-assignments')
		this.#form = element.querySelector('form.add-assignments')
		this.#textarea = this.#form.querySelector('textarea')
		this.#toastAdded = new Toast(this.#form.querySelector('.added'))
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
		if (!this.#label) return []

		const nicknames = this.#parseNicknames()

		if (!nicknames.length) return []

		const
			newAssignments = [],
			unknownNicknames = []

		for (const nickname of nicknames) {
			const user = await TwitchAPI.fetchUser(nickname)

			if (!user) {
				unknownNicknames.push(nickname)
				continue
			}

			if (
				this.#assignments.some(assignment => {
					return assignment.label.id == this.#label.id && assignment.userId == user.id
				})
			) {
				continue
			}

			newAssignments.push(
				new Assignment({
					userId: user.id,
					username: user.displayName,
					label: this.#label,
					assignedAt: new Date().toISOString()
				})
			)
		}

		this.#textarea.value = unknownNicknames.join('\n')

		if (unknownNicknames.length) {
			this.#toastError.show(`Unknown nicknames: ${unknownNicknames.join(', ')}`)
		}

		return newAssignments
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
			this.#toggleRemoveButton.hidden = true
			this.#removing = false
			return
		}

		const labelAssignments = this.#assignments.filter(
			assignment => assignment.label.id == this.#label.id
		)

		this.#toggleRemoveButton.hidden = !labelAssignments.length

		for (const assignment of labelAssignments) {
			const
				assignmentFragment = document.importNode(this.#template.content, true),
				assignmentElement = assignmentFragment.querySelector('li'),
				deleteButton = assignmentElement.querySelector('button.delete-assignment')

			assignmentElement.querySelector('.username').textContent = assignment.username
			assignmentElement.querySelector('.assigned-at').textContent = assignment.formattedAssignedAt

			deleteButton.addEventListener('click', event => {
				this.#delete(event.currentTarget, assignment)
			})

			this.#listElement.append(assignmentFragment)
		}

		this.#removing = !this.#toggleRemoveButton.hidden && this.#removing
	}

	async #delete(deleteButton, assignment) {
		if (!confirm(`Delete assignment "${assignment.username}" from "${assignment.label.name}"?`)) return

		deleteButton.disabled = true

		try {
			await this.#mainStorage.set(
				'assignments',
				this.#assignments.filter(existing => {
					return existing.userId != assignment.userId || existing.label.id != assignment.label.id
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

			if (!newAssignments.length) return

			this.#assignments = [...this.#assignments, ...newAssignments]
			await this.#mainStorage.set('assignments', this.#assignments)
			this.#toastAdded.show()
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
