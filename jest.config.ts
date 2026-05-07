import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: './tsconfig.json',
    }],
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/app.ts',
    '!src/routes/**',
    '!src/controllers/**',
  ],
  coverageThreshold: {
    './src/services/signatureService.ts': {
      lines: 80,
    },
    './src/services/rateLimitService.ts': {
      lines: 80,
    },
  },
};

export default config;
