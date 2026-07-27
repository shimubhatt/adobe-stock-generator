// Official Adobe Stock contributor categories.
// The CSV "Category" column must contain the NUMBER, not the name.
// Source: https://helpx.adobe.com/stock/contributor/help/categories.html
export const ADOBE_CATEGORIES = [
  { id: 1, name: 'Animals' },
  { id: 2, name: 'Buildings and Architecture' },
  { id: 3, name: 'Business' },
  { id: 4, name: 'Drinks' },
  { id: 5, name: 'The Environment' },
  { id: 6, name: 'States of Mind' },
  { id: 7, name: 'Food' },
  { id: 8, name: 'Graphic Resources' },
  { id: 9, name: 'Hobbies and Leisure' },
  { id: 10, name: 'Industry' },
  { id: 11, name: 'Landscape' },
  { id: 12, name: 'Lifestyle' },
  { id: 13, name: 'People' },
  { id: 14, name: 'Plants and Flowers' },
  { id: 15, name: 'Culture and Religion' },
  { id: 16, name: 'Science' },
  { id: 17, name: 'Social Issues' },
  { id: 18, name: 'Sports' },
  { id: 19, name: 'Technology' },
  { id: 20, name: 'Transport' },
  { id: 21, name: 'Travel' },
];

export const CATEGORY_NAME_TO_ID = ADOBE_CATEGORIES.reduce((acc, c) => {
  acc[c.name.toLowerCase()] = c.id;
  return acc;
}, {});

export const DEFAULT_CATEGORY_ID = 8; // Graphic Resources — safest generic fallback

export function categoryNameToId(name) {
  if (!name) return DEFAULT_CATEGORY_ID;
  const match = CATEGORY_NAME_TO_ID[String(name).toLowerCase().trim()];
  return match || DEFAULT_CATEGORY_ID;
}

export function categoryIdToName(id) {
  const found = ADOBE_CATEGORIES.find((c) => c.id === Number(id));
  return found ? found.name : 'Graphic Resources';
}
