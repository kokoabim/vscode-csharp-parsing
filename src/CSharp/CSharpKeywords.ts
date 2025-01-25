export class CSharpKeywords {
    static readonly accessModifiers = [
        "file",
        "internal",
        "private protected",
        "private",
        "protected internal",
        "protected",
        "public",
    ];

    static isAccessModifier(value: string): boolean {
        return CSharpKeywords.accessModifiers.includes(value);
    }
}