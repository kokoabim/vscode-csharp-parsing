import * as vscode from 'vscode';
import { CSharpMatch, CSharpMatchPatterns } from './CSharpMatchPatterns';
import { CSharpSymbolType } from './CSharpSymbolType';

export class CSharpSymbol {
    attributes: string[] = [];
    documentSymbol!: vscode.DocumentSymbol;
    footer: string | undefined;
    footerRange: vscode.Range | undefined;
    header: string | undefined;
    headerRange!: vscode.Range;
    keywords: string[] = [];
    name!: string;
    namespace: string | undefined;
    parent: CSharpSymbol | undefined;
    returnType: string | undefined;
    text!: string;
    textRange!: vscode.Range;
    typeName!: string;
    symbolType!: CSharpSymbolType;

    private depth = 0;
    private eol = "\n";
    private openOfBodyPosition: vscode.Position | undefined;
    private textSymbolNameIndex!: number;

    private get endPosition() { return this.footerRange?.end || this.textRange?.end; }

    get isPublicMember() { return this.keywords.includes("public") || false; }

    get isStaticMember() { return this.keywords.includes("static") || false; }

    static fixEventSymbolHeaderAndText(textDocument: vscode.TextDocument, symbol: CSharpSymbol): void {
        if (symbol.symbolType !== CSharpSymbolType.event) return;

        if (!symbol.text.endsWith("}") && !symbol.text.endsWith(";")) {
            symbol.text += ";";
            symbol.textRange = new vscode.Range(symbol.textRange.start, CSharpSymbol.movePosition(textDocument, symbol.textRange.end, 1));
            symbol.textSymbolNameIndex = 0;
        }

        if (!symbol.header) return;

        const eventMatch = symbol.header.match(CSharpMatchPatterns.eventKeyword);
        if (!eventMatch) return;

        const origHeaderLength = symbol.header.length;
        const origTextLength = symbol.text.length;

        const eventText = symbol.header.substring(eventMatch.index!);
        symbol.text = eventText + symbol.text;
        symbol.header = symbol.header.substring(0, eventMatch.index!);
        symbol.textSymbolNameIndex += eventText.length;

        const keywordsMatch = symbol.header.match(CSharpMatchPatterns.keywords);
        if (!keywordsMatch?.groups?.value) return;

        const keywordsHeaderIndex = symbol.header.indexOf(keywordsMatch.groups.value);
        if (keywordsHeaderIndex + keywordsMatch.groups.value.length === symbol.header.length) {
            symbol.text = keywordsMatch.groups.value + symbol.text;
            symbol.header = symbol.header.substring(0, keywordsHeaderIndex);
            symbol.textSymbolNameIndex += keywordsMatch.groups.value.length;

            const leadingWhitespaceMatch = symbol.text.match(/^\s+/);
            if (leadingWhitespaceMatch?.length) {
                symbol.header = symbol.header + symbol.text.substring(0, leadingWhitespaceMatch[0].length);
                symbol.text = symbol.text.substring(leadingWhitespaceMatch[0].length);
                symbol.textSymbolNameIndex -= leadingWhitespaceMatch[0].length;
            }
        }

        const newHeaderLength = symbol.header.length;
        const newTextLength = symbol.text.length;
        const headerLengthDiff = origHeaderLength - newHeaderLength;
        const textLengthDiff = newTextLength - origTextLength;

        symbol.headerRange = new vscode.Range(symbol.headerRange.start, CSharpSymbol.movePosition(textDocument, symbol.headerRange.end, headerLengthDiff * -1));
        symbol.textRange = new vscode.Range(CSharpSymbol.movePosition(textDocument, symbol.textRange.start, textLengthDiff * -1), symbol.textRange.end);
    }

