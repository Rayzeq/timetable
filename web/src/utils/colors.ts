const componentToHex = (c: number): string => {
  try {
    const hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }
  catch {
    return "00";
  }
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

export const hexToRgb = (hex: string): [r: number, g: number, b: number] | null => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
};

const black = "black";
const white = "white";

// http://www.w3.org/TR/AERT#color-contrast
export const textColorOnCustomBackground = (color: string, reversed = false) => {
  const [r, g, b] = color.split(",").map(Number);
  const brightness = Math.round(((r * 299) + (g * 587) + (b * 114)) / 1000);

  const output = (brightness > 125) ? black : white;

  if (reversed) {
    return output === black ? white : black;
  }

  return output;
};
