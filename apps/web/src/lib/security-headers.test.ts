import assert from "node:assert/strict";
import { test } from "node:test";
import { securityHeaders } from "./security-headers.ts";

test("pages always refuse framing and sniffing; the CSP and HSTS only in production", () => {
	const dev = securityHeaders(false);
	assert.equal(dev["X-Frame-Options"], "DENY");
	assert.equal(dev["X-Content-Type-Options"], "nosniff");
	assert.equal(dev["Content-Security-Policy"], undefined);
	assert.equal(dev["Strict-Transport-Security"], undefined);
	const csp = securityHeaders(true)["Content-Security-Policy"] ?? "";
	assert.match(csp, /frame-ancestors 'none'/);
	assert.match(csp, /object-src 'none'/);
	assert.match(csp, /frame-src https:\/\/www\.youtube\.com/);
});
