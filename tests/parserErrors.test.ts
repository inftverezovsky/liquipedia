import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyParserError,
  emptyValidIfNoItems,
  normalizeParserErrorClass,
  shouldCooldownProxyForError,
} from "../src/lib/parserErrors";

test("classifyParserError maps proxy tunnel failures", () => {
  assert.equal(classifyParserError({ message: "net::ERR_TUNNEL_CONNECTION_FAILED" }), "proxy_tunnel");
  assert.equal(normalizeParserErrorClass("tunnel"), "proxy_tunnel");
});

test("classifyParserError maps Cloudflare and source statuses", () => {
  assert.equal(classifyParserError({ message: "Cloudflare challenge cf-ray abc" }), "cloudflare_block");
  assert.equal(classifyParserError({ statusCode: 403 }), "cloudflare_block");
  assert.equal(classifyParserError({ statusCode: 429 }), "rate_limited");
  assert.equal(classifyParserError({ statusCode: 503 }), "source_5xx");
  assert.equal(classifyParserError({ statusCode: 404 }), "source_4xx");
});

test("classifyParserError maps parser and selector failures", () => {
  assert.equal(classifyParserError({ message: "Timeout waiting for search elements" }), "selector_changed");
  assert.equal(classifyParserError({ message: "request timed out" }), "timeout");
  assert.equal(classifyParserError({ message: "selector .match-wrapper not found" }), "selector_changed");
  assert.equal(classifyParserError({ message: "Liquipedia API returned invalid JSON" }), "parse_failed");
});

test("empty_valid is explicit and does not cool down proxies", () => {
  assert.equal(emptyValidIfNoItems([0]), "empty_valid");
  assert.equal(emptyValidIfNoItems([1]), null);
  assert.equal(shouldCooldownProxyForError("empty_valid"), false);
  assert.equal(shouldCooldownProxyForError("proxy_tunnel"), true);
});
