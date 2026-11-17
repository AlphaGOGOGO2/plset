// Minimap images for the stock match maps (public/maps, 512×512). Maps a host adds by name have no image and show a name tile.
const FILES: Record<string, string> = {
  옥타곤: 'octagon', 녹아웃: 'knockout', 아이올로스: 'aeolus', 오디세이: 'odyssey', 컬러리스페이트: 'colorless-fate', 애티튜드: 'attitude', 백룸: 'backroom',
};
export function mapImage(label: string): string | null {
  const file = FILES[label.replace(/\s+/g, '')];
  return file ? `${import.meta.env.BASE_URL}maps/${file}.jpg` : null;
}
