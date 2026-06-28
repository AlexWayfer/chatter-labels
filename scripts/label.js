export class Label {
	constructor({ id, letter, name }) {
		this.id = id
		this.letter = letter
		this.name = name
	}

	toJSON() {
		return {
			id: this.id,
			letter: this.letter,
			name: this.name
		}
	}
}
