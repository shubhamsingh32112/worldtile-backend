declare module '@sparticuz/chromium' {
  export const args: string[];
  export const executablePath: () => Promise<string>;
  export const headless: boolean;
  export default {
    args: string[];
    executablePath: () => Promise<string>;
    headless: boolean;
  };
}
