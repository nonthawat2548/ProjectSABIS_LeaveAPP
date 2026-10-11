export default {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/tests/ui/**/*.test.jsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/ui/setup.js'],
  extensionsToTreatAsEsm: ['.jsx'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-react', { runtime: 'automatic' }]],
      },
    ],
  },
  clearMocks: true,
  testTimeout: 15000,
};
