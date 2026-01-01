type ColorKey =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray';
type BgKey =
  | 'bgRed'
  | 'bgGreen'
  | 'bgYellow'
  | 'bgBlue'
  | 'bgMagenta'
  | 'bgCyan'
  | 'bgWhite';

class CustomLogger {
  // ANSI Escape Codes
  private readonly colors: Record<ColorKey, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
  };

  private readonly backgrounds: Record<BgKey, string> = {
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
  };

  private readonly reset = '\x1b[0m';
  private readonly bold = '\x1b[1m';

  /**
   * Core formatting method
   */
  private format(
    text: string,
    color?: ColorKey,
    bg?: BgKey,
    isBold: boolean = false
  ): string {
    const colorCode = color ? this.colors[color] : '';
    const bgCode = bg ? this.backgrounds[bg] : '';
    const boldCode = isBold ? this.bold : '';

    return `${boldCode}${colorCode}${bgCode}${text}${this.reset}`;
  }

  // Public Methods
  public info(message: string): void {
    console.log(this.format('[INFO]', 'cyan', undefined, true), message);
  }

  public success(message: string): void {
    console.log(this.format(' SUCCESS ', 'white', 'bgGreen', true), message);
  }

  public warn(message: string): void {
    console.log(
      this.format(' WARNING ', 'black' as any, 'bgYellow', true),
      message
    );
  }

  public error(message: string): void {
    console.error(this.format(' ERROR ', 'white', 'bgRed', true), message);
  }

  /**
   * Custom log for flexible styling
   */
  public custom(message: string, color: ColorKey, bg?: BgKey): void {
    console.log(this.format(message, color, bg));
  }
}

// Export a single instance (Singleton pattern)
export const logger = new CustomLogger();
