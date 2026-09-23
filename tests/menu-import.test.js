import test from "node:test";
import assert from "node:assert/strict";
import { parseMenuCsv } from "../src/lib/menuImport.js";

test("import menu legge CSV italiano con decimali e allergeni", () => {
  const parsed = parseMenuCsv([
    "nome;descrizione;prezzo;categoria;reparto;allergeni;iva;disponibile;costo",
    'Carbonara;"Guanciale, uova e pecorino";13,50;Primi;cucina;glutine|uova;10;si;4,20',
    "Spritz;Aperitivo;8,00;Cocktail;bar;solfiti;22;no;2,10",
  ].join("\n"));
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].price, 13.5);
  assert.deepEqual(parsed.items[0].allergens, ["glutine", "uova"]);
  assert.equal(parsed.items[1].preparationArea, "bar");
  assert.equal(parsed.items[1].isAvailable, false);
});

test("import menu segnala righe invalide senza perdere quelle valide", () => {
  const parsed = parseMenuCsv("nome,prezzo,categoria\nPizza,9.5,Pizze\nSenza prezzo,,Pizze");
  assert.equal(parsed.items.length, 1);
  assert.match(parsed.errors[0], /Riga 3/);
});
