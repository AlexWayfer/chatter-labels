export class Label {
	constructor({ id, icon, name, enabled = true, script = '' }) {
		this.id = id
		this.icon = icon
		this.name = name
		this.enabled = enabled
		this.script = typeof script === 'string' ? script : ''
	}

	toJSON() {
		return {
			id: this.id,
			icon: this.icon,
			name: this.name,
			enabled: this.enabled,
			script: this.script
		}
	}
}
