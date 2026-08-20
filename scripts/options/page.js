import { logger } from '../logger.js'
import { MainStorage } from '../storage/main.js'
import { OptionsStorage } from '../storage/options.js'
import { GitHubGistForm } from './github-gist-form.js'
import { LabelsForm } from './labels-form.js'

logger.debug('options/page.js')
logger.debug('document.readyState = ', document.readyState)

const
	optionsStorage = await OptionsStorage.create(),
	mainStorage = await MainStorage.create(optionsStorage)

// logger.debug('optionsStorage = ', optionsStorage)

window.addEventListener('pageshow', event => {
	if (event.persisted) {
		optionsStorage.reconnect()
		mainStorage.reconnect()
	}
})

GitHubGistForm.create(document.querySelector('form[name="github-gist"]'), optionsStorage)

LabelsForm.create(document.querySelector('form[name="labels"]'), mainStorage)
