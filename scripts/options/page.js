import { loadOptions } from '../load-options.js'
import { LabelsForm } from './labels-form.js'

document.addEventListener('DOMContentLoaded', async _event => {
	const options loadOptions()

	const labelsForm = new LabelsForm(document.querySelector('form[name="labels"]'), options)
})
