import * as vscode from 'vscode';
import { CSharpMatchPatterns } from './CSharpMatchPatterns';
import { CSharpSymbol } from './CSharpSymbol';

export class CSharpFile {
    members: CSharpSymbol[] = [];
    usings: CSharpUsing[] = [];

    constructor(textDocument: vscode.TextDocument, documentSymbols: vscode.DocumentSymbol[]) {
        if (documentSymbols.length > 0) {
            documentSymbols = CSharpSymbol.orderByRange(documentSymbols);
            documentSymbols = CSharpFile.moveMethodsUnderParents(documentSymbols);

            this.usings = CSharpFile.parseUsings(textDocument, documentSymbols[0].range.start);
            this.members = CSharpSymbol.parseSiblings(textDocument, documentSymbols, undefined, 0);
        }
    }

    static async getDocumentSymbols(textDocument: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        if (textDocument.languageId !== "csharp") return [];
        return await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", textDocument.uri).then(symbols => symbols as vscode.DocumentSymbol[] || []);
    }

    static moveMethodsUnderParents(documentSymbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        // NOTE: this is needed for delegate methods to be correctly placed under their parent

        const methodSymbols = documentSymbols.filter(symbol => symbol.kind === vscode.SymbolKind.Method);
        if (methodSymbols.length === 0) return documentSymbols;

        const parentSymbols = documentSymbols.filter(symbol => symbol.kind !== vscode.SymbolKind.Method);
        if (parentSymbols.length === 0) return documentSymbols;

        for (const methodSymbol of methodSymbols) {
            const parentSymbol = parentSymbols.find(symbol => symbol.range.contains(methodSymbol.range));

            if (parentSymbol !== undefined) {
                parentSymbol.children.push(methodSymbol);
            }
            else {
                parentSymbols.push(methodSymbol);
            }
        }

        return parentSymbols;
    }

    static async parse(textDocument: vscode.TextDocument): Promise<CSharpFile> {
        const documentSymbols = await CSharpFile.getDocumentSymbols(textDocument);
        return new CSharpFile(textDocument, documentSymbols);
    }

    static parseUsings(textDocument: vscode.TextDocument, endPosition: vscode.Position): CSharpUsing[] {
        const usings: CSharpUsing[] = [];

        const text = textDocument.getText(new vscode.Range(new vscode.Position(0, 0), endPosition)).trim();
        if (text.length === 0) return usings;

        let m;

        while ((m = CSharpMatchPatterns.usingDirectiveRegExp.exec(text)) !== null) {
            if (!m.groups?.directive) continue;

            const using = new CSharpUsing();
            using.directive = m.groups.directive.trim();
            using.namespace = m.groups.namespace;
            using.alias = m.groups.alias;
            using.isGlobal = m.groups.global !== undefined;
            using.isStatic = m.groups.static !== undefined;

            usings.push(using);
        }

        CSharpMatchPatterns.usingDirectiveRegExp.lastIndex = 0;

        return usings;
    }
}

export class CSharpUsing {
    alias: string | undefined;
    directive!: string;
    isGlobal: boolean = false;
    isStatic: boolean = false;
    namespace!: string;
}
