import globals from 'globals'
import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'

export default [
	js.configs.recommended,
	stylistic.configs.all,
	{
		// files: ['**/*.js'],
		plugins: {
			'@stylistic': stylistic
		},
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.webextensions
			}
		},
		rules: {
			'no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_'
				}
			],
			'@stylistic/indent': ['error', 'tab', { SwitchCase: 1 }],
			'@stylistic/semi': ['error', 'never'],
			'@stylistic/quotes': ['warn', 'single', { avoidEscape: true }],
			'@stylistic/object-curly-spacing': ['warn', 'always'],
			'@stylistic/arrow-parens': ['warn', 'as-needed'],
			'@stylistic/padded-blocks': ['warn', 'never'],
			'@stylistic/function-call-argument-newline': ['warn', 'consistent'],
			'@stylistic/quote-props': ['warn', 'as-needed'],
			'@stylistic/dot-location': ['warn', 'property'],
			'@stylistic/spaced-comment': ['warn', 'always', { markers: ['//'] }],
			'@stylistic/object-property-newline': ['warn', { allowAllPropertiesOnSameLine: true }],
			'@stylistic/multiline-comment-style': ['warn', 'separate-lines'],
			'@stylistic/multiline-ternary': ['warn', 'never'],
			'@stylistic/function-paren-newline': ['warn', 'multiline-arguments'],
			'@stylistic/array-element-newline': ['warn', 'consistent'],
			'@stylistic/space-before-function-paren': [
				'error',
				{ anonymous: 'always', named: 'never', asyncArrow: 'always' }
			]
		}
	},
	{
		files: ['exe/*.js'],
		languageOptions: {
			globals: {
				...globals.node
			}
		}
	},
	{
		ignores: ['scripts/compiled/']
	}
]
