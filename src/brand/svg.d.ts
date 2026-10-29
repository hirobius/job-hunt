// Vite's `?raw` import: the file's text as a string (src/brand/flame.svg).
declare module '*.svg?raw' {
  const text: string;
  export default text;
}
