/**
 * Polyfill for Promise.withResolvers
 * Required for PDF.js 4+ on many mobile browsers (Safari < 17.4)
 */
if (typeof Promise !== 'undefined' && !Promise.withResolvers) {
  (Promise as any).withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
}

export {};
