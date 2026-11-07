export function recordEvent(store, source, type, message, context = {}, data = {}) {
  return store.event({ source, type, message, ...context, data });
}
