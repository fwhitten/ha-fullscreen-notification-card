import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'node:fs';

const dev = process.env.ROLLUP_WATCH === 'true';
const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

/** Stamp the package version into the console banner. */
const stampVersion = () => ({
  name: 'stamp-version',
  renderChunk(code) {
    return code.replace('__VERSION__', version);
  },
});

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/fullscreen-notification-card.js',
    format: 'es',
    sourcemap: dev,
    inlineDynamicImports: true,
  },
  plugins: [
    stampVersion(),
    resolve(),
    typescript({ tsconfig: './tsconfig.json' }),
    !dev &&
      terser({
        format: { comments: false },
        compress: { passes: 2 },
      }),
  ].filter(Boolean),
};
