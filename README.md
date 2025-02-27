# Protection Area Addon for Minecraft Bedrock

## คำอธิบาย (Description)
Protection Area Addon เป็นส่วนเสริมสำหรับ Minecraft Bedrock ที่ช่วยให้ผู้เล่นสามารถสร้างโซนป้องกัน เพื่อป้องกันการถูกทำลายหรือรบกวนจากผู้เล่นอื่น โดยระบบมีการจัดการสิทธิ์และบันทึกการบุกรุก

## โครงสร้างไฟล์ (File Structure)
```
main.js
├── dataManager.js
├── zoneUtils.js
├── menuManager.js
│   ├── friendManager.js
│   ├── zoneManager.js
│   └── adminManager.js
├── friendManager.js
│   ├── zoneManager.js
│   └── menuManager.js
├── zoneManager.js
│   └── dataManager.js
├── adminManager.js
│   ├── zoneManager.js
│   ├── intrusionManager.js
│   └── menuManager.js
├── intrusionManager.js
│   ├── adminManager.js
│   └── dataManager.js
└── gameLoops.js
    ├── zoneUtils.js
    └── intrusionManager.js
```

## รายละเอียดไฟล์และการเชื่อมต่อ (File Details & Dependencies)

### 1. `main.js`
- เป็นไฟล์หลักที่เริ่มต้นการทำงานของระบบ
- โหลดข้อมูลจาก `dataManager.js` และรอคำสั่งจากผู้เล่น
- เชื่อมต่อกับ `menuManager.js` เพื่อนำทางผู้เล่นไปยังเมนูต่างๆ

### 2. `dataManager.js`
- ทำหน้าที่บันทึกและโหลดข้อมูลโซนจาก `Minecraft world properties`
- เชื่อมต่อกับ `main.js`, `zoneManager.js`, `intrusionManager.js`

### 3. `zoneUtils.js`
- ฟังก์ชันช่วยเหลือเกี่ยวกับโซน เช่น คำนวณพิกัด, ตรวจสอบสิทธิ์
- ถูกเรียกใช้โดย `main.js`, `gameLoops.js`, `zoneManager.js`, `intrusionManager.js`

### 4. `menuManager.js`
- จัดการเมนูหลักของผู้เล่น
- เชื่อมต่อกับ `zoneManager.js`, `friendManager.js`, `adminManager.js`

### 5. `friendManager.js`
- จัดการระบบเพื่อนและการตั้งค่าโซน
- เชื่อมต่อกับ `zoneManager.js`, `menuManager.js`, `dataManager.js`

### 6. `zoneManager.js`
- สร้าง, ลบ และจัดการโซนป้องกัน
- เชื่อมต่อกับ `main.js`, `menuManager.js`, `dataManager.js`

### 7. `adminManager.js`
- จัดการเมนูแอดมินและสิทธิ์พิเศษ
- เชื่อมต่อกับ `zoneManager.js`, `intrusionManager.js`, `menuManager.js`

### 8. `intrusionManager.js`
- ตรวจจับและบันทึกการบุกรุกในโซน
- เชื่อมต่อกับ `adminManager.js`, `dataManager.js`, `gameLoops.js`

### 9. `gameLoops.js`
- รันลูปเกมและตรวจสอบเหตุการณ์ต่างๆ
- เชื่อมต่อกับ `main.js`, `zoneUtils.js`, `intrusionManager.js`

## การทำงานของระบบ (System Workflow)
1. เมื่อเกมเริ่มต้น `main.js` โหลดข้อมูลโซนจาก `dataManager.js`
2. หากผู้เล่นใช้เข็มทิศ ระบบจะเปิด `menuManager.js`
3. การกระทำที่เลือกจากเมนูจะถูกส่งไปยัง `zoneManager.js`, `friendManager.js` หรือ `adminManager.js`
4. `zoneManager.js` และ `friendManager.js` อัปเดตข้อมูลและบันทึกไปยัง `dataManager.js`
5. `gameLoops.js` ตรวจสอบการบุกรุกและแจ้งเตือนผ่าน `intrusionManager.js`
6. แอดมินสามารถดูบันทึกการบุกรุกได้จาก `adminManager.js`

## วิธีติดตั้ง (Installation Guide)
1. ดาวน์โหลดไฟล์ Addon และแตกไฟล์ลงในโฟลเดอร์ `behavior_packs`
2. เปิด Minecraft และนำ Addon ไปใช้กับโลกของคุณ
3. ใช้เข็มทิศเพื่อตั้งค่าโซนป้องกัน

---

# Protection Area Addon for Minecraft Bedrock (English Version)

## Description
Protection Area Addon is an addon for Minecraft Bedrock that allows players to create protected zones to prevent destruction or interference from others. The system manages permissions and logs intrusions.

## File Structure
```
main.js
├── dataManager.js
├── zoneUtils.js
├── menuManager.js
│   ├── friendManager.js
│   ├── zoneManager.js
│   └── adminManager.js
├── friendManager.js
│   ├── zoneManager.js
│   └── menuManager.js
├── zoneManager.js
│   └── dataManager.js
├── adminManager.js
│   ├── zoneManager.js
│   ├── intrusionManager.js
│   └── menuManager.js
├── intrusionManager.js
│   ├── adminManager.js
│   └── dataManager.js
└── gameLoops.js
    ├── zoneUtils.js
    └── intrusionManager.js
```

## File Details & Dependencies

### 1. `main.js`
- The core file that initializes the system.
- Loads data from `dataManager.js` and waits for player actions.
- Connects to `menuManager.js` for navigation.

### 2. `dataManager.js`
- Manages saving and loading zone data from `Minecraft world properties`.
- Connected to `main.js`, `zoneManager.js`, `intrusionManager.js`.

### 3. `zoneUtils.js`
- Utility functions for zone calculations and access control.
- Used by `main.js`, `gameLoops.js`, `zoneManager.js`, `intrusionManager.js`.

### 4. `menuManager.js`
- Handles the main menu for players.
- Connected to `zoneManager.js`, `friendManager.js`, `adminManager.js`.

### 5. `friendManager.js`
- Manages friend settings and access to protected zones.
- Connected to `zoneManager.js`, `menuManager.js`, `dataManager.js`.

### 6. `zoneManager.js`
- Creates, deletes, and manages protection zones.
- Connected to `main.js`, `menuManager.js`, `dataManager.js`.

### 7. `adminManager.js`
- Handles admin menus and special permissions.
- Connected to `zoneManager.js`, `intrusionManager.js`, `menuManager.js`.

### 8. `intrusionManager.js`
- Detects and logs intrusions in protected zones.
- Connected to `adminManager.js`, `dataManager.js`, `gameLoops.js`.

### 9. `gameLoops.js`
- Runs game loops and checks for events.
- Connected to `main.js`, `zoneUtils.js`, `intrusionManager.js`.

## System Workflow
1. On game start, `main.js` loads zone data from `dataManager.js`.
2. If a player uses a compass, `menuManager.js` opens.
3. Selected actions are processed in `zoneManager.js`, `friendManager.js`, or `adminManager.js`.
4. `zoneManager.js` and `friendManager.js` update data via `dataManager.js`.
5. `gameLoops.js` monitors intrusions and reports them to `intrusionManager.js`.
6. Admins can review intrusion logs via `adminManager.js`.

## Installation Guide
1. Download and extract the addon into the `behavior_packs` folder.
2. Open Minecraft and apply the addon to your world.
3. Use the compass to configure protection zones.
