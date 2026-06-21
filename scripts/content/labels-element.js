export class LabelsElement {
	#containerElement
	#formElement

	constructor(chatterCard, options) {
		this.#createContainerElement()

		options.labels.forEach(label => this.#createLabelElement(label))

		chatterCard.querySelector('.viewer-card-header__background').after(this.#containerElement)
	}

	#createContainerElement() {
		this.#containerElement = document.createElement('div')

		this.#containerElement.classList.add('chatter-labels')

		const header = document.createElement('h5')
		header.textContent = 'Labels'
		this.#containerElement.append(header)

		this.#formElement = document.createElement('form')
		this.#containerElement.append(this.#formElement)
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