    static getCharacterPosition(textDocument: vscode.TextDocument, start: vscode.Position, values: string[], end: vscode.Position | undefined = undefined, canBeAtEndOfDepth: boolean = false): [vscode.Position | undefined, string | undefined] {
        let depth = 0;
        let inQuote = false;
        let inMultiLineComment = false;
        let currentPosition = start;
        let nextPosition = CSharpSymbol.movePosition(textDocument, currentPosition, 1);
        let matchedValue: string | undefined;

        const firstCharOfValues = values.map(v => v[0]);

        while (textDocument.validatePosition(nextPosition)) {
            const currentChar = textDocument.getText(new vscode.Range(currentPosition, nextPosition));
            let moveToNextLine = false;
            let checkCharacter = false;

            if (currentChar === "\"" && !inMultiLineComment) {
                const previousChar = textDocument.getText(new vscode.Range(CSharpSymbol.movePosition(textDocument, currentPosition, -1), currentPosition));
                if (previousChar !== "\\") {
                    inQuote = !inQuote;
                }
            }
            else if (!inQuote) {
                if (!inMultiLineComment) {
                    if (depth === 0 && firstCharOfValues.includes(currentChar)) {
                        checkCharacter = true;
                    }
                    else if (currentChar === "<" || currentChar === "[" || currentChar === "(") {
                        depth++;
                    }
                    else if (currentChar === ">" || currentChar === "]" || currentChar === ")") {
                        depth--;
                    }
                    else if (currentChar === "/") {
                        const nextChar = textDocument.getText(new vscode.Range(nextPosition, CSharpSymbol.movePosition(textDocument, nextPosition, 1)));
                        if (nextChar === "/") {
                            moveToNextLine = true;
                        }
                        else if (nextChar === "*") {
                            inMultiLineComment = true;
                        }
                    }
                }
                else if (inMultiLineComment && currentChar === "*") {
                    const nextChar = textDocument.getText(new vscode.Range(nextPosition, CSharpSymbol.movePosition(textDocument, nextPosition, 1)));
                    if (nextChar === "/") {
                        inMultiLineComment = false;
                    }
                }
            }

            if ((checkCharacter || (canBeAtEndOfDepth && !inQuote && !inMultiLineComment)) && depth === 0 && firstCharOfValues.includes(currentChar)) {
                const index = values.findIndex(v => v.startsWith(currentChar));
                matchedValue = values[index];

                if (matchedValue.length === 1) break;

                const currentPositionCharacters = textDocument.getText(new vscode.Range(currentPosition, CSharpSymbol.movePosition(textDocument, currentPosition, matchedValue.length)));
                if (currentPositionCharacters === matchedValue) break;
                else matchedValue = undefined;
            }

            if (currentChar === "" || moveToNextLine) {
                // EOL
                currentPosition = new vscode.Position(currentPosition.line + 1, 0);
                nextPosition = new vscode.Position(currentPosition.line, 1);
            }
            else {
                currentPosition = nextPosition;
                nextPosition = CSharpSymbol.movePosition(textDocument, nextPosition, 1);
            }

            if (end && currentPosition.isAfterOrEqual(end)) {
                return [undefined, undefined];
            }
        }

        return [currentPosition, matchedValue];
    }

    static getOpenOfBody(textDocument: vscode.TextDocument, documentSymbol: vscode.DocumentSymbol): vscode.Position | undefined {
        // eslint-disable-next-line no-unused-vars
        const [openOfBody, char] = CSharpSymbol.getCharacterPosition(textDocument, documentSymbol.selectionRange.end, ["{"]);
        return openOfBody ? CSharpSymbol.movePosition(textDocument, openOfBody, 1) : undefined;
    }

    static isDelegate(textDocument: vscode.TextDocument, documentSymbol: vscode.DocumentSymbol): boolean {
        return documentSymbol.kind === vscode.SymbolKind.Method
            && CSharpMatch.isMatch(textDocument.getText(new vscode.Range(documentSymbol.range.start, documentSymbol.selectionRange.start)), CSharpMatchPatterns.delegateKeyword);
    }

