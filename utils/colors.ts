/**
 * Converts a hex color string to an RGBA color string.
 * Supports #RGB and #RRGGBB formats.
 * If the input is invalid, it returns a white RGBA string with the given alpha.
 *
 * @param hex The hex color string (e.g., "#ff0000" or "#f00")
 * @param alpha The alpha value (0 to 1)
 * @returns An RGBA color string (e.g., "rgba(255,0,0,0.5)")
 */
export const hexToRgba = (hex: string, alpha: number): string => {
  let c: string[] | string;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    const numC = parseInt(c, 16);
    return 'rgba(' + [(numC >> 16) & 255, (numC >> 8) & 255, numC & 255].join(',') + ',' + alpha + ')';
  }
  return `rgba(255,255,255,${alpha})`;
};
