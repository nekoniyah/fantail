import fs from "fs";
import path from "path";

export default function getFilesRecursively(folder: string) {
    let files: string[] = []

    fs.readdirSync(folder, {withFileTypes: true}).forEach(file => {
        if (file.isDirectory()) files.push(...getFilesRecursively(path.join(folder, file.name)))
        else files.push(path.join(folder, file.name));
    })

    return files;
}