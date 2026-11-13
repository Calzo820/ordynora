import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la landing mobile usa navigazione compatta e non mostra il banner PWA sopra la CTA", async () => {
  const [landing, prompt, styles, main] = await Promise.all([
    readFile(new URL("../src/pages/Landing.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AppInstallPrompt.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/landing-mobile-v11.css", import.meta.url), "utf8"),
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(landing, /landing-menu-toggle/);
  assert.match(landing, /aria-expanded=\{mobileMenuOpen\}/);
  assert.doesNotMatch(prompt, /location\.pathname === "\/"/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /landing-nav-actions\.is-open/);
  assert.match(main, /landing-mobile-v11\.css/);
});
