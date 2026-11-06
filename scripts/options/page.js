import { logger } from '../logger.js'
import { MainStorage } from '../storage/main.js'
import { OptionsStorage } from '../storage/options.js'
import { GitHubGistForm } from './github-gist-form.js'
import { LabelsForm } from './labels-form.js'
import { ThemeControl } from './theme-control.js'

logger.debug('options/page.js')
logger.debug('document.readyState = ', document.readyState)

const optionsStorage = await OptionsStorage.create()

await ThemeControl.create(document.querySelector('.theme-control'), optionsStorage)

await GitHubGistForm.create(document.querySelector('form[name="github-gist"]'), optionsStorage)

const mainStorage = await MainStorage.create(optionsStorage)

// logger.debug('optionsStorage = ', optionsStorage)

new LabelsForm(document.querySelector('.labels'), mainStorage, optionsStorage)
