export class Assignment {
	constructor({ userId, username, label, assignedAt }) {
		this.userId = userId
		this.username = username
		this.label = label
		this.assignedAt = assignedAt
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
			userId: this.userId,
			username: this.username,
			labelId: this.label.id,
			assignedAt: this.assignedAt
		}
	}
}
