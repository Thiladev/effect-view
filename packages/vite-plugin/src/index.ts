import path from "node:path"
import ts from "typescript"
import type { Plugin } from "vite"


export interface EffectViewRefreshOptions {
    /**
     * Include filter for source files.
     *
     * @default /\.[cm]?[jt]sx?$/
     */
    readonly include?: RegExp

    /**
     * Exclude filter for source files.
     *
     * @default /\/node_modules\//
     */
    readonly exclude?: RegExp
}

interface Edit {
    readonly start: number
    readonly end: number
    readonly content: string
}

interface ComponentImports {
    readonly componentNamespaces: Set<string>
    readonly packageNamespaces: Set<string>
    readonly directFactories: Set<string>
}

interface Definition {
    readonly expression: ts.Expression
    readonly wrapTarget: ts.Expression
    readonly body: ts.FunctionLikeDeclaration | undefined
    readonly id: string
    readonly site: EntrypointSite.Pipe | undefined
}

const defaultInclude = /\.[cm]?[jt]sx?$/
const defaultExclude = /\/node_modules\//
const runtimeImport = "@effect-view/vite-plugin/runtime"
const refreshIdentifier = "__effectViewRefresh"
const acceptIdentifier = "__effectViewAccept"

const isSupportedPackage = (source: string): boolean =>
    source === "effect-view"
    || source === "effect-view/Component"

const collectImports = (
    sourceFile: ts.SourceFile,
): ComponentImports => {
    const componentNamespaces = new Set<string>()
    const packageNamespaces = new Set<string>()
    const directFactories = new Set<string>()

    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)
            || !ts.isStringLiteral(statement.moduleSpecifier)
            || !isSupportedPackage(statement.moduleSpecifier.text))
            continue

        const source = statement.moduleSpecifier.text
        const clause = statement.importClause
        if (!clause)
            continue

        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
            if (source.endsWith("/Component"))
                componentNamespaces.add(clause.namedBindings.name.text)
            else
                packageNamespaces.add(clause.namedBindings.name.text)
            continue
        }

        if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings))
            continue

        for (const element of clause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text
            if (source.endsWith("/Component") && (importedName === "make" || importedName === "makeUntraced"))
                directFactories.add(element.name.text)
            else if (!source.endsWith("/Component") && importedName === "Component")
                componentNamespaces.add(element.name.text)
        }
    }

    return {
        componentNamespaces,
        packageNamespaces,
        directFactories,
    }
}

const isFactoryCallee = (
    expression: ts.Expression,
    imports: ComponentImports,
): boolean => {
    if (ts.isIdentifier(expression))
        return imports.directFactories.has(expression.text)

    if (!ts.isPropertyAccessExpression(expression))
        return false

    if (expression.name.text !== "make" && expression.name.text !== "makeUntraced")
        return false

    if (ts.isIdentifier(expression.expression))
        return imports.componentNamespaces.has(expression.expression.text)

    return ts.isPropertyAccessExpression(expression.expression)
        && expression.expression.name.text === "Component"
        && ts.isIdentifier(expression.expression.expression)
        && imports.packageNamespaces.has(expression.expression.expression.text)
}

const functionArgument = (
    call: ts.CallExpression,
): ts.FunctionLikeDeclaration | undefined => call.arguments.find(argument =>
    ts.isArrowFunction(argument)
    || ts.isFunctionExpression(argument)
) as ts.FunctionLikeDeclaration | undefined

