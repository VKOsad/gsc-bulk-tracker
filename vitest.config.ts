// Unit tests run in a Node environment (server-side libs: crypto, Topvisor client,
// domain/keyword utils). No real network or paid Topvisor calls are ever made.
//
// Plain config object (no `vitest/config` import) so it loads even before deps are
// installed; `css.postcss` is stubbed so Vite does not try to load the app's Tailwind
// PostCSS config for these pure-logic tests.
export default {
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
};
