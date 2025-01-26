export class CSharpMatch {
    static accessorAccessModifier(text: string, accessor: string): string | undefined {
        const match = text.match(`[{};]\\s*((?<access>(public|internal|protected|private)\\s+)?${accessor}\\s*(;|{|(=>)))`);
        return match === null
            ? undefined // doesn't exist
            : match.groups?.access?.trim() ?? ""; // empty string == exists but no access modifier
    }

    static getValue(target: string, pattern: string): string | undefined {
        const match = target.match(pattern);
        return match?.groups?.value || undefined;
    }

    static isMatch(target: string, pattern: string): boolean {
        return target.match(pattern) !== null;
    }
}

export class CSharpMatchPatterns {
    static readonly symbolName = "[a-zA-Z][a-zA-Z0-9_]*";
    static readonly namespace = `(${CSharpMatchPatterns.symbolName}(\\.${CSharpMatchPatterns.symbolName})*)`;

    static readonly attributeRegExp = new RegExp("(?<value>\\[.+\\])", "gm");
    static readonly delegateKeyword = "\\bdelegate\\b";
    static readonly eventKeyword = "\\bevent\\b";
    static readonly keywordRegExp = new RegExp("(?<value>\\s*(abstract|async|extern|file|internal|new|override|partial|private|private\\s+protected|protected|protected\\s+internal|public|readonly|required|sealed|static|unsafe|virtual|volatile)\\s+)", "gm");
    static readonly keywords = "(?<value>(\\s*(abstract|async|extern|file|internal|new|override|partial|private|private\\s+protected|protected|protected\\s+internal|public|readonly|required|sealed|static|unsafe|virtual|volatile)\\s+)*)";
    static readonly multiLineCommentRegExp = new RegExp("(?<value>/\\*.*?\\*/)", "gs");
    static readonly operatorToEnd = "\\boperator\\s+(?<value>.+)$";
    static readonly singleLineCommentRegExp = new RegExp("^(?<value>[ \\t]*//.*)$", "gm");
    static readonly symbolNameAgainstParenthesis = `(?<value>${CSharpMatchPatterns.symbolName})\\s*\\(`;
    static readonly usingDirectiveRegExp = new RegExp(`^(?<directive>\\s*(?<global>global\\s+)?using\\s+(?<static>static\\s+)?((?<alias>${CSharpMatchPatterns.symbolName})\\s*=\\s*)?(?<namespace>${CSharpMatchPatterns.namespace})\\s*;\\s*)`, "gm");
}