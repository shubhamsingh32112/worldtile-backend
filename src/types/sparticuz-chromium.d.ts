declare module '@sparticuz/chromium' {
  export const args: string[];
  export function executablePath(): Promise<string>;
  export const headless: boolean;
  
  const chromium: {
    args: string[];
    executablePath: () => Promise<string>;
    headless: boolean;
  };
  
  export default chromium;
}
