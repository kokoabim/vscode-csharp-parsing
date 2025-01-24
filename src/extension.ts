import { CSharpParsingVSCodeExtension } from "./VSCodeExtension/CSharpParsingVSCodeExtension";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating CSharpParsingVSCodeExtension');
    CSharpParsingVSCodeExtension.use(context);
}

export function deactivate() { }
