import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globalSetup: ['test/global-setup.ts'], include: ['test/**/*.test.ts'], testTimeout: 60000, hookTimeout: 600000, fileParallelism: false },
});
