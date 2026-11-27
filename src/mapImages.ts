// Minimap images in public/maps, 512px on the long side (two-player maps are taller than wide), keyed by the map name without spaces.
// The stock match maps come first; the rest get their image when a host adds them by name. Any other name shows a name tile.
const FILES: Record<string, string> = {
  옥타곤: 'octagon', 녹아웃: 'knockout', 아이올로스: 'aeolus', 오디세이: 'odyssey', 컬러리스페이트: 'colorless-fate', 애티튜드: 'attitude', 백룸: 'backroom',
  머즐플래시: 'muzzle-flash', 뉴노멀: 'new-normal', 마리골드: 'marigold', 어센션: 'ascension', 마스커레이드: 'masquerade', 버터: 'butter',
};
export function mapImage(label: string): string | null {
  const file = FILES[label.replace(/\s+/g, '')];
  return file ? `${import.meta.env.BASE_URL}maps/${file}.jpg` : null;
}
