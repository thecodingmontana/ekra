import assert from "node:assert/strict";
import { test } from "node:test";
import { createSchema, createYoga } from "graphql-yoga";
import { noIntrospection } from "./yoga.ts";

const ask = async (query: string) => {
	// the production setup: introspection refused, GraphiQL off
	const yoga = createYoga({
		schema: createSchema({
			typeDefs: "type Query { health: String! }",
			resolvers: { Query: { health: () => "ok" } },
		}),
		plugins: [noIntrospection],
		graphiql: false,
	});
	const res = await yoga.fetch("http://test/graphql", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query }),
	});
	return (await res.json()) as { data?: unknown; errors?: unknown[] };
};

test("production refuses introspection but answers ordinary queries", async () => {
	assert.ok((await ask("{ __schema { types { name } } }")).errors?.length);
	assert.ok((await ask('{ __type(name: "Query") { name } }')).errors?.length);
	assert.deepEqual((await ask("{ health __typename }")).data, {
		health: "ok",
		__typename: "Query",
	});
});