    static isEventMethod(documentSymbol: vscode.DocumentSymbol): boolean {
        return documentSymbol.kind === vscode.SymbolKind.Method
            && ((documentSymbol.name.startsWith("add_") && documentSymbol.detail.endsWith(".add"))
                || (documentSymbol.name.startsWith("remove_") && documentSymbol.detail.endsWith(".remove")));
    }

    static isPrimaryConstructor(documentSymbol: vscode.DocumentSymbol, parentSymbol: vscode.DocumentSymbol): boolean {
        return documentSymbol.kind === vscode.SymbolKind.Method && documentSymbol.name === ".ctor" && parentSymbol.selectionRange.start.isEqual(documentSymbol.selectionRange.start);
    }

    static movePosition(textDocument: vscode.TextDocument, position: vscode.Position, offset: number): vscode.Position {
        if (offset === 0) return position;

        const forward = offset > 0;
        if (!forward) offset *= -1;

        for (let i = 0; i < offset; i++) {
            if (forward) {
                const nextChar = position.translate(0, 1);

                if (textDocument.lineAt(position.line).range.contains(nextChar)) {
                    position = nextChar;
                }
                else {
                    position = new vscode.Position(position.line + 1, 0);
                }
            }
            else {
                if (position.character > 0) {
                    position = position.translate(0, -1);
                }
                else {
                    const prevLine = position.line - 1;
                    position = new vscode.Position(prevLine, textDocument.lineAt(prevLine).range.end.character);
                }
            }
        }

        return position;
    }

    static orderByRange(documentSymbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        return documentSymbols.sort((a, b) => a.range.start.isBefore(b.range.start) ? -1 : 1);
    }

