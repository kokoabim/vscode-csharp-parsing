import * as vscode from "vscode";
import { VSCodeExtension } from "./VSCodeExtension";
import { VSCodeCommand } from "./VSCodeCommand";
import { CSharpFile } from "../CSharp/CSharpFile";

export class CSharpParsingVSCodeExtension extends VSCodeExtension {
    constructor(context: vscode.ExtensionContext) {
        super(context);

        this.addCommands(this.createCSharpFileSymbolsCommand());
    }

    static use(context: vscode.ExtensionContext): CSharpParsingVSCodeExtension {
        return new CSharpParsingVSCodeExtension(context);
    }

    private createCSharpFileSymbolsCommand(): VSCodeCommand {
        return new VSCodeCommand("swsj.csharp-parsing.csharp-file-symbols", async () => {
            const textDocument = await this.getTextDocument();
            if (!textDocument) { return; }

            const documentSymbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", textDocument.uri).then(symbols => symbols as vscode.DocumentSymbol[] || []);
            if (documentSymbols.length === 0) return;

            const csharpFile = new CSharpFile(textDocument, documentSymbols);
        });
    }
}