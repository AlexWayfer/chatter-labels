export class Label {
	constructor({ letter, name }) {
		this.letter = letter
		this.name = name
	}

	toJSON() {
		return {
			letter: this.letter,
			name: this.name
		}
	}
}
