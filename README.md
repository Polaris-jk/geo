# GEO — สมุดสนามดิจิทัลของนักธรณี (ต้นแบบ v0.1)

เว็บแอป (PWA) สำหรับออกภาคสนาม ใช้ได้ทั้ง iPhone และ Android ไม่มีค่าใช้จ่าย ไม่ต้อง login
ข้อมูลทั้งหมดเก็บในเครื่องผู้ใช้ และใช้งานได้แม้ไม่มีสัญญาณ

## มีอะไรในเวอร์ชันนี้

| หน้า | ทำอะไรได้ |
|---|---|
| **GPS** | Lat/Long (Decimal หรือ DMS), UTM พร้อมโซนและแถบ, ความสูงจากระดับทะเล, ความแม่นยำพร้อมแถบสัญญาณ, Bearing จากเข็มทิศ, แตะแถวพิกัดเพื่อคัดลอก |
| **New Station** | ปักพิกัดอัตโนมัติ, เฉลี่ยพิกัด 10 วินาที, ชนิดหิน (อังกฤษ/ไทย), Weathering W1–W6, สี, Strike / Dip / Dip direction ตาม right-hand rule (กรอกค่าหนึ่ง อีกค่าคำนวณให้), วัดได้หลายโครงสร้างต่อ Station, Sample ID อัตโนมัติ เช่น `GEO-024-01`, รูปภาพ, Notes |
| **Stations** | รายการ Station พร้อมสัญลักษณ์ strike/dip, จำนวนตัวอย่างและรูป, ปุ่ม Export |
| **Map** | ทุก Station แสดงเป็นสัญลักษณ์ strike/dip แบบแผนที่ธรณี พร้อมตำแหน่งปัจจุบัน |
| **Settings** | ชื่อโปรเจกต์, ผู้เก็บข้อมูล, prefix ของรหัส, ล็อก UTM โซน 47/48, magnetic declination, โหมดมืด/กลางแดด, สถานะพื้นที่เก็บข้อมูล |

ทุกการแก้ไขในหน้า Station บันทึกลงเครื่องทันที แม้แบตหมดหรือแอปปิดกลางคัน ข้อมูลที่กรอกแล้วก็ไม่หาย

### Export

- **Project ZIP** (แนะนำ): `stations.geojson`, `stations.csv`, `structures.geojson`, `structures.csv`, `samples.csv`, `photos/ST024_01.jpg …`, `photos.csv`, `project.json` (สำรองทั้งโปรเจกต์)
- Stations GeoJSON, Stations CSV, Structures GeoJSON แยกไฟล์

CSV เป็น UTF-8 แบบมี BOM ภาษาไทยจึงแสดงถูกต้องใน Excel

### ประหยัดแบต

- GPS ทำงานเฉพาะหน้า GPS, Map และตอนกำลังปักพิกัด Station ออกจากหน้าหรือล็อกจอแล้ว GPS หยุดทันที
- เข็มทิศอ่านเซนเซอร์เฉพาะตอนอยู่หน้า GPS
- โหมดมืดใช้พื้นดำสนิท จอ OLED จะปิดพิกเซลส่วนนั้น
- โหมด Sun (ปุ่มรูปดวงอาทิตย์มุมขวาบน) สำหรับอ่านกลางแดดจัด

## ทดลองบนคอมพิวเตอร์

```bash
cd geo
python -m http.server 8000
```

เปิด http://localhost:8000 (GPS ของคอมอาจไม่แม่น และคอมส่วนใหญ่ไม่มีเข็มทิศ)

## ขึ้น GitHub Pages ฟรี เพื่อใช้บนมือถือ

GPS และเซนเซอร์ใช้ได้เฉพาะเว็บที่เปิดผ่าน https ซึ่ง GitHub Pages ให้มาฟรี

1. สร้าง repository ใหม่ใน GitHub ชื่อ `geo` แบบ **Public**
2. กด **Add file → Upload files** แล้วลากไฟล์และโฟลเดอร์ทั้งหมดในโฟลเดอร์ `geo` ขึ้นไป (`index.html` ต้องอยู่ชั้นบนสุด) แล้วกด **Commit changes**
3. ไปที่ **Settings → Pages** ตั้ง Source เป็น **Deploy from a branch**, Branch เป็น `main` และ `/ (root)` แล้วกด **Save**
4. รอ 1–2 นาที จะได้ลิงก์ `https://<ชื่อผู้ใช้>.github.io/geo/` ส่งลิงก์นี้ให้เพื่อนได้เลย

## ติดตั้งบนมือถือ

**iPhone**
1. เปิดลิงก์ใน **Safari** (ต้องเป็น Safari)
2. แตะ **Share** แล้วเลือก **Add to Home Screen**
3. เปิด GEO จากไอคอนบนหน้าจอโฮม
4. แตะ **เปิดเข็มทิศ** ในหน้า GPS (iPhone ให้กดอนุญาตทุกครั้งที่เปิดแอปใหม่)

**Android**
1. เปิดลิงก์ใน **Chrome**
2. แตะเมนู **⋮** แล้วเลือก **Install app** หรือ **Add to Home screen**

## ข้อควรรู้ก่อนออกภาคสนาม