const findFactoryCall = (
    root: ts.Node,
    imports: ComponentImports,
): {
    readonly factoryCall: ts.CallExpression
    readonly body: ts.FunctionLikeDeclaration | undefined
} | undefined => {
    let result: {
        readonly factoryCall: ts.CallExpression
        readonly body: ts.FunctionLikeDeclaration | undefined
    } | undefined

    const visit = (node: ts.Node): void => {
        if (result)
            return

        // Never look inside a nested function body: a factory call there
        // belongs to a different, unrelated component (e.g. one composed
        // dynamically inside this component's own render), not to the
        // composition shape of the definition being analyzed.
        if (node !== root && ts.isFunctionLike(node))
            return

        if (ts.isCallExpression(node)) {
            if (isFactoryCallee(node.expression, imports)) {
                result = {
                    factoryCall: node,
                    body: functionArgument(node),
                }
                return
            }

            if (ts.isCallExpression(node.expression) && isFactoryCallee(node.expression.expression, imports)) {
                result = {
                    factoryCall: node,
                    body: functionArgument(node),
                }
                return
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(root)
    return result
}

const isPipeline = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "pipe"

const entrypointName = (callee: ts.Expression): boolean =>
    ts.isPropertyAccessExpression(callee)
    && (callee.name.text === "withRuntime" || callee.name.text === "withContext")

/**
 * A curried entrypoint call (`withContext(context)`) used as one step of a
 * `.pipe(...)` chain: the descriptor produced by the preceding steps must be
 * registered *before* this step runs, since it is what converts the
 * descriptor into a plain React function component.
 */
const isEntrypoint = (expression: ts.Expression): boolean =>
    ts.isCallExpression(expression) && entrypointName(expression.expression)

/**
 * The data-first form of an entrypoint call (`withContext(descriptor,
 * context)`), which can appear anywhere - not only inside a `.pipe(...)`
 * chain - and always takes the descriptor to convert as its first argument.
 */
const isEntrypointDataFirst = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node)
    && entrypointName(node.expression)
    && node.arguments.length >= 2

declare namespace EntrypointSite {
    export interface Pipe {
        readonly kind: "pipe"
        readonly pipeCall: ts.CallExpression
        readonly argIndex: number
    }

    export interface DataFirst {
        readonly kind: "dataFirst"
        readonly call: ts.CallExpression
    }
}

type EntrypointSite = EntrypointSite.Pipe | EntrypointSite.DataFirst

/**
 * Finds where, anywhere within a definition's composition expression, a
 * descriptor is converted into a plain React function component - whether
 * through a `.pipe(..., withContext(context))` chain or a direct
 * `withContext(descriptor, context)` call. Does not look inside nested
 * function bodies, for the same reason as `findFactoryCall`.
 */
const findEntrypointSite = (root: ts.Node): EntrypointSite | undefined => {
    let result: EntrypointSite | undefined

    const visit = (node: ts.Node): void => {
        if (result)
            return

        if (node !== root && ts.isFunctionLike(node))
            return

        if (isPipeline(node)) {
            const argIndex = node.arguments.findIndex(isEntrypoint)
            if (argIndex >= 0) {
                result = { kind: "pipe", pipeCall: node, argIndex }
                return
            }
        }
        else if (isEntrypointDataFirst(node)) {
            result = { kind: "dataFirst", call: node }
            return
        }

        ts.forEachChild(node, visit)
    }

    visit(root)
    return result
}

const makeDefinition = (
    expression: ts.Expression,
    id: string,
    imports: ComponentImports,
): Definition | undefined => {
    const factory = findFactoryCall(expression, imports)
    const site = findEntrypointSite(expression)

    // A `.pipe(..., withContext(context))` chain always needs the splice
    // treatment, whether or not a factory call could be found in this same
    // statement (its base may be a component defined elsewhere).
    if (site?.kind === "pipe")
        return { expression, wrapTarget: expression, body: factory?.body, id, site }

    // `withContext(descriptor, context)` always needs its descriptor
    // argument wrapped directly, since by the time the call returns the
    // result is a plain function component, not a Component descriptor.
    if (site?.kind === "dataFirst") {
        const target = site.call.arguments[0]
        if (!target)
            return undefined
        return { expression, wrapTarget: target, body: factory?.body, id, site: undefined }
    }

    // No entrypoint conversion happens within this statement: the
    // descriptor remains a Component.Any throughout, however it got here
    // (a bare factory call, a `.pipe()` of traits with no withContext, or a
    // user-defined composition helper wrapping either) - safe to register
    // the whole expression.
    if (!factory)
        return undefined

    return { expression, wrapTarget: expression, body: factory.body, id, site: undefined }
}

const collectDefinitions = (
    sourceFile: ts.SourceFile,
    imports: ComponentImports,
    moduleId: string,
): readonly Definition[] => {
    const definitions: Definition[] = []

    for (const statement of sourceFile.statements) {
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (!declaration.initializer || !ts.isIdentifier(declaration.name))
                    continue
                const definition = makeDefinition(
                    declaration.initializer,
                    `${moduleId}:${declaration.name.text}`,
                    imports,
                )
                if (definition)
                    definitions.push(definition)
            }
            continue
        }

        if (ts.isClassDeclaration(statement) && statement.name) {
            const heritage = statement.heritageClauses
                ?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
                ?.types[0]
                ?.expression
            if (!heritage)
                continue
            const definition = makeDefinition(
                heritage,
                `${moduleId}:${statement.name.text}`,
                imports,
            )
            if (definition)
                definitions.push(definition)
            continue
        }

        if (ts.isExportAssignment(statement)) {
            const definition = makeDefinition(
                statement.expression,
                `${moduleId}:default`,
                imports,
            )
            if (definition)
                definitions.push(definition)
        }
    }

    return definitions
}

/**
 * Computes a signature for the *shape* of a component's hook calls: the
 * ordered sequence of hook names it calls at its top level, ignoring
 * everything else (argument contents, dependency array entries, unrelated
 * logic). Two bodies calling the same hooks in the same order hash to the
 * same signature even if most of their code differs, so edits that don't
 * touch which hooks run - the overwhelming majority of edits - refresh in
 * place instead of forcing a remount. This mirrors how React's own Fast
 * Refresh only forces a remount when the hook call sequence itself changes,
 * not when a hook's arguments or the surrounding logic change.
 */
