import { OptionsStorage } from '../options/storage.js'
import { LabelsForm } from './labels-form.js'

document.addEventListener('DOMContentLoaded', async _event => {
	const options = await OptionsStorage.load()

	new LabelsForm(document.querySelector('form[name="labels"]'), options)
})
