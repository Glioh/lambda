const FACTORY_NAME = /(?:repository|service|transaction)$/iu;

function isFunctionNode(node) {
	return node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";
}

function isOperationProperty(property) {
	return property.type === "Property" && (property.method || isFunctionNode(property.value));
}

function getOperationFunction(property) {
	return property.method || isFunctionNode(property.value) ? property.value : null;
}

function getEnclosingFunction(node) {
	let current = node.parent;

	while (current) {
		if (
			current.type === "ArrowFunctionExpression" ||
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression"
		) {
			return current;
		}
		current = current.parent;
	}

	return null;
}

function getFunctionName(node) {
	if (node.id?.type === "Identifier") return node.id.name;

	if (node.parent?.type === "VariableDeclarator" && node.parent.id.type === "Identifier") {
		return node.parent.id.name;
	}

	return null;
}

function hasCommentInRange(sourceCode, start, end) {
	return sourceCode.getAllComments().some(comment => {
		return comment.range[0] >= start && comment.range[1] <= end;
	});
}

function hasSensitiveArrowReference(node) {
	let found = false;

	function visit(value) {
		if (found || !value || typeof value !== "object") return;

		if (
			value.type === "ThisExpression" ||
			value.type === "Super" ||
			(value.type === "Identifier" && value.name === "arguments") ||
			(value.type === "MetaProperty" &&
				value.meta?.name === "new" &&
				value.property?.name === "target")
		) {
			found = true;
			return;
		}

		for (const [key, child] of Object.entries(value)) {
			if (key === "parent" || key === "loc" || key === "range" || key === "tokens") continue;

			if (Array.isArray(child)) {
				for (const item of child) visit(item);
			} else {
				visit(child);
			}
		}
	}

	visit(node);
	return found;
}

function canFixArrowProperty(property, sourceCode) {
	const arrow = property.value;

	if (
		arrow.type !== "ArrowFunctionExpression" ||
		arrow.body.type === "BlockStatement" ||
		arrow.params.some(parameter => parameter.type !== "Identifier") ||
		arrow.typeParameters ||
		arrow.returnType ||
		hasCommentInRange(sourceCode, property.range[0], property.range[1]) ||
		hasSensitiveArrowReference(arrow)
	) {
		return false;
	}

	return true;
}

function getMethodText(property, sourceCode) {
	const arrow = property.value;
	const key = property.computed
		? `[${sourceCode.getText(property.key)}]`
		: sourceCode.getText(property.key);
	const asyncPrefix = arrow.async ? "async " : "";
	const parameters = arrow.params.map(parameter => sourceCode.getText(parameter)).join(", ");
	const body = sourceCode.getText(arrow.body);

	return `${asyncPrefix}${key}(${parameters}) { return ${body}; }`;
}

function getLineIndent(sourceCode, index) {
	const lineStart = sourceCode.text.lastIndexOf("\n", index - 1) + 1;
	return sourceCode.text.slice(lineStart, index).match(/^[\t ]*/u)?.[0] ?? "";
}

function needsBlankLine(sourceCode, previous, property) {
	const comma = sourceCode.getTokenAfter(previous);
	if (!comma || comma.value !== ",") return false;

	const commentsBetween = sourceCode.getAllComments().some(comment => {
		return comment.range[0] > comma.range[1] && comment.range[1] < property.range[0];
	});
	if (commentsBetween) return false;

	const previousLine = sourceCode.getLocFromIndex(previous.range[1]).line;
	const propertyLine = sourceCode.getLocFromIndex(property.range[0]).line;
	return propertyLine - previousLine - 1 !== 1;
}

function needsBlankLineBeforeReturn(sourceCode, previous, returnStatement) {
	if (
		sourceCode.getAllComments().some(comment => {
			return comment.range[0] > previous.range[1] && comment.range[1] < returnStatement.range[0];
		})
	) {
		return false;
	}

	const previousLine = sourceCode.getLocFromIndex(previous.range[1]).line;
	const returnLine = sourceCode.getLocFromIndex(returnStatement.range[0]).line;
	return returnLine - previousLine - 1 !== 1;
}

const rule = {
	meta: {
		type: "layout",
		docs: {
			description: "Enforce readable method-shaped operations in Lambda factories.",
		},
		fixable: "code",
		schema: [],
		messages: {
			method: "Use method syntax for repository/service operations.",
			blank: "Separate adjacent repository/service operations with one blank line.",
			blankReturn: "Separate derived values from return statements with one blank line.",
		},
	},

	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode();

		return {
			ReturnStatement(returnStatement) {
				const object = returnStatement.argument;
				if (!object || object.type !== "ObjectExpression") return;

				const factory = getEnclosingFunction(returnStatement);
				const factoryName = factory && getFunctionName(factory);
				if (!factoryName || !FACTORY_NAME.test(factoryName)) return;

				if (object.properties.some(property => property.type === "SpreadElement")) return;

				const properties = object.properties;
				if (!properties.length || properties.some(property => !isOperationProperty(property)))
					return;

				for (let index = 0; index < properties.length; index += 1) {
					const property = properties[index];
					if (!property.method && isFunctionNode(property.value)) {
						const previous = properties[index - 1];
						const comma = previous && sourceCode.getTokenAfter(previous);
						const addLeadingBlank =
							previous && comma?.value === "," && needsBlankLine(sourceCode, previous, property);
						const isArrow = property.value.type === "ArrowFunctionExpression";

						context.report({
							node: property,
							messageId: "method",
							fix:
								isArrow && canFixArrowProperty(property, sourceCode)
									? fixer =>
											addLeadingBlank
												? fixer.replaceTextRange(
														[comma.range[1], property.range[1]],
														`\n\n${getLineIndent(sourceCode, property.range[0])}${getMethodText(property, sourceCode)}`,
													)
												: fixer.replaceText(property, getMethodText(property, sourceCode))
									: undefined,
						});
					}
				}

				for (let index = 1; index < properties.length; index += 1) {
					const previous = properties[index - 1];
					const property = properties[index];
					const comma = sourceCode.getTokenAfter(previous);
					if (!comma || comma.value !== ",") continue;

					if (!needsBlankLine(sourceCode, previous, property)) continue;
					const adjacentArrow = property.value.type === "ArrowFunctionExpression";

					context.report({
						node: property,
						messageId: "blank",
						fix: adjacentArrow
							? undefined
							: fixer =>
									fixer.replaceTextRange(
										[comma.range[1], property.range[0]],
										`\n\n${getLineIndent(sourceCode, property.range[0])}`,
									),
					});
				}

				if (!/service$/iu.test(factoryName)) return;

				for (const property of properties) {
					const operation = getOperationFunction(property);
					if (!operation?.body || operation.body.type !== "BlockStatement") continue;

					for (let index = 1; index < operation.body.body.length; index += 1) {
						const previous = operation.body.body[index - 1];
						const statement = operation.body.body[index];
						if (
							previous.type !== "VariableDeclaration" ||
							statement.type !== "ReturnStatement" ||
							!needsBlankLineBeforeReturn(sourceCode, previous, statement)
						) {
							continue;
						}

						context.report({ node: statement, messageId: "blankReturn" });
					}
				}
			},
		};
	},
};

export default rule;
