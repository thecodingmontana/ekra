import { createHash, createHmac } from "node:crypto";

export type S3Config = {
	/** e.g. http://localhost:8334 (SeaweedFS) or https://s3.eu-central-1.amazonaws.com */
	endpoint: string;
	region: string;
	bucket: string;
	accessKey: string;
	secretKey: string;
};

/** Object keys are kept to safe characters, so they never need escaping (or let a request reach another key). */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,500}$/;

const sha256 = (data: string | Uint8Array) =>
	createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) =>
	createHmac("sha256", key).update(data).digest();

/**
 * A small S3 client: put, get and delete objects with AWS Signature V4 over fetch (path-style addresses, which
 * SeaweedFS, MinIO and AWS all accept). Only what Ekra uses; no SDK.
 */
export function createStorage(config: S3Config) {
	const base = config.endpoint.replace(/\/$/, "");

	async function send(
		method: "GET" | "PUT" | "DELETE" | "HEAD",
		key: string,
		body?: Uint8Array,
		headers: Record<string, string> = {},
	) {
		if (key && (!SAFE_KEY.test(key) || key.includes("..")))
			throw new Error(`Unsafe storage key: ${key}`);
		const url = new URL(`${base}/${config.bucket}${key ? `/${key}` : ""}`);
		const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
		const day = amzDate.slice(0, 8);
		const payload = sha256(body ?? "");
		const signed: Record<string, string> = {
			host: url.host,
			"x-amz-content-sha256": payload,
			"x-amz-date": amzDate,
			...Object.fromEntries(
				Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
			),
		};
		const names = Object.keys(signed).sort();
		const canonical = [
			method,
			url.pathname,
			"",
			...names.map((n) => `${n}:${signed[n]}`),
			"",
			names.join(";"),
			payload,
		].join("\n");
		const scope = `${day}/${config.region}/s3/aws4_request`;
		const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join(
			"\n",
		);
		const signingKey = hmac(
			hmac(hmac(hmac(`AWS4${config.secretKey}`, day), config.region), "s3"),
			"aws4_request",
		);
		const signature = createHmac("sha256", signingKey)
			.update(toSign)
			.digest("hex");
		const { host: _host, ...sent } = signed;
		return fetch(url, {
			method,
			headers: {
				...sent,
				authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
			},
			// a Buffer or Uint8Array is a valid body; the DOM typings only accept ArrayBuffer-backed views
			body: body as RequestInit["body"],
		});
	}

	const fail = async (what: string, res: Response): Promise<never> => {
		throw new Error(
			`Storage ${what} failed: ${res.status} ${(await res.text()).slice(0, 200)}`,
		);
	};

	return {
		/**
		 * Creates the bucket if it isn't there yet. Asks first: a key limited to one existing bucket (usual on managed
		 * S3) may not create buckets, and a refused question means the same (an upload then says what's wrong).
		 */
		async ensureBucket() {
			const head = await send("HEAD", "");
			if (head.status !== 404) return;
			const res = await send("PUT", "");
			// 409: someone else just made it
			if (!res.ok && res.status !== 409) await fail("bucket setup", res);
		},
		async put(key: string, body: Uint8Array, contentType: string) {
			const res = await send("PUT", key, body, { "content-type": contentType });
			if (!res.ok) await fail(`upload of ${key}`, res);
		},
		/** The object as a streaming response, or null when there's no such object. */
		async get(key: string) {
			const res = await send("GET", key);
			if (res.status === 404) return null;
			if (!res.ok) await fail(`download of ${key}`, res);
			return res;
		},
		async delete(key: string) {
			const res = await send("DELETE", key);
			if (!res.ok && res.status !== 404) await fail(`delete of ${key}`, res);
		},
	};
}

export type Storage = ReturnType<typeof createStorage>;
