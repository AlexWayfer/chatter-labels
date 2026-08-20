export class Label {
	constructor({ id, icon, name }) {
		this.id = id
		this.icon = icon
		this.name = name
	}

	toJSON() {
		return {
			id: this.id,
			icon: this.icon,
			name: this.name
		}
	}
}
