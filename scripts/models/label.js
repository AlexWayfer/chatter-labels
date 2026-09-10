export class Label {
	constructor({ id, icon, name, enabled = true }) {
		this.id = id
		this.icon = icon
		this.name = name
		this.enabled = enabled
	}

	toJSON() {
		return {
			id: this.id,
			icon: this.icon,
			name: this.name,
			enabled: this.enabled
		}
	}
}
