import { User } from './user.js'

export class Assignment {
	constructor({ user, label, assignedAt, comment = '' }) {
		this.user = user
		this.label = label
		this.assignedAt = assignedAt
		this.comment = comment.replace(/\r\n|[\r\n]/g, ' ')
	}

	static fromJSON({ userId, username, login, assignedAt, comment }, label) {
		return new this({
			user: new User({ id: userId, username, login }),
			label,
			assignedAt,
			comment
		})
	}

	get formattedAssignedAt() {
		return new Intl.DateTimeFormat(navigator.language, {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(this.assignedAt))
	}

	toJSON() {
		return {
			userId: this.user.id,
			username: this.user.username,
			login: this.user.login,
			labelId: this.label.id,
			assignedAt: this.assignedAt,
			comment: this.comment
		}
	}
}
