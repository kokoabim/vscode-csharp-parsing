import * as vscode from "vscode";
import { VSCodeExtension } from "./VSCodeExtension";
import { VSCodeCommand } from "./VSCodeCommand";
import { CSharpFile } from "../CSharp/CSharpFile";
import { CSharpProjectFile } from "../CSharp/CSharpProjectFile";

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

            // eslint-disable-next-line no-unused-vars
            const csharpFile = new CSharpFile(textDocument, documentSymbols);

            if (!await this.isWorkspaceOpen(false)) return;

            const projectFiles = await CSharpProjectFile.findProjects(this.workspaceFolder!);
            const projectFile = CSharpProjectFile.projectOfTextDocument(projectFiles, textDocument);
            if (!projectFile) {
                console.log("Failed to find project file for current document");
                return;
            }

            console.log(`\n[project-file] Name: ${projectFile.name} • AssemblyName: ${projectFile.assemblyName} • TargetFramework: ${projectFile.targetFramework} • DefaultNamespace: ${projectFile.defaultNamespace}`);
            const csharpFileUris = await projectFile.getCSharpFileUris();
            console.log(`\n[csharp-files] Count: ${csharpFileUris.length}`);
            csharpFileUris.forEach(uri => console.log(uri.fsPath));
        });
    }
}