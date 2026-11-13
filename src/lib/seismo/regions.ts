export type Bbox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

export type Region = {
  id: string;
  name: string;
  note: string;
  bbox: Bbox;
};

export const REGIONS: Region[] = [
  {
    id: "taiwan",
    name: "台灣本島",
    note: "含近岸，不含琉球海溝主軸",
    bbox: { minLat: 21.8, minLon: 120, maxLat: 25.4, maxLon: 122.1 },
  },
  {
    id: "southwest",
    name: "西南台灣",
    note: "高屏平原與屏東外海",
    bbox: { minLat: 21.6, minLon: 119.2, maxLat: 23.4, maxLon: 120.8 },
  },
  {
    id: "huatung",
    name: "花東",
    note: "縱谷與東部近海",
    bbox: { minLat: 22.6, minLon: 120.9, maxLat: 24.6, maxLon: 122.35 },
  },
  {
    id: "ryukyu",
    name: "琉球弧",
    note: "與那國到奄美",
    bbox: { minLat: 23.6, minLon: 122.3, maxLat: 29.4, maxLon: 130.2 },
  },
  {
    id: "nankai",
    name: "南海海槽",
    note: "四國外海到遠州灘",
    bbox: { minLat: 31.2, minLon: 132, maxLat: 35.2, maxLon: 138.8 },
  },
  {
    id: "kyushu",
    name: "九州",
    note: "別府–島原到日向灘",
    bbox: { minLat: 31, minLon: 129.2, maxLat: 34.2, maxLon: 132.4 },
  },
  {
    id: "tohoku",
    name: "東日本外海",
    note: "含 2011 東北震源區",
    bbox: { minLat: 35.5, minLon: 140, maxLat: 41.5, maxLon: 145.5 },
  },
  {
    id: "all",
    name: "全觀測窗",
    note: "15–48°N，118–150°E",
    bbox: { minLat: 15, minLon: 118, maxLat: 48, maxLon: 150 },
  },
];

export function regionById(id: string): Region {
  return REGIONS.find((region) => region.id === id) ?? REGIONS[0];
}
