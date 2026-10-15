import chalk from "chalk";
import * as fs from "fs";

export default class FantailLogger {

    private static logsFolderPath = `${process.cwd()}/logs`

    private static logFilepath = FantailLogger.createLogFilePath();

    public static base(message: string) {
        const logTime = new Date().toISOString();
        return `[${logTime}] ${message}`;
    }

    public static log(message: string) {
        console.log(`[INFO] ${message}`)
        this.appendLine(`[INFO] ${message}`);
    }

    public static info(message: string) {
        const line = this.base(chalk.blue.bgBlack(`[INFO] ${message}`));
        console.info(line);
        this.appendLine(line);
    }

    public static warning(message: string) {
        const line = this.base(chalk.yellow.bgBlack(`[WARN] ${message}`))
        console.warn(line);
        this.appendLine(line);
    }

    public static error(message: string) {
        const line = this.base(chalk.redBright.bgBlack(`[ERR] ${message}`))
        console.error(line);
        this.appendLine(line);
    }

    private static appendLine(line: string) {
        if(Boolean(process.env.WRITE_LOGS )) return;

        const logFileContent = fs.readFileSync(this.logFilepath, {encoding: "utf8"});
        const lines = logFileContent.split("\n");
        lines.push(line)
        fs.writeFileSync(this.logFilepath, lines.join("\n"));
    }

    private static createLogFilePath(): string {

        const path = `${this.logsFolderPath}/${new Date().toISOString().replaceAll(":", "-")}.txt`

        if(Boolean(process.env.WRITE_LOGS )) return path;

        if (!fs.existsSync(this.logsFolderPath)) {
            fs.mkdirSync(this.logsFolderPath);
        }

        if (!fs.existsSync(this.logFilepath)) {
            fs.writeFileSync(path, "", "utf-8")
        }

        return path
    }

}