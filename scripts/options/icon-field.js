export class IconField {
	#fileInput
	#valueInput
	#previewElement

	constructor(fieldsetElement) {
		this.#fileInput = fieldsetElement.querySelector('input.icon')
		this.#valueInput = fieldsetElement.querySelector('input[name="icon"]')
		this.#previewElement = fieldsetElement.querySelector('img.icon-preview')

		this.#updatePreview()

		this.#fileInput.addEventListener('change', () => this.#onFileChange())
	}

	async #onFileChange() {
		const file = this.#fileInput.files[0]

		if (!file) return

		this.#fileInput.setCustomValidity('')

		if (file.size > 256 * 1024) {
			this.#fileInput.setCustomValidity('Image must be smaller than 256 KB')
			this.#fileInput.reportValidity()
			this.#fileInput.value = ''
			return
		}

		try {
			this.#valueInput.value = await this.#dataUrl(file)
			this.#updatePreview()
		} catch {
			this.#fileInput.setCustomValidity('Could not read image')
			this.#fileInput.reportValidity()
			this.#fileInput.value = ''
		}
	}

	#updatePreview() {
		if (!this.#valueInput.value) {
			this.#previewElement.removeAttribute('src')
		} else {
			this.#previewElement.src = this.#valueInput.value
		}

		this.#fileInput.required = !this.#valueInput.value
	}

	async #dataUrl(file) {
		if (file.type == 'image/svg+xml') {
			return `data:image/svg+xml,${encodeURIComponent(await file.text())}`
		}

		const
			bitmap = await createImageBitmap(file),
			// Resize icon to 36 px
			scale = Math.min(1, 36 / bitmap.height),
			canvas = document.createElement('canvas')

		canvas.width = Math.max(1, Math.round(bitmap.width * scale))
		canvas.height = Math.max(1, Math.round(bitmap.height * scale))
		canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
		bitmap.close()

		return canvas.toDataURL('image/png')
	}
}
