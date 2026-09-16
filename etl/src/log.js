const start = Date.now();
const stamp = () => `${((Date.now() - start) / 1000).toFixed(1)}s`.padStart(7);

export const log = {
  info:  (...a) => console.log(`${stamp()} ·`, ...a),
  step:  (...a) => console.log(`${stamp()} ▸`, ...a),
  warn:  (...a) => console.warn(`${stamp()} !`, ...a),
  error: (...a) => console.error(`${stamp()} ✖`, ...a),
};
