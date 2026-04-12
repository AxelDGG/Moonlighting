// SVG icon factory — references the inline sprite defined in index.html
// Usage: ic('edit') → '<svg class="icon"><use href="#ic-edit"/></svg>'

export function ic(name, size = '') {
  return `<svg class="icon${size ? ' icon-' + size : ''}"><use href="#ic-${name}"/></svg>`;
}
