export class StringBuilder {
    private array: Array<string> = [];

    constructor(...initialValues: string[]) {
        this.array.push(...initialValues);
    }

    get length(): Number { return this.array.length; }

    append(value: string): this {
        this.array.push(value);
        return this;
    }

    clear(): this {
        this.array = [];
        return this;
    }

    concat<T>(separator: string, ...values: T[]): this {
        this.array.push(values.join(separator));
        return this;
    }

    substring(start: number, end?: number | undefined): string {
        return this.toString().substring(start, end);
    }

    toString(): string {
        return this.array.join("");
    }
}
