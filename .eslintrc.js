module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: ['eslint:recommended', 'plugin:jest/recommended', 'prettier'],
  plugins: ['jest'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  rules: {
    // Error prevention
    'no-console': 'off', // Allow console.log for game server logging
    'no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^(detectContentBounds|selectRandomMapForLevel)$',
      },
    ],
    'no-undef': 'error',
    'no-unreachable': 'error',

    // Code quality
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],

    // Socket.io and async patterns
    'no-async-promise-executor': 'error',
    'require-await': 'warn',

    // Game-specific rules
    'no-magic-numbers': [
      'warn',
      {
        ignore: [0, 1, 2, 3, 4, 5, 8, 10, 12, 30, 100, 1000, 3000, 5000, 30000, -1, -2], // Allow game constants
        ignoreArrayIndexes: true,
      },
    ],

    // Best practices for multiplayer game
    'no-global-assign': 'error',
    'no-implicit-globals': 'error',
    'no-eval': 'error',
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true,
      },
      rules: {
        'no-magic-numbers': 'off', // Allow magic numbers in tests
      },
    },
  ],
};
