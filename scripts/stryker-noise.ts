import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

/** The bits of Babel's NodePath this ignorer reads. */
interface Path {
  node: {
    type: string;
    name?: unknown;
    value?: unknown;
    callee?: Node;
    arguments?: unknown[];
  };
  parentPath: Path | null;
}
interface Node {
  type: string;
  name?: string;
  object?: Node;
  property?: Node;
}

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

const isCall = (p: Path) =>
  p.node.type === "CallExpression" || p.node.type === "NewExpression";
const calleeName = (p: Path) => {
  const c = p.node.callee;
  return c?.type === "MemberExpression" ? c.object?.name : c?.name;
};

/** PLAN §10 noise: class names, logging, error-message strings, "/" route paths. */
function reason(path: Path) {
  // Hono treats "" like "/" for a route's own path.
  const parent = path.parentPath?.node;
  if (
    path.node.type === "StringLiteral" &&
    path.node.value === "/" &&
    parent?.type === "CallExpression" &&
    parent.arguments?.[0] === path.node &&
    parent.callee?.type === "MemberExpression" &&
    ROUTE_METHODS.has(parent.callee.property?.name ?? "")
  )
    return "route path";
  for (
    let p: Path | null = path, child = path;
    p;
    child = p, p = p.parentPath
  ) {
    const { node } = p;
    if (
      node.type === "JSXAttribute" &&
      (node.name as { name?: string } | undefined)?.name === "className"
    )
      return "class names";
    if (!isCall(p)) continue;
    const callee = calleeName(p);
    if (callee === "cn") return "class names";
    if (callee === "console") return "logging";
    const arg = p.node.arguments?.indexOf(child.node);
    if (callee === "apiError" && arg === 3) return "error message";
    // Internal invariants only; `ApiError` carries status and code too.
    if (p.node.type === "NewExpression" && callee === "Error")
      return "error message";
  }
  return undefined;
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, "noise", {
    shouldIgnore: (path) => reason(path as Path),
  }),
];
