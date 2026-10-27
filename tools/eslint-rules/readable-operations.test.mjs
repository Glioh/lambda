import { RuleTester } from "eslint";
import rule from "./readable-operations.mjs";

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
	},
});

ruleTester.run("readable-operations", rule, {
	valid: [
		{
			code: `
function projectService() {
	return {
		async rename() {
			return 1;
		},

		async delete() {
			return 2;
		},
	};
}
`,
		},
		{
			code: `
function configure() {
	return {
		onSuccess: () => true,
	};
}

const result = source.map(message => ({
	role: message.role,
	content: message.content,
}));
const kept = items.filter(value => value.active);
app.get("/projects", async request => service.list(request));
`,
		},
		{
			code: `
function projectService() {
	return {
		list: async () => [],
		...extensions,
	};
}
`,
		},
		{
			code: `
function projectService() {
	return {
		async list() {},
		// Keep this comment with the next operation.
		async get() {},
	};
}
`,
		},
		{
			code: `
const where = { id, userId };
`,
		},
		{
			code: `
function projectService() {
	return {
		list() {
			const values = [];
			if (!values.length) return [];
			return values;
		},
	};
}
`,
		},
	],
	invalid: [
		{
			code: `
function projectService() {
	return {
		rename: async (args) => args,
		remove: (id) => id,
	};
}
`,
			errors: [
				{ messageId: "method", type: "Property" },
				{ messageId: "method", type: "Property" },
				{ messageId: "blank", type: "Property" },
			],
			output: `
function projectService() {
	return {
		async rename(args) { return args; },

		remove(id) { return id; },
	};
}
`,
		},
		{
			code: `
function projectService() {
	return {
		async rename() {},
		async remove() {},
	};
}
`,
			errors: [{ messageId: "blank", type: "Property" }],
			output: `
function projectService() {
	return {
		async rename() {},

		async remove() {},
	};
}
`,
		},
		{
			code: `
function projectService() {
	return {
		get: () => this.value,
	};
}
`,
			errors: [{ messageId: "method", type: "Property" }],
		},
		{
			code: `
function projectService() {
	return {
		get: () => {
			return 1;
		},
	};
}
`,
			errors: [{ messageId: "method", type: "Property" }],
		},
		{
			code: `
function projectService() {
	return {
		get: ({ id }) => id,
	};
}
`,
			errors: [{ messageId: "method", type: "Property" }],
		},
		{
			code: `
function projectService() {
	return {
		list: function () {
			return [];
		},
	};
}
`,
			errors: [{ messageId: "method", type: "Property" }],
		},
		{
			code: `
function projectService() {
	return {
		list: async function () {
			return [];
		},
	};
}
`,
			errors: [{ messageId: "method", type: "Property" }],
		},
		{
			code: `
function projectService() {
	return {
		list() {
			const values = [];
			return values;
		},
	};
}
`,
			errors: [{ messageId: "blankReturn", type: "ReturnStatement" }],
		},
	],
});