    static parse(textDocument: vscode.TextDocument, documentSymbol: vscode.DocumentSymbol, parentSymbol: CSharpSymbol | undefined, depth: number, startOffset: vscode.Position | undefined, isLastSymbol: boolean): CSharpSymbol | undefined {
        const padding = depth > 0 ? "  ".repeat(depth) : "";

        console.log(`\n${padding}> [parse-symbol] ${vscode.SymbolKind[documentSymbol.kind]}: ${documentSymbol.name}`);

        let symbol: CSharpSymbol;

        const type = CSharpSymbolType.byDocumentSymbol(textDocument, documentSymbol, parentSymbol);
        if (type === CSharpSymbolType.none) return undefined;

        switch (type) {
            case CSharpSymbolType.class:
                symbol = new CSharpClass();
                break;

            case CSharpSymbolType.constant:
                symbol = new CSharpConstant();
                break;

            case CSharpSymbolType.constructor:
            case CSharpSymbolType.primaryConstructor:
            case CSharpSymbolType.staticConstructor:
                symbol = new CSharpConstructor();
                (<CSharpConstructor>symbol).isPrimary = type === CSharpSymbolType.primaryConstructor;
                (<CSharpConstructor>symbol).isStatic = type === CSharpSymbolType.staticConstructor;
                break;

            case CSharpSymbolType.delegate:
                symbol = new CSharpDelegate();
                break;

            case CSharpSymbolType.enum:
                symbol = new CSharpEnum();
                break;

            case CSharpSymbolType.event:
                symbol = new CSharpEvent();
                break;

            case CSharpSymbolType.field:
                symbol = new CSharpField();
                break;

            case CSharpSymbolType.indexer:
                symbol = new CSharpIndexer();
                break;

            case CSharpSymbolType.interface:
                symbol = new CSharpInterface();
                break;

            case CSharpSymbolType.method:
                symbol = new CSharpMethod();
                break;

            case CSharpSymbolType.operator:
                symbol = new CSharpOperator();
                break;

            case CSharpSymbolType.property:
                symbol = new CSharpProperty();
                break;

            case CSharpSymbolType.recordClass:
            case CSharpSymbolType.recordStruct:
                symbol = new CSharpRecord();
                (<CSharpRecord>symbol).isClass = type === CSharpSymbolType.recordClass;
                (<CSharpRecord>symbol).isStruct = type === CSharpSymbolType.recordStruct;
                break;

            case CSharpSymbolType.struct:
                symbol = new CSharpStruct();
                break;

            case CSharpSymbolType.finalizer:
                symbol = new CSharpFinalizer();
                break;

            default: throw new Error(`Unsupported symbol kind or type: ${vscode.SymbolKind[documentSymbol.kind]} (${documentSymbol.kind}), ${CSharpSymbolType[type]} (${type})`);
        }

        symbol.eol = textDocument.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
        symbol.documentSymbol = documentSymbol;
        symbol.depth = depth;
        symbol.symbolType = type;
        symbol.parent = parentSymbol;

        symbol.name = CSharpSymbol.parseName(documentSymbol, type);
        symbol.typeName = CSharpSymbol.parseTypeName(documentSymbol, symbol);
        symbol.namespace = CSharpSymbol.parseNamespace(documentSymbol, symbol);

        symbol.text = CSharpSymbol.parseText(textDocument, documentSymbol, symbol);
        symbol.header = startOffset ? CSharpSymbol.parseHeader(textDocument, symbol, startOffset, documentSymbol.range.start) : undefined;
        CSharpSymbol.fixEventSymbolHeaderAndText(textDocument, symbol);
        CSharpSymbol.processSymbolHeaderAndText(symbol);
        symbol.footer = CSharpSymbol.parseFooter(textDocument, symbol, isLastSymbol);

        if (symbol instanceof CSharpObject) {
            const [implementations, constraints] = CSharpSymbol.parseImplementationsAndOrConstraints(textDocument, documentSymbol, symbol);
            symbol.implements = implementations;
            symbol.constraints = constraints ? constraints.split("where").map(c => c.trim()) : [];

            symbol.members = CSharpSymbol.parseSiblings(textDocument, documentSymbol.children, documentSymbol, symbol, ++depth);
        }

        if (symbol instanceof CSharpEnum) {
            // eslint-disable-next-line no-unused-vars
            const [implementations, constraints] = CSharpSymbol.parseImplementationsAndOrConstraints(textDocument, documentSymbol, symbol);
            symbol.implements = implementations;
        }

        if (symbol instanceof CSharpParamSymbol) {
            symbol.parameters = CSharpSymbol.parseParameters(textDocument, documentSymbol);
        }

        if (symbol instanceof CSharpMethod) {
            // eslint-disable-next-line no-unused-vars
            const [implementations, constraints] = CSharpSymbol.parseImplementationsAndOrConstraints(textDocument, documentSymbol, symbol);
            symbol.constraints = constraints ? constraints.split("where").map(c => c.trim()) : [];
        }

        console.log(`${padding}< ${CSharpSymbolType[symbol.symbolType]}: ${symbol.name} • typeName: ${symbol.typeName}${symbol instanceof CSharpParamSymbol && symbol.parameters ? ` • params: ${symbol.parameters}` : ""}${symbol.returnType ? ` • returnType: ${symbol.returnType}` : ""}${(symbol instanceof CSharpObject || symbol instanceof CSharpEnum) && symbol.implements ? ` • implements: ${symbol.implements}` : ""}${(symbol instanceof CSharpObject || symbol instanceof CSharpMethod) && symbol.constraints ? ` • constraints: ${symbol.constraints.join(", ")}` : ""}${symbol.namespace ? ` • namespace: ${symbol.namespace}` : ""}`);

        return symbol;
    }

