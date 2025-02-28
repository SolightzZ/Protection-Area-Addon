# 🚧 Protection Area Addon - ระบบเขตป้องกันสำหรับ Minecraft Bedrock Edition

Protection Area Addon เป็นแอดออนที่พัฒนาด้วย JavaScript สำหรับ Minecraft Bedrock Edition โดยใช้ @minecraft/server และ @minecraft/server-ui API เพื่อสร้างระบบเขตป้องกันส่วนตัวในโลก Minecraft ระบบนี้ออกแบบมาเพื่อให้ผู้เล่นสามารถกำหนดและจัดการพื้นที่ส่วนตัว ป้องกันการบุกรุกจากผู้เล่นอื่น และมอบเครื่องมือให้แอดมินดูแลโลกได้อย่างมีประสิทธิภาพ 🔒🌍

---

## 📊 สถิติการเข้าชม

![GitHub release (latest by date)](https://img.shields.io/github/v/release/SolightzZ/Protection-Area-Addon)
![GitHub all releases](https://img.shields.io/github/downloads/SolightzZ/Protection-Area-Addon/total)
![GitHub License](https://img.shields.io/github/license/SolightzZ/Protection-Area-Addon)
[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2FSolightzZ%2FProtection-Area-Addon&count_bg=%2369D01A&title_bg=%23555555&icon=ello.svg&icon_color=%23E7E7E7&title=hits&edge_flat=false)](https://hits.seeyoufarm.com)


## 📜 ฟีเจอร์หลัก

### 🚫 การป้องกันการบุกรุก

- ป้องกันผู้เล่นที่ไม่มีสิทธิ์เข้าถึงเขตด้วยการผลักออกและบันทึกการบุกรุก
- จำกัดการวาง/ขุดบล็อก และการใช้ไอเทมในเขตที่ป้องกัน

### 👥 การจัดการสิทธิ์ผู้เล่น

- เจ้าของเขตสามารถเพิ่ม/ลบเพื่อนที่ได้รับอนุญาตให้เข้าถึงเขตได้

### 🔥 การสแกนและลบไฟ

- ตรวจจับและลบไฟในเขตโดยอัตโนมัติเพื่อป้องกันความเสียหาย

### ✨ การแสดงขอบเขต

- แสดงขอบเขตของเขตด้วยอนุภาค (particles) เพื่อให้มองเห็นได้ชัดเจน

### 🛠️ เมนูสำหรับแอดมิน

- เครื่องมือสำหรับแอดมิน เช่น ดูข้อมูลเขต ลบเขต และจัดการประวัติการบุกรุก

### 🏛️ โหมดเยี่ยมชม

- อนุญาตให้ผู้เล่นที่ไม่มีสิทธิ์อยู่ในเขตได้ในโหมดเยี่ยมชมโดยไม่ถูกผลักออก

### ⚔️ การป้องกันเอนทิตี้

- จำกัดการเกิดของมอนสเตอร์บางประเภทและลบเอนทิตี้ที่เป็นอันตรายในเขต

---

## ⚙️ โครงสร้างโค้ดและการทำงาน

```
main.js
├── 📍 Zone Utilities
│   ├── formatDateTime() - แปลงวันที่และเวลาเป็นรูปแบบ UTC+7
│   ├── isInsideZone() - ตรวจสอบว่าตำแหน่งอยู่ในเขตใดบ้าง
│   ├── canAccess() - ตรวจสอบสิทธิ์การเข้าถึงเขต
│   └── pushOutOfZone() - ผลักเอนทิตี้ออกจากเขต
│
├── 💾 Data Management
│   ├── protectionZones (Map) - เก็บข้อมูลเขตป้องกัน
│   ├── allowedPlayers (Map) - เก็บรายชื่อผู้เล่นที่ได้รับอนุญาต
│   ├── intrusionLog (Map) - บันทึกการบุกรุก
│   ├── activeBorders (Map) - เก็บข้อมูลการแสดงขอบเขต
│   ├── saveZones() - บันทึกข้อมูลลง Dynamic Properties
│   └── loadZones() - โหลดข้อมูลจาก Dynamic Properties
│
├── 🌍 World Initialization
│   └── afterEvents.worldInitialize - เริ่มต้นระบบเมื่อโลกโหลด
│
├── 🧭 Main Menu
│   └── showMainMenu() - แสดงเมนูหลักเมื่อใช้เข็มทิศ
│
├── ⚙️ Settings Menu
│   ├── showSettings() - เมนูตั้งค่าเขต
│   ├── addFriend() - เพิ่มเพื่อน
│   ├── removeFriend() - ลบเพื่อน
│   ├── toggleBounceNonPlayers() - เปิด/ปิดการผลักสิ่งที่ไม่ใช่ผู้เล่น
│   └── toggleVisitMode() - เปิด/ปิดโหมดเยี่ยมชม
│
├── 🏰 Zone Creation & Deletion
│   ├── isWithinRequiredDistance() - ตรวจสอบระยะห่างจากเขตอื่น
│   ├── createZone() - สร้างเขตใหม่
│   └── deleteZone() - ลบเขต
│
├── 🌐 Zone Border
│   └── showZoneBorder() - แสดงขอบเขตด้วยอนุภาค
│
├── 🔄 Game Loops
│   ├── system.runInterval - สแกนไฟและจัดการเอนทิตี้ทุก 20 ticks
│   └── checkEntitiesInZone() - ตรวจสอบและจัดการเอนทิตี้ในเขต
│
├── ⚔️ Event Handlers
│   ├── entityHitEntity - ป้องกันการโจมตีในเขต
│   ├── entityHurt - ทำให้ผู้เล่นในเขตอมตะ
│   ├── entitySpawn - จำกัดการเกิดเอนทิตี้
│   ├── playerBreakBlock - บล็อกการขุด
│   ├── playerPlaceBlock - บล็อกการวาง
│   ├── playerInteractWithBlock - บล็อกการโต้ตอบบล็อก
│   ├── itemUse - บล็อกการใช้ไอเทม
│   ├── itemUseOn - บล็อกการใช้ไอเทมกับบล็อก
│   └── chatSend - บล็อกคำสั่งที่เกี่ยวข้องกับ TNT
│
├── 🔐 Protection Toggle
│   └── toggleProtection() - เปิด/ปิดการป้องกันเขต
│
├── 📜 Intrusion Logging
│   └── logIntrusion() - บันทึกการบุกรุก
│
└── 👑 Admin Menu
    ├── showAdminMenu() - เมนูแอดมิน
    ├── showAdminZoneInfo() - ดูข้อมูลเขต
    ├── deleteAdminZone() - ลบเขต
    ├── removePlayerFromZone() - ลบผู้เล่นออกจากเขต
    ├── showIntrusionLog() - ดูประวัติการบุกรุก
    └── manageIntrusionLog() - จัดการประวัติการบุกรุก
```

---

## 🛠️ การติดตั้งและใช้งาน

1. วางไฟล์ `main.js` ในโฟลเดอร์ `scripts` ของ Behavior Pack
2. เพิ่มใน `manifest.json`:

```json
"modules": [
    {
        "type": "script",
        "language": "javascript",
        "entry": "scripts/main.js",
        "uuid": "xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
],
"dependencies": [
    {"module_name": "@minecraft/server", "version": "1.17.0"},
    {"module_name": "@minecraft/server-ui", "version": "1.3.0"}
]
```

3. เปิดใช้งานในโลก Minecraft
4. ใช้เข็มทิศ (`minecraft:compass`) เพื่อเปิดเมนูหลัก

---

## 🔜 แผนการพัฒนาในอนาคต

- รองรับ หลายมิติ (Nether, End)
- อนุญาตให้มี หลายเขตต่อผู้เล่น
- ปรับปรุงการสแกนไฟให้เร็วและครอบคลุมขึ้น
- เพิ่มระบบแจ้งเตือนผ่าน UI
