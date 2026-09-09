export class User {
	constructor({ id, username, login }) {
		this.id = id
		this.username = username
		this.login = login
	}

	static fromTwitch({ id, displayName, login }) {
		return new this({ id, username: displayName, login })
	}

	get formattedUsername() {
		if (!this.login) return this.username
		if (this.login.toLowerCase() == this.username.toLowerCase()) return this.username

		return `${this.username} (${this.login})`
	}

	equals(other) {
		return this.id == other.id &&
			this.username == other.username &&
			this.login == other.login
	}

	toJSON() {
		return {
			id: this.id,
			username: this.username,
			login: this.login
		}
	}
}