- **ข้อมูลอยู่ในเครื่องเท่านั้น** ให้ Export เป็น Project ZIP เก็บไว้หลังออกสนามทุกวัน
- **บน iPhone ถ้าลบไอคอน GEO ออกจากหน้าจอโฮม ข้อมูลในแอปจะถูกลบด้วย** และถ้าใช้ผ่าน Safari โดยไม่ติดตั้ง ข้อมูลอาจถูกล้างเมื่อไม่ได้เปิดเกิน 7 วัน
- **แผนที่ offline:** ก่อนออกสนาม เปิดแผนที่บริเวณที่จะไปขณะมีเน็ต เลื่อนดูและซูมระดับที่ต้องใช้ ส่วนที่เคยเปิดจะถูกจำไว้ใช้ตอนไม่มีสัญญาณ
- **Elevation:** iPhone ให้ความสูงจากระดับทะเล ส่วน Android ให้ความสูงจากทรงรี WGS84 ซึ่งในไทยต่างกันราว 10–40 m (ขอนแก่นราว 30 m) GEO แปลงค่าของ Android ด้วยแบบจำลอง geoid EGM96 ให้เป็นระดับทะเลแล้ว แต่ความสูงจาก GPS ยังคลาดเคลื่อนได้หลายเมตรอยู่ดี
- **เข็มทิศมือถือ:** อยู่ห่างค้อน แม่เหล็ก และหินที่มีแร่แม่เหล็ก ถ้าค่ากระโดด ให้หมุนโทรศัพท์เป็นเลข 8 เพื่อปรับเทียบ ค่าที่สำคัญควรยืนยันด้วย Brunton
- ในเวอร์ชันนี้ Strike/Dip ยัง **กรอกเอง** จากเข็มทิศธรณี เครื่องมือวัดด้วยเซนเซอร์มือถือจะมาในรอบถัดไป

## นำเข้า QGIS

- **GeoJSON:** ลาก `stations.geojson` หรือ `structures.geojson` เข้า QGIS ได้ทันที (EPSG:4326)
- **CSV:** Layer → Add Layer → Add Delimited Text Layer → X field = `lon`, Y field = `lat`, CRS = EPSG:4326
  หรือใช้ X = `utm_e`, Y = `utm_n` กับ CRS ตามคอลัมน์ `utm_epsg` (เช่น EPSG:32648 สำหรับโซน 48N)
- **สัญลักษณ์ strike:** เปิด `structures.geojson` → Symbology → Simple Marker → Shape: Line → Rotation แบบ data-defined เป็นฟิลด์ `strike` แล้วใส่ Label เป็นฟิลด์ `dip` (ไฟล์ style สำเร็จรูปจะมาในรอบถัดไป)

## โครงสร้างไฟล์

```
geo/
├── index.html              หน้าแอป
├── manifest.webmanifest    ข้อมูลสำหรับติดตั้งเป็นแอป
├── sw.js                   ทำให้แอปเปิดได้แบบ offline และจำแผนที่ที่เคยเปิด
├── css/                    สีและหน้าตา (app.css), ฟอนต์ (fonts.css)
├── js/
│   ├── app.js              เปิดแอปและสลับหน้า
│   ├── gps.js              GPS แบบประหยัดแบต, เฉลี่ยพิกัด, แปลงความสูง
│   ├── compass.js          เข็มทิศจากเซนเซอร์
│   ├── utm.js              แปลงพิกัดเป็น UTM (ตรงกับ PROJ/QGIS)
│   ├── geoid-th.js         ตาราง geoid EGM96 ของประเทศไทย
│   ├── store.js, db.js     เก็บข้อมูลในเครื่อง (IndexedDB)
│   ├── export.js           สร้างไฟล์ CSV, GeoJSON, ZIP
│   ├── vocab.js            รายชื่อหิน โครงสร้าง ระดับการผุ สี ← แก้ตรงนี้ได้
│   └── views/              แต่ละหน้าจอ
├── vendor/                 Leaflet (แผนที่), fflate (ZIP)
├── fonts/                  IBM Plex Sans Thai, IBM Plex Mono
└── icons/                  ไอคอนแอป
```

**เมื่อแก้ไฟล์ใดแล้วอัปโหลดขึ้น GitHub ใหม่** ให้เปลี่ยน `VERSION` ในบรรทัดแรก ๆ ของ `sw.js` ด้วย (เช่น `geo-v0.1.1`) มือถือของทุกคนจึงจะโหลดเวอร์ชันใหม่ ถ้าเพิ่มไฟล์ใหม่ ให้เพิ่มชื่อไฟล์ในรายการ `SHELL` ใน `sw.js` ด้วย

## รอบถัดไป

1. วัด Strike/Dip ด้วยเซนเซอร์ (วางมือถือบนระนาบชั้นหิน)
2. Smart Photo: แถบข้อมูลพิกัด/Station/strike-dip ต่อท้ายรูป
3. Track: PWA ลากเส้นเชื่อม Station ตามเวลา, APK บันทึกเส้นทางตอนปิดจอ
4. ห่อเป็น APK สำหรับ Android ด้วย Capacitor
5. ดาวน์โหลดแผนที่ offline เป็นพื้นที่, ไฟล์ style สำหรับ QGIS, KML/GPX, Field Report

## สัญญาอนุญาตของส่วนประกอบ

- Leaflet: BSD-2-Clause (`vendor/leaflet/LICENSE`)
- fflate: MIT (`vendor/fflate.LICENSE`)
- IBM Plex Sans Thai / IBM Plex Mono: SIL Open Font License 1.1 (`fonts/OFL-LICENSE.txt`)
- ข้อมูลแผนที่ © OpenStreetMap contributors ใช้ tile server ของ OpenStreetMap ได้สำหรับการใช้งานเบา ๆ ในชั้นเรียน ถ้ามีผู้ใช้จำนวนมากควรเปลี่ยนแหล่ง tile
- ตาราง geoid คำนวณจากแบบจำลอง EGM96
