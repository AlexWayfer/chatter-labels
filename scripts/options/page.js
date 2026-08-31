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

GitHubGistForm.create(document.querySelector('form[name="github-gist"]'), optionsStorage)

LabelsForm.create(document.querySelector('.labels'), mainStorage)