const hookSignature = (
    body: ts.FunctionLikeDeclaration | undefined,
): string => {
    if (!body?.body)
        return "unknown"

    const hooks: string[] = []
    const root = body.body

    const visit = (node: ts.Node): void => {
        if (node !== root && ts.isFunctionLike(node))
            return

        if (ts.isCallExpression(node)) {
            const callee = node.expression
            const localName = ts.isIdentifier(callee)
                ? callee.text
                : ts.isPropertyAccessExpression(callee)
                    ? callee.name.text
                    : undefined

            if (localName && /^use[A-Z0-9]/.test(localName)) {
                const qualifier = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
                    ? `${callee.expression.text}.`
                    : ""
                hooks.push(`${qualifier}${localName}`)
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(root)
    return hash(hooks.join("\n"))
}

const hash = (value: string): string => {
    let result = 0x811c9dc5
    for (let index = 0; index < value.length; index++) {
        result ^= value.charCodeAt(index)
        result = Math.imul(result, 0x01000193)
    }
    return (result >>> 0).toString(36)
}

const quote = (value: string): string => JSON.stringify(value)

const registration = (
    expression: string,
    definition: Definition,
    signature: string,
    forceReset: boolean,
): string => `${refreshIdentifier}(${expression}, import.meta.hot, ${quote(definition.id)}, ${quote(signature)}, ${forceReset})`

const applyEdits = (code: string, edits: readonly Edit[]): string => {
    let output = code
    for (const edit of [...edits].sort((self, that) => that.start - self.start))
        output = output.slice(0, edit.start) + edit.content + output.slice(edit.end)
    return output
}

const importPosition = (sourceFile: ts.SourceFile): number => {
    let position = 0
    for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement))
            position = statement.end
        else if (position > 0)
            break
    }
    return position
}

const scriptKind = (id: string): ts.ScriptKind => id.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : id.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : id.endsWith(".js") || id.endsWith(".mjs") || id.endsWith(".cjs")
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS

/**
 * Adds Fast Refresh support for Effect View components.
 *
 * Place this plugin before `@vitejs/plugin-react`.
 */
export function effectView(
    options: EffectViewRefreshOptions = {},
): Plugin {
    const include = options.include ?? defaultInclude
    const exclude = options.exclude ?? defaultExclude
    const instrumentedModules = new Set<string>()

    return {
        name: "effect-view:refresh",
        enforce: "pre",
        apply: "serve",
        transform(code, rawId) {
            const [id] = rawId.split("?", 1)
            if (!id)
                return null
            if (!include.test(id) || exclude.test(id))
                return null

            const sourceFile = ts.createSourceFile(
                id,
                code,
                ts.ScriptTarget.Latest,
                true,
                scriptKind(id),
            )
            const imports = collectImports(sourceFile)
            if (imports.componentNamespaces.size === 0
                && imports.packageNamespaces.size === 0
                && imports.directFactories.size === 0
                && !instrumentedModules.has(id))
                return null

            const moduleId = path.relative(process.cwd(), id).split(path.sep).join("/")
            const definitions = collectDefinitions(sourceFile, imports, moduleId)
            if (definitions.length === 0 && !instrumentedModules.has(id))
                return null
            instrumentedModules.add(id)

            const forceReset = /@refresh\s+reset\b/.test(code)
            const edits: Edit[] = []

            for (const definition of definitions) {
                const signature = hookSignature(definition.body)

                if (definition.site?.kind === "pipe") {
                    const entrypoint = definition.site.pipeCall.arguments[definition.site.argIndex]
                    if (!entrypoint)
                        continue
                    edits.push({
                        start: entrypoint.getStart(sourceFile),
                        end: entrypoint.getStart(sourceFile),
                        content: `(${refreshIdentifier}View) => ${registration(
                            `${refreshIdentifier}View`,
                            definition,
                            signature,
                            forceReset,
                        )}, `,
                    })
                    continue
                }

                const start = definition.wrapTarget.getStart(sourceFile)
                const end = definition.wrapTarget.end
                edits.push({
                    start,
                    end,
                    content: registration(
                        code.slice(start, end),
                        definition,
                        signature,
                        forceReset,
                    ),
                })
            }

            const position = importPosition(sourceFile)
            edits.push({
                start: position,
                end: position,
                content: `${position === 0 ? "" : "\n"}import { accept as ${acceptIdentifier}, register as ${refreshIdentifier} } from ${quote(runtimeImport)};\n`,
            })

            const transformed = applyEdits(code, edits)
            const definitionIds = definitions.map(definition => quote(definition.id)).join(", ")
            return {
                code: `${transformed}\n${acceptIdentifier}(import.meta.hot, [${definitionIds}])\n`,
                map: null,
            }
        },
    }
}
