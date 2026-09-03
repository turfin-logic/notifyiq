import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  { files: ['src/**/*.js', 'test/**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node }, rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-constant-condition': ['error', { checkLoops: false }] } },
];
