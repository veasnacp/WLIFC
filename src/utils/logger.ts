class CustomLogger {
  public info(...message: any[]): void {
    console.log('[INFO]', ...message);
  }

  public success(...message: any[]): void {
    console.log('[SUCCESS]', ...message);
  }

  public warn(...message: any[]): void {
    console.warn(...message);
  }

  public error(...message: any[]): void {
    console.error(...message);
  }

  public custom(message: string[]): void {
    console.log(...message);
  }
}

export const logger = new CustomLogger();
