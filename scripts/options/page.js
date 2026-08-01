import { logger } from '../logger.js'
import { MainStorage } from '../storage/main.js'
import { OptionsStorage } from '../storage/options.js'
import { GitHubGistForm } from './github-gist-form.js'
import { LabelsForm } from './labels-form.js'

logger.debug('options/page.js')
logger.debug('document.readyState = ', document.readyState)

const
	mainStorage = new MainStorage(),
	optionsStorage = new OptionsStorage()

GitHubGistForm.create(document.querySelector('form[name="github-gist"]'), optionsStorage)

LabelsForm.create(document.querySelector('form[name="labels"]'), mainStorage)

optionsStorage.listen()
mainStorage.listen()
