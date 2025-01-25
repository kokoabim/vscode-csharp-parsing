import * as vscode from "vscode";
import * as fs from "fs/promises";
import { glob } from 'glob';
import { basename, dirname } from 'path';

export class CSharpProjectFile {
    assemblyName!: string;
    defaultNamespace!: string;
    directory: string;
    isTestProject: boolean = false;
    name: string;
    targetFramework: string | undefined;

    private fileContents: string | undefined;

    constructor(public filePath: string, public relativePath: string) {
        this.directory = dirname(filePath);
        this.name = basename(filePath, ".csproj");
        this.relativePath = relativePath;
    }

    static async findProjects(workspaceFolder: vscode.WorkspaceFolder): Promise<CSharpProjectFile[]> {
        return await CSharpProjectFile.findProjectsUnderDirectory(workspaceFolder.uri.fsPath);
    }

    static async findProjectsUnderDirectory(directory: string): Promise<CSharpProjectFile[]> {
        return await glob(directory + '/**/*.csproj').then(async files => {
            const cSharpProjectFiles = files.map(f => new CSharpProjectFile(f, f.replace(directory + "/", "")));
            for await (const f of cSharpProjectFiles) { await f.readFileProperties(); }
            return cSharpProjectFiles;
        }, error => {
            throw error;
        });
    }

    static projectOfTextDocument(projects: CSharpProjectFile[], textDocument: vscode.TextDocument): CSharpProjectFile | undefined {
        return projects.find(p => textDocument.uri.path.includes(p.directory + "/"));
    }

    async getCSharpFileUris(): Promise<vscode.Uri[]> {
        return await this.getFileUrisByExtension("cs");
    }

    async getFileUrisByExtension(extension: string): Promise<vscode.Uri[]> {
        return (await vscode.workspace.findFiles(`**/*.${extension}`)).filter(f =>
            f.path.includes(this.directory + "/")
            && !f.path.includes("/bin/Debug/")
            && !f.path.includes("/obj/Debug/")
            && !f.path.includes("/bin/Release/")
            && !f.path.includes("/obj/Release/")
        );
    }

    getProperty(name: string): string | undefined {
        return this.fileContents?.match(new RegExp(`<${name}>(.*)</${name}>`, "i"))?.[1];
    }

    private static async readFileAsString(filePath: string): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            await fs.readFile(filePath).then(data => {
                resolve(Buffer.from(data).toString("utf8"));
            }, err => {
                reject(err);
            });
        });
    }

    private async readFileProperties(): Promise<void> {
        await CSharpProjectFile.readFileAsString(this.filePath).then(contents => {
            this.fileContents = contents;
        }, error => {
            throw error;
        });

        this.assemblyName = this.name;

        if (this.fileContents) {
            const assemblyName = this.getProperty("AssemblyName");
            if (assemblyName) this.assemblyName = assemblyName;

            this.defaultNamespace = this.getProperty("RootNamespace") || assemblyName || this.name || "";
            this.isTestProject = this.getProperty("IsTestProject")?.localeCompare("true", undefined, { sensitivity: "accent" }) === 0;
            this.targetFramework = this.getProperty("TargetFramework");
        }
    }
}