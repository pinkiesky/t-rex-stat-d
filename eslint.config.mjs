import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const functionVariable = {
  selector:
    'VariableDeclaration:has(VariableDeclarator[init.type=/^(ArrowFunctionExpression|FunctionExpression)$/])'
};

export default [
  { ignores: ['node_modules/**', 'dist/**', 'build/**', '.agents/**', '.aws/**', '.codex/**'] },
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,cjs,mjs}'],
    plugins: { '@stylistic': stylistic },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: 'function', next: '*' },
        { blankLine: 'always', prev: ['const', 'let'], next: '*' },
        { blankLine: 'never', prev: ['const', 'let'], next: ['const', 'let'] },
        { blankLine: 'always', prev: '*', next: functionVariable },
        { blankLine: 'always', prev: functionVariable, next: '*' }
      ],
      'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['app.js', 'watchface/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.es2020,
        console: 'readonly',
        App: 'readonly',
        WatchFace: 'readonly',
        hmUI: 'readonly',
        hmSensor: 'readonly',
        hmSetting: 'readonly',
        timer: 'readonly'
      }
    }
  },
  {
    files: ['**/*.{cjs,mjs}'],
    languageOptions: { globals: globals.node }
  }
];