    static parseFooter(textDocument: vscode.TextDocument, symbol: CSharpSymbol, isLastSymbol: boolean): string | undefined {
        if (symbol.symbolType === CSharpSymbolType.primaryConstructor) {
            // NOTE: do not set footerRange for primary constructor
            return undefined;
        }

        if (isLastSymbol && symbol.parent) {
            const parentLastPosition = CSharpSymbol.movePosition(textDocument, symbol.parent.documentSymbol.range.end, -1);
            if (!parentLastPosition.isAfter(symbol.textRange.end)) return undefined;

            symbol.footerRange = new vscode.Range(symbol.textRange.end, parentLastPosition);
            return textDocument.getText(symbol.footerRange);
        }

        const lastTextLine = textDocument.lineAt(symbol.textRange.end.line);
        const endOfLastTextLine = lastTextLine.rangeIncludingLineBreak.end;

        if (!endOfLastTextLine.isAfter(symbol.textRange.end)) return undefined;

        const possibleFooterRange = new vscode.Range(symbol.textRange.end, endOfLastTextLine);

        const endOfLastLineText = textDocument.getText(possibleFooterRange);

        const endOfLastLineIsWhitespaceOrComment = endOfLastLineText.trim().length === 0 || endOfLastLineText.match(/^\s*((\/\/.*)|(\/\*.*\*\/))\s*$/) !== null;

        if (!endOfLastLineIsWhitespaceOrComment) return undefined;

        symbol.footerRange = possibleFooterRange;
        return textDocument.getText(possibleFooterRange);
    }

    static parseHeader(textDocument: vscode.TextDocument, symbol: CSharpSymbol, start: vscode.Position, end: vscode.Position): string {
        if (symbol.symbolType !== CSharpSymbolType.primaryConstructor) {
            // NOTE: do not set headerRange for primary constructor
            symbol.headerRange = new vscode.Range(start, end);
        }
        return textDocument.getText(symbol.headerRange);
    }

    static parseImplementationsAndOrConstraints(textDocument: vscode.TextDocument, documentSymbol: vscode.DocumentSymbol, symbol: CSharpSymbol): [string | undefined, string | undefined] {
        const openOfBodyValues = symbol.symbolType === CSharpSymbolType.method ? ["{", "=>", ";"] : ["{"];
        const startOfInBetweenTextValues = symbol.symbolType === CSharpSymbolType.method ? [")"] : [":", "where"];

        let openOfBodyPosition: vscode.Position | undefined;
        let startOfInBetweenTextPosition: vscode.Position | undefined;
        let matchedValue: string | undefined;

        [openOfBodyPosition, matchedValue] = CSharpSymbol.getCharacterPosition(textDocument, documentSymbol.selectionRange.end, openOfBodyValues);
        if (!openOfBodyPosition) return [undefined, undefined];

        symbol.openOfBodyPosition = openOfBodyPosition;

        [startOfInBetweenTextPosition, matchedValue] = CSharpSymbol.getCharacterPosition(textDocument, documentSymbol.selectionRange.end, startOfInBetweenTextValues, openOfBodyPosition, symbol.symbolType === CSharpSymbolType.method);
        if (!startOfInBetweenTextPosition) return [undefined, undefined];

        if (matchedValue !== "where") {
            startOfInBetweenTextPosition = CSharpSymbol.movePosition(textDocument, startOfInBetweenTextPosition, 1);
        }

        let inBetweenText = textDocument.getText(new vscode.Range(startOfInBetweenTextPosition, openOfBodyPosition)).trim();
        if (!inBetweenText) return [undefined, undefined];

        const whereOnlyMatch = inBetweenText.match(/^\s*where\s+(?<constraints>.+)$/);
        if (whereOnlyMatch) return [undefined, whereOnlyMatch.groups?.constraints];

        const possiblyBothMatch = inBetweenText.match(/^(?<implementations>.*?)?\s*(\bwhere\s+(?<constraints>.+))?$/);
        return possiblyBothMatch ? [possiblyBothMatch.groups?.implementations, possiblyBothMatch.groups?.constraints] : [undefined, undefined];
    }

