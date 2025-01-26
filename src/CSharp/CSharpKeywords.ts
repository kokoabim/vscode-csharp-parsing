export class CSharpKeywords {
    static readonly accessModifiers = [
        "public",
        "protected internal",
        "internal",
        "protected",
        "private protected",
        "private",
        "file",
    ];

    static readonly inheritanceModifiers = [
        "virtual",
        "abstract",
        "sealed",
        "override",
    ];

    static isAccessModifier(value: string): boolean {
        return CSharpKeywords.accessModifiers.includes(value);
    }

    static isInheritanceModifier(value: string): boolean {
        return CSharpKeywords.inheritanceModifiers.includes(value);
    }

    static accessModifierLevel(value: string): number {
        return CSharpKeywords.accessModifiers.indexOf(value);
    }

    static accessModifierIsEqualOrHigher(a: string, b: string): boolean {
        return CSharpKeywords.accessModifierLevel(a) <= CSharpKeywords.accessModifierLevel(b); // higher level is lower index
    }
}