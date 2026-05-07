import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    '!src/services/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    'src/services/signatureService.ts': {
      lines: 80,
    },
    'src/services/rateLimitService.ts': {
      lines: 80,
    },
  },
};

export default config;
