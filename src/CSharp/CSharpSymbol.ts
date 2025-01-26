import * as vscode from 'vscode';
import { CSharpMatch, CSharpMatchPatterns } from './CSharpMatchPatterns';
import { CSharpSymbolType } from './CSharpSymbolType';
import { CSharpKeywords } from './CSharpKeywords';

export class CSharpSymbol {
    accessModifier!: string;
    attributes: string[] = [];
    constraints: string[] = [];
    documentSymbol!: vscode.DocumentSymbol;
    footer: string | undefined;
    footerRange: vscode.Range | undefined;
    header: string | undefined;
    headerRange!: vscode.Range;
    implements: string[] = [];
    inheritanceModifiers: string[] = [];
    isExplicitOperator: boolean = false;
    isImplicitOperator: boolean = false;
    isPrimaryConstructor: boolean = false;
    isRecordClass: boolean = false;
    isRecordStruct: boolean = false;
    isStaticConstructor: boolean = false;
    keywords: string[] = [];
    members: CSharpSymbol[] = [];
    name!: string;
    namespace: string | undefined;
    parameters: string | undefined;
    parent: CSharpSymbol | undefined;
    returnType: string | undefined;
    symbolType!: CSharpSymbolType;
    text!: string;
    textRange!: vscode.Range;
    typeName!: string;

    private depth = 0;
    private eol = "\n";
    private openOfBodyPosition: vscode.Position | undefined;
    private textSymbolNameIndex!: number;

    get isAbstractMember() { return this.inheritanceModifiers.includes("abstract"); }

    get isPublicMember() { return this.accessModifier === "public"; }

    get isStaticMember() { return this.keywords.includes("static"); }

    private get endPosition() { return this.footerRange?.end || this.textRange?.end; }

    static canHaveParameters(symbol: CSharpSymbol): boolean {
        return symbol.symbolType === CSharpSymbolType.constructor
            || symbol.symbolType === CSharpSymbolType.method
            || symbol.symbolType === CSharpSymbolType.operator
            || symbol.symbolType === CSharpSymbolType.delegate
            || symbol.symbolType === CSharpSymbolType.indexer;
    }

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

    static isObjectSymbol(symbol: CSharpSymbol): boolean {
        return symbol.symbolType === CSharpSymbolType.class
            || symbol.symbolType === CSharpSymbolType.interface
            || symbol.symbolType === CSharpSymbolType.struct
            || symbol.symbolType === CSharpSymbolType.recordClass
            || symbol.symbolType === CSharpSymbolType.recordStruct;
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

        const type = CSharpSymbolType.byDocumentSymbol(textDocument, documentSymbol, parentSymbol);
        if (type === CSharpSymbolType.none) return undefined;

        let symbol = new CSharpSymbol();

        switch (type) {
            case CSharpSymbolType.primaryConstructor:
                symbol.isPrimaryConstructor = true;
                break;

            case CSharpSymbolType.staticConstructor:
                symbol.isStaticConstructor = true;
                break;

            case CSharpSymbolType.recordClass:
                symbol.isRecordClass = true;
                break;

            case CSharpSymbolType.recordStruct:
                symbol.isRecordStruct = true;
                break;
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

        if (CSharpSymbol.isObjectSymbol(symbol)) {
            const [implementations, constraints] = CSharpSymbol.parseImplementationsAndOrConstraints(textDocument, documentSymbol, symbol);
            if (implementations) symbol.implements = CSharpSymbol.parseTypeNames(implementations);
            symbol.constraints = constraints ? constraints.split("where").map(c => c.trim()) : [];

            symbol.members = CSharpSymbol.parseSiblings(textDocument, documentSymbol.children, documentSymbol, symbol, ++depth);
        }

        if (symbol.symbolType === CSharpSymbolType.enum) {
            // eslint-disable-next-line no-unused-vars
            const [implementations, constraints] = CSharpSymbol.parseImplementationsAndOrConstraints(textDocument, documentSymbol, symbol);
            if (implementations) symbol.implements = CSharpSymbol.parseTypeNames(implementations);
        }

        if (CSharpSymbol.canHaveParameters(symbol)) {
            symbol.parameters = CSharpSymbol.parseParameters(textDocument, documentSymbol);
        }

        if (symbol.symbolType === CSharpSymbolType.method) {
            // eslint-disable-next-line no-unused-vars
            const [implementations, constraints] = CSharpSymbol.parseImplementationsAndOrConstraints(textDocument, documentSymbol, symbol);
            symbol.constraints = constraints ? constraints.split("where").map(c => c.trim()) : [];
        }

        console.log(`${padding}< ${CSharpSymbolType[symbol.symbolType]}: ${symbol.name} • typeName: ${symbol.typeName}${CSharpSymbol.canHaveParameters(symbol) && symbol.parameters ? ` • params: ${symbol.parameters}` : ""}${symbol.returnType ? ` • returnType: ${symbol.returnType}` : ""}${(CSharpSymbol.isObjectSymbol(symbol) || symbol.symbolType === CSharpSymbolType.enum) && symbol.implements.length > 0 ? ` • implements: ${symbol.implements.join(", ")}` : ""}${(CSharpSymbol.isObjectSymbol(symbol) || symbol.symbolType === CSharpSymbolType.method) && symbol.constraints.length > 0 ? ` • constraints: ${symbol.constraints.join(", ")}` : ""}${symbol.namespace ? ` • namespace: ${symbol.namespace}` : ""}`);

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
                nextHeaderOffset = parentSymbol.openOfBodyPosition;
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
                        nextHeaderOffset = parentSymbol.openOfBodyPosition;
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

    static parseTypeNames(text: string): string[] {
        const typeNames: string[] = [];
        let depth = 0;
        let index = 0;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];

            if (c === "<" || c === "[" || c === "(") {
                depth++;
            }
            else if (c === ">" || c === "]" || c === ")") {
                depth--;
            }
            else if (c === "," && depth === 0) {
                typeNames.push(text.substring(index, i).trim());
                index = i + 1;
            }
        }

        typeNames.push(text.substring(index).trim());

        return typeNames;
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
                    const keyword = value.trim();

                    symbol.keywords.push(keyword);
                    removeText = false;

                    if (CSharpKeywords.accessModifiers.includes(keyword)) symbol.accessModifier = keyword;

                    if (CSharpKeywords.isInheritanceModifier(keyword)) symbol.inheritanceModifiers.push(keyword);
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
                    symbol.isImplicitOperator = true;
                    symbol.returnType = symbol.typeName;
                }
                else if (operatorValue === "explicit") {
                    symbol.isExplicitOperator = true;
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
