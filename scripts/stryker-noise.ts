import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

/** The bits of Babel's NodePath this ignorer reads. */
interface Path {
  node: {
    type: string;
    name?: unknown;
    value?: unknown;
    callee?: Node;
    arguments?: unknown[];
    properties?: { shorthand?: boolean; key?: Node }[];
    key?: Node;
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

/** PLAN §10 noise: class names, logging, error-message strings, route paths and params. */
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
  // routeTree.gen sets a file route's path at runtime.
  if (
    path.node.type === "StringLiteral" &&
    parent?.type === "CallExpression" &&
    parent.arguments?.[0] === path.node &&
    parent.callee?.type === "Identifier" &&
    parent.callee.name === "createFileRoute"
  )
    return "route path";
  // TanStack Router keeps the current params: `params: { gid }` within /g/$gid.
  const props = path.node.properties;
  if (
    path.node.type === "ObjectExpression" &&
    props?.length === 1 &&
    props[0]?.shorthand === true &&
    props[0].key?.name === "gid"
  ) {
    const holder =
      parent?.type === "JSXExpressionContainer"
        ? path.parentPath?.parentPath?.node
        : parent;
    const key =
      holder?.type === "JSXAttribute"
        ? (holder.name as Node | undefined)?.name
        : holder?.key?.name;
    if (key === "params") return "current route params";
  }
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
    if (node.type === "ObjectProperty" && node.key?.name === "className")
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