    static parseName(documentSymbol: vscode.DocumentSymbol, type: CSharpSymbolType): string {
        let name: string | undefined;

        switch (type) {
            case CSharpSymbolType.constructor:
            case CSharpSymbolType.finalizer:
            case CSharpSymbolType.primaryConstructor:
            case CSharpSymbolType.staticConstructor:
                name = CSharpMatch.getValue(documentSymbol.detail, CSharpMatchPatterns.symbolNameAgainstParenthesis);
                break;

            case CSharpSymbolType.operator:
                const operatorToEnd = CSharpMatch.getValue(documentSymbol.detail, CSharpMatchPatterns.operatorToEnd)!;
                name = CSharpSymbol.parseToEndOfName(operatorToEnd);
                break;
        }

        return name || documentSymbol.name;
    }

    static parseNamespace(documentSymbol: vscode.DocumentSymbol, symbol: CSharpSymbol): string | undefined {
        if (symbol.symbolType === CSharpSymbolType.namespace) {
            return documentSymbol.name;
        }

        if (!documentSymbol.detail.includes(".")) { return undefined; }

        let namespace = documentSymbol.detail.substring(0, documentSymbol.detail.lastIndexOf("."));

        if (symbol.symbolType === CSharpSymbolType.delegate && namespace.includes(".")) {
            namespace = namespace.substring(0, namespace.lastIndexOf("."));
        }

        return namespace;
    }

    static parseParameters(textDocument: vscode.TextDocument, documentSymbol: vscode.DocumentSymbol): string {
        let depth = 0;
        let index = documentSymbol.selectionRange.end;
        let next = CSharpSymbol.movePosition(textDocument, index, 1);
        let open = index;

        while (textDocument.validatePosition(next)) {
            const c = textDocument.getText(new vscode.Range(index, next));

            if (c === "(") {
                depth++;

                if (depth === 1) {
                    open = index;
                }
            }
            else if (c === "<" || c === "[") {
                depth++;
            }
            else if (c === ">" || c === "]") {
                depth--;
            }
            else if (c === ")") {
                depth--;

                if (depth === 0) {
                    break;
                }
            }

            index = next;
            next = CSharpSymbol.movePosition(textDocument, next, 1);
        }

        return textDocument.getText(new vscode.Range(open, next)).trim();
    }

    static parseSiblings(textDocument: vscode.TextDocument, documentSymbols: vscode.DocumentSymbol[], parentDocumentSymbol: vscode.DocumentSymbol | undefined, parentSymbol: CSharpSymbol | undefined, depth: number): CSharpSymbol[] {
        if (documentSymbols.length === 0) return [];

        documentSymbols = CSharpSymbol.orderByRange(documentSymbols);

        let previousIndex = 0;
        let previousSymbol: CSharpSymbol | undefined;
        const symbols: CSharpSymbol[] = [];

        for (let i = 0; i < documentSymbols.length; i++) {
            const currentDocumentSymbol = documentSymbols[i];
            let nextHeaderOffset: vscode.Position | undefined;

            if (i === 0 && parentSymbol && !CSharpSymbol.isPrimaryConstructor(currentDocumentSymbol, parentSymbol.documentSymbol)) {
                nextHeaderOffset = parentSymbol.openOfBodyPosition; // TODO: need? - CSharpSymbol.getOpenOfBody(textDocument, parentDocumentSymbol);
            }
            else if (i === 0 && parentDocumentSymbol && !CSharpSymbol.isPrimaryConstructor(currentDocumentSymbol, parentDocumentSymbol)) {
                nextHeaderOffset = CSharpSymbol.getOpenOfBody(textDocument, parentDocumentSymbol);
            }
            else if (i > 0) {
                nextHeaderOffset = previousSymbol?.endPosition;

                if (!nextHeaderOffset) {
                    const previousDocumentSymbol = documentSymbols[previousIndex];
                    if (!parentSymbol || !CSharpSymbol.isPrimaryConstructor(previousDocumentSymbol, parentSymbol.documentSymbol)) {
                        nextHeaderOffset = previousDocumentSymbol.range.end;
                    }
                    else if (parentSymbol && CSharpSymbol.isPrimaryConstructor(previousDocumentSymbol, parentSymbol.documentSymbol)) {
                        nextHeaderOffset = parentSymbol.openOfBodyPosition; // TODO: need? - CSharpSymbol.getOpenOfBody(textDocument, parentDocumentSymbol);
                    }
                }
            }

            const symbol = CSharpSymbol.parse(textDocument, currentDocumentSymbol, parentSymbol, depth, nextHeaderOffset, i === documentSymbols.length - 1);
            if (symbol) {
                previousIndex = i;
                previousSymbol = symbol;
                symbols.push(symbol);
            }
        }

        return symbols;
    }

