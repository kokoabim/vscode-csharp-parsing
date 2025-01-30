import { CSharpMatchPatterns } from "./CSharpMatchPatterns";

export class CSharpParameter {
    attributes: string[] = [];
    defaultValue: string | undefined;
    isIn: boolean = false;
    isOut: boolean = false;
    isParams: boolean = false;
    isRef: boolean = false;
    name!: string;
    rawText!: string;
    type!: string;

    static parseMultiple(parametersText: string): CSharpParameter[] {
        if (!parametersText) return [];

        parametersText = parametersText.trim();
        if (parametersText === "()") return [];

        if (parametersText.startsWith("(") || parametersText.startsWith("[")) parametersText = parametersText.substring(1, parametersText.length - 1);
        if (parametersText.endsWith(")") || parametersText.endsWith("]")) parametersText = parametersText.substring(0, parametersText.length - 1);

        const parameterTexts = CSharpParameter.splitParameters(parametersText);
        return parameterTexts.map(CSharpParameter.parse);
    }

    private static parse(parameterText: string): CSharpParameter {
        const parameter = new CSharpParameter();
        parameter.rawText = parameterText;

        let attrMatch;
        while ((attrMatch = CSharpMatchPatterns.attributeAtStartRegExp.exec(parameterText)) !== null) {
            if (!attrMatch.groups?.value) continue;

            parameter.attributes.push(attrMatch.groups.value.trim());

            parameterText = parameterText.substring(attrMatch.groups.value.length);
            CSharpMatchPatterns.attributeRegExp.lastIndex = 0;
        }

        const parameterModeMatch = parameterText.match(CSharpMatchPatterns.parameterMode);
        if (parameterModeMatch?.groups?.value) {
            const mode = parameterModeMatch.groups.value.trim();
            parameter.isIn = mode === "in";
            parameter.isOut = mode === "out";
            parameter.isRef = mode === "ref";
            parameter.isParams = mode === "params";
            parameterText = parameterText.substring(parameterModeMatch.groups.value.length);
        }

        const [typeNameStart, typeNameEnd] = CSharpParameter.parseTypeNameIndexes(parameterText);
        parameter.type = parameterText.substring(typeNameStart, typeNameEnd);
        parameterText = parameterText.substring(typeNameEnd).trim();

        const nameMatch = parameterText.match(CSharpMatchPatterns.symbolName);
        if (!nameMatch) throw new Error("Parameter name not found");
        parameter.name = nameMatch[0];

        parameterText = parameterText.substring(nameMatch[0].length).trim();

        if (parameterText.startsWith("=")) {
            const defaultValue = parameterText.substring(1).trim();
            parameter.defaultValue = defaultValue;
        }

        return parameter;
    }

    private static parseTypeNameIndexes(text: string): [number, number] {
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
            else if (c === " " && depth === 0) {
                return [index, i];
            }
        }

        throw new Error("Parameter typename not found");
    }

    private static splitParameters(parametersText: string): string[] {
        const parameterText: string[] = [];
        let depth = 0;
        let index = 0;
        let inQuote = false;

        for (let i = 0; i < parametersText.length; i++) {
            const c = parametersText[i];

            if (c === "\"") { // quotes can be used for default string values
                const previousChar = parametersText[i - 1];
                if (previousChar !== "\\") inQuote = !inQuote;
            }
            else if (!inQuote) {
                if (c === "<" || c === "[" || c === "(") {
                    depth++;
                }
                else if (c === ">" || c === "]" || c === ")") {
                    depth--;
                }
                else if (c === "," && depth === 0) {
                    parameterText.push(parametersText.substring(index, i).trim());
                    index = i + 1;
                }
            }
        }

        parameterText.push(parametersText.substring(index).trim());

        return parameterText;
    }
}