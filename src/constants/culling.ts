export interface ColorOption {
  id: string;
  bg: string;
  border: string;
  ring: string;
  text: string;
  shortcut: string;
}

export const COLOR_PALETTE: ColorOption[] = [
  { id: 'red', bg: 'bg-red-500', border: 'border-red-500', ring: 'ring-red-400', text: 'text-red-400', shortcut: '6' },
  { id: 'yellow', bg: 'bg-amber-400', border: 'border-amber-400', ring: 'ring-amber-300', text: 'text-amber-400', shortcut: '7' },
  { id: 'green', bg: 'bg-emerald-500', border: 'border-emerald-500', ring: 'ring-emerald-400', text: 'text-emerald-400', shortcut: '8' },
  { id: 'blue', bg: 'bg-blue-500', border: 'border-blue-500', ring: 'ring-blue-400', text: 'text-blue-400', shortcut: '9' },
  { id: 'purple', bg: 'bg-purple-500', border: 'border-purple-500', ring: 'ring-purple-400', text: 'text-purple-400', shortcut: '' },
];

export const getColorConfig = (colorId: string | null | undefined): ColorOption | undefined => {
  if (!colorId) return undefined;
  return COLOR_PALETTE.find(c => c.id === colorId.toLowerCase());
};
