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
			'@stylistic/quote-props': ['warn', 'consistent-as-needed'],
			'@stylistic/dot-location': ['warn', 'property'],
			'@stylistic/spaced-comment': ['warn', 'always', { markers: ['//'] }],
			'@stylistic/object-property-newline': ['warn', { allowAllPropertiesOnSameLine: true }],
			'@stylistic/multiline-comment-style': ['warn', 'separate-lines'],
			'@stylistic/multiline-ternary': ['warn', 'always-multiline'],
			'@stylistic/function-paren-newline': ['warn', 'multiline-arguments'],
			'@stylistic/array-element-newline': ['warn', 'consistent'],
			'@stylistic/indent-binary-ops': ['error', 'tab'],
			'@stylistic/space-before-function-paren': [
				'error',
				{ anonymous: 'always', named: 'never', asyncArrow: 'always' }
			],
			'@stylistic/array-bracket-newline': ['warn', 'consistent'],
			'@stylistic/lines-between-class-members': [
				'warn',
				{
					enforce: [
						{ blankLine: 'always', prev: 'method', next: 'method' }
					]
				}
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
