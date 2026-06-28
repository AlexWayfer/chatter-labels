export class Assignment {
	constructor({ userId, label, assignedAt }) {
		this.userId = userId
		this.label = label
		this.assignedAt = assignedAt
	}

	toJSON() {
		return {
			userId: this.userId,
			labelId: this.label.id,
			assignedAt: this.assignedAt
		}
	}
}
