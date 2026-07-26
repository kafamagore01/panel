import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGithubVersion,
  lastPageFromLinkHeader,
} from "./version";

test("GitHub commit sayısını package sürüm serisine uygular", () => {
  assert.equal(buildGithubVersion("1.0.0", 14), "1.0.14");
  assert.equal(buildGithubVersion("v2.3.7-beta.1", 42), "2.3.42");
});

test("her 100 committe minor sürümünü artırıp patch sayacını sıfırlar", () => {
  assert.equal(buildGithubVersion("1.0.0", 99), "1.0.99");
  assert.equal(buildGithubVersion("1.0.0", 100), "1.1.0");
  assert.equal(buildGithubVersion("1.0.0", 101), "1.1.1");
  assert.equal(buildGithubVersion("1.0.0", 200), "1.2.0");
});

test("geçersiz taban veya commit sayısı için güvenli değer kullanır", () => {
  assert.equal(buildGithubVersion("geçersiz", -1), "1.0.0");
});

test("GitHub Link başlığından son sayfayı okur", () => {
  const link = [
    '<https://api.github.com/repositories/1/commits?per_page=1&page=2>; rel="next"',
    '<https://api.github.com/repositories/1/commits?per_page=1&page=14>; rel="last"',
  ].join(", ");

  assert.equal(lastPageFromLinkHeader(link), 14);
  assert.equal(lastPageFromLinkHeader(null), null);
});
