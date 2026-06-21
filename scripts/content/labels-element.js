export class LabelsElement {
	#element
	#formElement

	constructor(chatterCard, options) {
		this.#createElement()

		options.labels.forEach(label => this.#createLabelElement(label))

		chatterCard.querySelector('.viewer-card-header__background').after(this.#element)
	}

	#createElement() {
		this.#element = document.createElement('div')

		this.#element.classList.add('chatter-labels')

		const header = document.createElement('h5')
		header.textContent = 'Labels'
		this.#element.append(header)

		this.#formElement = document.createElement('form')
		this.#element.append(this.#formElement)
	}

	#createLabelElement(label) {
		const
			fieldsetElement = document.createElement('fieldset'),
			labelElement = document.createElement('label'),
			checkboxElement = document.createElement('input'),
			labelTextElement = document.createElement('span')

		checkboxElement.type = 'checkbox'
		// checkboxElement.name = name

		labelTextElement.textContent = label.name

		labelElement.append(checkboxElement, labelTextElement)
		fieldsetElement.append(labelElement)
		this.#formElement.append(fieldsetElement)
	}
}
