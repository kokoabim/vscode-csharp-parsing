import * as vscode from 'vscode';
import { CSharpSymbol } from './CSharpSymbol';

export enum CSharpSymbolType {
    none,
    file,
    nonCodeblock,

    using,
    namespace,

    interface,
    class,
    struct,
    recordClass,
    recordStruct,

    delegate,
    enum,

    event,
    constant,
    property,
    field,

    primaryConstructor,
    constructor,
    staticConstructor,
    indexer,
    finalizer,
    method,
    operator,
}

export namespace CSharpSymbolType {
    export function byDocumentSymbol(textDocument: vscode.TextDocument, documentSymbol: vscode.DocumentSymbol, parentSymbol: CSharpSymbol | undefined): CSharpSymbolType {
        switch (documentSymbol.kind) {
            case vscode.SymbolKind.Class: return CSharpSymbolType.class;
            case vscode.SymbolKind.Constant: return CSharpSymbolType.constant;
            case vscode.SymbolKind.Constructor: return CSharpSymbolType.constructor;
            case vscode.SymbolKind.Enum: return CSharpSymbolType.enum;
            case vscode.SymbolKind.Event: return CSharpSymbolType.event;
            case vscode.SymbolKind.Field: return CSharpSymbolType.field;
            case vscode.SymbolKind.File: return CSharpSymbolType.file;
            case vscode.SymbolKind.Interface: return CSharpSymbolType.interface;
            case vscode.SymbolKind.Namespace: return CSharpSymbolType.namespace;
            case vscode.SymbolKind.Operator: return CSharpSymbolType.operator;
            case vscode.SymbolKind.Struct: return CSharpSymbolType.struct;

            case vscode.SymbolKind.Property:
                if (documentSymbol.name.endsWith("this[]")) return CSharpSymbolType.indexer;
                else return CSharpSymbolType.property;

            case vscode.SymbolKind.Method:
                if (documentSymbol.name === ".ctor") {
                    if (parentSymbol && CSharpSymbol.isPrimaryConstructor(documentSymbol, parentSymbol.documentSymbol)) { return CSharpSymbolType.primaryConstructor; }
                    else { return CSharpSymbolType.constructor; }
                }
                else if (documentSymbol.name === "Finalize" && documentSymbol.detail.startsWith("~")) { return CSharpSymbolType.finalizer; }
                else if (documentSymbol.name === ".cctor") { return CSharpSymbolType.staticConstructor; }
                else if (CSharpSymbol.isDelegate(textDocument, documentSymbol)) { return CSharpSymbolType.delegate; }
                else if (CSharpSymbol.isEventMethod(documentSymbol)) { return CSharpSymbolType.none; }
                else { return CSharpSymbolType.method; }

            default: throw new Error(`Unsupported symbol kind: ${vscode.SymbolKind[documentSymbol.kind]} (${documentSymbol.kind})`);
        }
    }

    export function toString(symbolType: CSharpSymbolType): string {
        switch (symbolType) {
            case CSharpSymbolType.class: return "class";
            case CSharpSymbolType.constant: return "constant";
            case CSharpSymbolType.constructor: return "constructor";
            case CSharpSymbolType.delegate: return "delegate";
            case CSharpSymbolType.enum: return "enum";
            case CSharpSymbolType.event: return "event";
            case CSharpSymbolType.field: return "field";
            case CSharpSymbolType.file: return "file";
            case CSharpSymbolType.finalizer: return "finalizer";
            case CSharpSymbolType.indexer: return "indexer";
            case CSharpSymbolType.interface: return "interface";
            case CSharpSymbolType.method: return "method";
            case CSharpSymbolType.namespace: return "namespace";
            case CSharpSymbolType.nonCodeblock: return "non-codeblock";
            case CSharpSymbolType.none: return "none";
            case CSharpSymbolType.operator: return "operator";
            case CSharpSymbolType.property: return "property";
            case CSharpSymbolType.recordClass: return "record";
            case CSharpSymbolType.recordStruct: return "record struct";
            case CSharpSymbolType.staticConstructor: return "static constructor";
            case CSharpSymbolType.struct: return "struct";
            case CSharpSymbolType.using: return "using";

            default: throw new Error(`Unsupported symbol type: ${CSharpSymbolType[symbolType]} (${symbolType})`);
        }
    }
}