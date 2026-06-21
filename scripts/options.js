import { load as optionsLoad } from './options/load.js'
import { LabelsForm } from './options/labels-form.js'

document.addEventListener('DOMContentLoaded', async _event => {
	const options = await optionsLoad()

	const labelsForm = new LabelsForm(document.querySelector('form[name="labels"]'), options)
})
