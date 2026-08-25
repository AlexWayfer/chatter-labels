import { Assignment } from '../models/assignment.js'
import { TwitchAPI } from '../twitch/api.js'
import { Toast } from './toast.js'

export class AssignmentsList {
	#mainStorage
	#label
	#assignments
	#unsubscribe
	#listElement
	#template
	#showButton
	#form

	constructor(element, mainStorage, label, assignments) {
		this.#mainStorage = mainStorage
		this.#label = label
		this.#assignments = assignments

		this.#listElement = element.querySelector('ul')
		this.#template = element.querySelector('template#assignment')
		this.#showButton = element.querySelector('button.show-add-assignments')
		this.#form = element.querySelector('form.add-assignments')

		this.#showButton.addEventListener('click', _event => {
			this.#showButton.hidden = true
			this.#form.hidden = false
			this.#form.querySelector('textarea').focus()
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

		this.#render()
	}

	#render() {
		this.#listElement.replaceChildren()

		if (!this.#label) return

		for (const assignment of this.#assignments) {
			if (assignment.label.id != this.#label.id) continue

			const
				assignmentFragment = document.importNode(this.#template.content, true),
				assignmentElement = assignmentFragment.querySelector('li')

			assignmentElement.querySelector('.username').textContent = assignment.username
			assignmentElement.querySelector('.assigned-at').textContent = assignment.formattedAssignedAt

			assignmentElement.querySelector('button.delete-assignment').addEventListener('click', event => {
				this.#delete(event.currentTarget, assignment)
			})

			this.#listElement.append(assignmentFragment)
		}
	}

	async #delete(deleteButton, assignment) {
		if (!confirm(`Delete assignment "${assignment.username}" from "${assignment.label.name}"?`)) return

		deleteButton.disabled = true

		try {
			await this.#mainStorage.set(
				'assignments',
				this.#assignments.filter(existing =>
					existing.userId != assignment.userId || existing.label.id != assignment.label.id
				)
			)
		} catch (error) {
			deleteButton.disabled = false
			new Toast(this.#form.querySelector('.error')).show(error)
			throw error
		}
	}

	async #add() {
		const
			textarea = this.#form.querySelector('textarea'),
			addButton = this.#form.querySelector('button[type="submit"]'),
			toastAdded = new Toast(this.#form.querySelector('.added')),
			toastError = new Toast(this.#form.querySelector('.error')),
			nicknames = this.#parseNicknames(textarea.value)

		if (!nicknames.length) {
			this.#form.hidden = true
			this.#showButton.hidden = false
			return
		}

		if (!this.#label) {
			toastError.show('Save the label first')
			return
		}

		addButton.disabled = true

		try {
			const
				newAssignments = [],
				unknownNicknames = []

			for (const nickname of nicknames) {
				const user = await TwitchAPI.fetchUser(nickname)

				if (!user) {
					unknownNicknames.push(nickname)
					continue
				}

				if (this.#assignments.some(assignment =>
					assignment.label.id == this.#label.id && assignment.userId == user.id
				)) {
					continue
				}

				const assignment = new Assignment({
					userId: user.id,
					username: user.displayName,
					label: this.#label,
					assignedAt: new Date().toISOString()
				})

				this.#assignments.push(assignment)
				newAssignments.push(assignment)
			}

			if (newAssignments.length) {
				await this.#mainStorage.set('assignments', this.#assignments)
				toastAdded.show()
			}

			textarea.value = unknownNicknames.join('\n')

			if (unknownNicknames.length) {
				toastError.show(`Unknown nicknames: ${unknownNicknames.join(', ')}`)
			}
		} catch (error) {
			toastError.show(error)
			throw error
		} finally {
			addButton.disabled = false
		}
	}

	#parseNicknames(text) {
		const nicknames = []

		for (const line of text.split('\n')) {
			const nickname = line.trim().replace(/^@/, '')

			if (!nickname) continue
			if (nicknames.some(existing => existing.toLowerCase() == nickname.toLowerCase())) continue

			nicknames.push(nickname)
		}

		return nicknames
	}
}
