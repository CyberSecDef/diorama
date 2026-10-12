// The x11 package ships no types; it is used through a thin, loosely-typed boundary in wm.ts.
declare module 'x11' {
  const x11: any;
  export default x11;
}