    static parseText(textDocument: vscode.TextDocument, documentSymbol: vscode.DocumentSymbol, symbol: CSharpSymbol): string {
        symbol.textSymbolNameIndex = textDocument.offsetAt(documentSymbol.selectionRange.start) - textDocument.offsetAt(documentSymbol.range.start);

        if (symbol.symbolType === CSharpSymbolType.primaryConstructor) {
            // NOTE: do not set textRange for primary constructor
            return documentSymbol.detail;
        }

        symbol.textRange = documentSymbol.range;

        return textDocument.getText(documentSymbol.range);
    }

    static parseToEndOfName(text: string): string {
        let index = 0;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];

            if (c === "<" || c === "[" || c === "(" || c === " " || c === "\t" || c === "\n" || c === "\r") {
                index = i;
                break;
            }
        }

        return text.substring(0, index).trim();
    }

    static parseToOpenParenthesis(text: string): string {
        let depth = 0;
        let index = 0;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];

            if (c === "<" || c === "[") {
                depth++;
            }
            else if (c === ">" || c === "]" || c === ")") {
                depth--;
            }
            else if (c === "(") {
                if (depth === 0) {
                    index = i;
                    break;
                }

                depth++;
            }
        }

        return text.substring(0, index).trim();
    }

    static parseTypeName(documentSymbol: vscode.DocumentSymbol, symbol: CSharpSymbol): string {
        let typeName = documentSymbol.detail.includes(".")
            ? documentSymbol.detail.substring(documentSymbol.detail.lastIndexOf(".") + 1)
            : documentSymbol.detail;

        switch (symbol.symbolType) {
            case CSharpSymbolType.constructor:
            case CSharpSymbolType.method:
            case CSharpSymbolType.primaryConstructor:
            case CSharpSymbolType.staticConstructor:
                typeName = CSharpSymbol.parseToOpenParenthesis(typeName);
                break;

            case CSharpSymbolType.finalizer:
                typeName = CSharpSymbol.parseToOpenParenthesis(typeName.substring(typeName.indexOf("~") + 1));
                break;

            case CSharpSymbolType.operator:
                const operatorToEnd = CSharpMatch.getValue(documentSymbol.detail, CSharpMatchPatterns.operatorToEnd)!;
                typeName = CSharpSymbol.parseToOpenParenthesis(operatorToEnd);
                break;
        }

        return typeName;
    }

    static processSymbolHeaderAndText(symbol: CSharpSymbol): void {
        let textUpToSymbolName = symbol.text.substring(0, symbol.textSymbolNameIndex);
        let commentMatches: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;
        let totalMatchLength = 0;

        for (const re of [
            CSharpMatchPatterns.multiLineCommentRegExp,
            CSharpMatchPatterns.singleLineCommentRegExp,
            CSharpMatchPatterns.attributeRegExp,
            CSharpMatchPatterns.singleLineCommentRegExp,
            CSharpMatchPatterns.keywordRegExp,
        ]) {
            while ((match = re.exec(textUpToSymbolName)) !== null) {
                if (!match.groups?.value) continue;

                const value = match.groups.value;
                const startIndex = match.index;
                const endIndex = startIndex + value.length;

                let removeText = true;

                if (re === CSharpMatchPatterns.attributeRegExp) {
                    symbol.attributes.push(value);
                }
                else if (re === CSharpMatchPatterns.keywordRegExp) {
                    symbol.keywords.push(value.trim());
                    removeText = false;
                }
                else {
                    commentMatches.push(match);
                }

                totalMatchLength += value.length;

                if (removeText) {
                    textUpToSymbolName = textUpToSymbolName.substring(0, startIndex) + textUpToSymbolName.substring(endIndex);
                    re.lastIndex = 0; // yes, reset since string is modified
                }
            }

            re.lastIndex = 0;
        }

        if (symbol.symbolType !== CSharpSymbolType.constructor
            && symbol.symbolType !== CSharpSymbolType.primaryConstructor
            && symbol.symbolType !== CSharpSymbolType.staticConstructor
            && symbol.symbolType !== CSharpSymbolType.finalizer) {
            symbol.returnType = symbol.text.substring(totalMatchLength, symbol.textSymbolNameIndex).trim();
        }

        if (symbol.symbolType === CSharpSymbolType.constant) {
            symbol.returnType = symbol.returnType!.match(/const\s+(.+)/)?.[1];
        }
        else if (symbol.symbolType === CSharpSymbolType.event) {
            symbol.returnType = symbol.returnType!.match(/event\s+(.+)/)?.[1];
        }
        else if (symbol.symbolType === CSharpSymbolType.operator) {
            const operatorMatch = symbol.returnType!.match(/(.+)\s+operator/);
            if (operatorMatch?.[1]) {
                const operatorValue = operatorMatch[1].trim();
                if (operatorValue === "implicit") {
                    (<CSharpOperator>symbol).isImplicit = true;
                    symbol.returnType = symbol.typeName;
                }
                else if (operatorValue === "explicit") {
                    (<CSharpOperator>symbol).isExplicit = true;
                    symbol.returnType = symbol.typeName;
                }
                else {
                    symbol.returnType = operatorValue;
                }
            }
        }

        symbol.text = textUpToSymbolName + symbol.text.substring(symbol.textSymbolNameIndex);

        commentMatches = commentMatches.sort((a, b) => a.index - b.index);
        for (const commentMatch of commentMatches) {
            const comment = commentMatch.groups?.value;
            if (!comment) continue;

            symbol.header = symbol.header ? `${symbol.header}${symbol.eol}${comment}` : comment;
        }

        for (const attr of symbol.attributes) {
            symbol.header = symbol.header ? `${symbol.header}${symbol.eol}${attr}` : attr;
        }
    }
}

