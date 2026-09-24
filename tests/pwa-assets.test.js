import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest PWA apre l'accesso staff e dichiara le icone", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/app.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.start_url, "/staff");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
});

test("service worker mantiene una pagina offline aggiornata", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /ordynora-shell-v6/);
  assert.match(source, /\/offline\.html/);
  assert.match(source, /navigationPreload/);
});

test("pagina offline rientra automaticamente quando torna la rete", async () => {
  const source = await readFile(new URL("../public/offline.html", import.meta.url), "utf8");
  assert.match(source, /sessione e il ristorante collegato restano salvati/i);
  assert.match(source, /addEventListener\("online"/);
  assert.match(source, /window\.location\.reload/);
});
