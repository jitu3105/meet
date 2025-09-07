import winston, { createLogger, format, transports } from "winston";
const { combine, timestamp, label, printf } = format;

export default class Logger {
  private logger: winston.Logger;
  constructor({ lable }: { lable: string }) {
    const myFormat = printf(({ level, message, label, timestamp }) => {
      return `[${label}]  ${timestamp}  [${level.toUpperCase()}] ->  ${message}`;
    });
    this.logger = createLogger({
      format: combine(label({ label: lable }), timestamp(), myFormat),
      transports: [new transports.Console()],
    });
  }

  log(message: string) {
    this.logger.log({ message, level: "info" });
  }

  error(message: string) {
    this.logger.log({ message, level: "error" });
  }

  warn(message: string) {
    this.logger.log({ message, level: "warning" });
  }
}