export class CSharpObject extends CSharpSymbol {
    constraints: string[] = [];
    implements: string | undefined;
    members: CSharpSymbol[] = [];
}

export class CSharpParamSymbol extends CSharpSymbol {
    parameters!: string;
}

export class CSharpClass extends CSharpObject {
}

export class CSharpConstant extends CSharpSymbol {
}

export class CSharpConstructor extends CSharpSymbol {
    isPrimary: boolean = false;
    isStatic: boolean = false;
}

export class CSharpDelegate extends CSharpParamSymbol {
}

export class CSharpEnum extends CSharpSymbol {
    implements: string | undefined;
}

export class CSharpEvent extends CSharpSymbol {
}

export class CSharpField extends CSharpSymbol {
}

export class CSharpFinalizer extends CSharpSymbol {
}

export class CSharpIndexer extends CSharpSymbol {
}

export class CSharpInterface extends CSharpObject {
}

export class CSharpMethod extends CSharpParamSymbol {
    constraints: string[] = [];
}

export class CSharpOperator extends CSharpParamSymbol {
    isExplicit: boolean = false;
    isImplicit: boolean = false;
}

export class CSharpProperty extends CSharpSymbol {
}

export class CSharpRecord extends CSharpObject {
    isClass: boolean = false;
    isStruct: boolean = false;
}

export class CSharpStruct extends CSharpObject {
}
