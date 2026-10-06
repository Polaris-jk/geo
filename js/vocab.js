// Field vocabulary. Edit these lists to suit your course or study area.
// [English (stored and exported), Thai (shown as a hint)]

export const LITHOLOGY = [
  {
    group: 'Sedimentary (หินตะกอน)',
    items: [
      ['Sandstone', 'หินทราย'],
      ['Siltstone', 'หินทรายแป้ง'],
      ['Mudstone', 'หินโคลน'],
      ['Claystone', 'หินเคลย์'],
      ['Shale', 'หินดินดาน'],
      ['Conglomerate', 'หินกรวดมน'],
      ['Breccia', 'หินกรวดเหลี่ยม'],
      ['Limestone', 'หินปูน'],
      ['Dolostone', 'หินโดโลไมต์'],
      ['Chert', 'หินเชิร์ต'],
      ['Rock salt', 'หินเกลือ'],
    ],
  },
  {
    group: 'Igneous (หินอัคนี)',
    items: [
      ['Basalt', 'หินบะซอลต์'],
      ['Andesite', 'หินแอนดีไซต์'],
      ['Rhyolite', 'หินไรโอไลต์'],
      ['Tuff', 'หินทัฟฟ์'],
      ['Granite', 'หินแกรนิต'],
      ['Diorite', 'หินไดออไรต์'],
      ['Gabbro', 'หินแกบโบร'],
    ],
  },
  {
    group: 'Metamorphic (หินแปร)',
    items: [
      ['Slate', 'หินชนวน'],
      ['Phyllite', 'หินฟิลไลต์'],
      ['Schist', 'หินชีสต์'],
      ['Gneiss', 'หินไนส์'],
      ['Quartzite', 'หินควอตซ์ไซต์'],
      ['Marble', 'หินอ่อน'],
    ],
  },
  {
    group: 'Surficial (วัสดุผิวดิน)',
    items: [
      ['Laterite', 'ศิลาแลง'],
      ['Alluvium', 'ตะกอนน้ำพา'],
      ['Colluvium', 'ตะกอนเชิงเขา'],
      ['Soil', 'ดิน'],
    ],
  },
];

// Weathering grades (ISRM / BS 5930)
export const WEATHERING = [
  ['W1', 'Fresh', 'สด ไม่ผุ'],
  ['W2', 'Slightly weathered', 'ผุเล็กน้อย'],
  ['W3', 'Moderately weathered', 'ผุปานกลาง'],
  ['W4', 'Highly weathered', 'ผุมาก'],
  ['W5', 'Completely weathered', 'ผุทั้งหมด'],
  ['W6', 'Residual soil', 'ดินเกิดกับที่'],
];

export const STRUCTURE_TYPES = [
  ['Bedding', 'แนวชั้นหิน'],
  ['Joint', 'รอยแตก'],
  ['Fault', 'รอยเลื่อน'],
  ['Foliation', 'ริ้วขนาน'],
  ['Cleavage', 'แนวแตกเรียบ'],
  ['Vein', 'สายแร่'],
  ['Contact', 'รอยสัมผัส'],
  ['Other', 'อื่น ๆ'],
];

export const COLORS = [
  'Light grey', 'Dark grey', 'Greenish grey', 'Bluish grey',
  'Reddish brown', 'Brown', 'Yellowish brown', 'Red', 'Maroon', 'Purple',
  'White', 'Buff', 'Black',
];

const LITH = new Map();
for (const g of LITHOLOGY) for (const [en, th] of g.items) LITH.set(en, { en, th, group: g.group });

export const lithInfo = (v) => LITH.get(v) || null;

/** Lithology as written in exports and lists (handles "Other"). */
export const lithName = (st) => (st.lithology === 'Other' ? (st.lithologyOther || '').trim() || 'Other' : st.lithology || '');

export function weatheringLabel(code) {
  const w = WEATHERING.find((x) => x[0] === code);
  return w ? `${w[0]} ${w[1]}` : '';
}
