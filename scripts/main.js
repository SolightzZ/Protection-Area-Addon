import * as Minecraft from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const protectionZones = new Map();
const allowedPlayers = new Map();
const activeBorders = new Map();
const intrusionLog = new Map();
const SAVE_KEY = "protectionData";
const fireCheckQueue = [];
let scanProgress = new Map();

function formatDateTime(date) {
  const localOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const utc7OffsetMs = 7 * 60 * 60 * 1000;
  const adjustedTime = date.getTime() - localOffsetMs + utc7OffsetMs;
  const utcDate = new Date(adjustedTime);

  const month = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utcDate.getUTCDate()).padStart(2, "0");
  const year = utcDate.getUTCFullYear();
  const hours = String(utcDate.getUTCHours()).padStart(2, "0");
  const minutes = String(utcDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(utcDate.getUTCSeconds()).padStart(2, "0");
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
}

function saveZones() {
  const data = {
    zones: Array.from(protectionZones.entries()),
    permissions: Array.from(allowedPlayers.entries()),
    intrusions: Array.from(intrusionLog.entries()),
  };
  Minecraft.world.setDynamicProperty(SAVE_KEY, JSON.stringify(data));
}

function loadZones() {
  const savedData = Minecraft.world.getDynamicProperty(SAVE_KEY);
  if (savedData && typeof savedData === "string") {
    try {
      const parsedData = JSON.parse(savedData);
      parsedData.zones.forEach(([key, value]) => protectionZones.set(key, value));
      parsedData.permissions.forEach(([key, value]) => allowedPlayers.set(key, value));
      parsedData.intrusions?.forEach(([key, value]) => intrusionLog.set(key, value));
    } catch (e) {
      console.error("Error parsing saved data: " + (e instanceof Error ? e.message : String(e)));
    }
  }
}

loadZones();

console.warn(formatDateTime(new Date()));
Minecraft.world.afterEvents.worldInitialize.subscribe(() => {
  for (const player of Minecraft.world.getPlayers()) {
    console.warn(`Player ${player.name} is online`);
  }
});

/*--------------------------------
 📍 [Zone Utilities] 
-----------------------------------*/
function isInsideZone(location) {
  if (!location || typeof location.x !== "number") return []; // ป้องกัน error ถ้า location ไม่สมบูรณ์
  const zonesFound = [];
  for (const [, zoneData] of protectionZones) {
    const { start, end, owner } = zoneData || {};
    if (!start || !end || !owner) continue; // ป้องกัน error ถ้า zoneData ไม่สมบูรณ์
    if (
      location.x >= start.x &&
      location.x <= end.x &&
      location.y >= start.y &&
      location.y <= end.y &&
      location.z >= start.z &&
      location.z <= end.z
    ) {
      zonesFound.push({ owner, zone: zoneData });
    }
  }
  return zonesFound;
}

function canAccess(player, zoneOwner) {
  return player.name === zoneOwner || (allowedPlayers.get(zoneOwner) || []).includes(player.name);
}

function pushOutOfZone(entity, zone) {
  const centerX = (zone.start.x + zone.end.x) / 2;
  const centerZ = (zone.start.z + zone.end.z) / 2;
  const dx = entity.location.x - centerX;
  const dz = entity.location.z - centerZ;
  const distance = Math.sqrt(dx * dx + dz * dz);

  if (distance > 0) {
    const force = 10;
    entity.applyKnockback(dx / distance, dz / distance, force, 0.1);
    return true;
  }
  return false;
}

/*--------------------------------
 🧭 [Main Menu] 
-----------------------------------*/
Minecraft.world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  if (event.itemStack?.typeId === "minecraft:compass") showMainMenu(player);
});

function showMainMenu(player) {
  const zone = protectionZones.get(player.name);
  const protectionStatus = zone && zone.protectionEnabled ? "§aเปิด" : "§cปิด";
  const menu = new ActionFormData()
    .title("จัดการเขตป้องกัน")
    .body("เลือกสิ่งที่ต้องการทำ\n§7เวลาปัจจุบัน: " + formatDateTime(new Date()))
    .button("สร้างเขตใหม่")
    .button("ตั้งค่า")
    .button(`ป้องกันผู้เล่น ${protectionStatus}`)
    .button("ลบผู้เล่นในเขต");

  if (player.hasTag("admin")) {
    menu.button("เมนูแอดมิน");
  }

  menu.show(player).then((response) => {
    if (response.canceled) return;
    switch (response.selection) {
      case 0:
        createZone(player);
        break;
      case 1:
        showSettings(player);
        break;
      case 2:
        toggleProtection(player);
        break;
      case 3:
        removePlayerFromZone(player, false);
        break;
      case 4:
        if (player.hasTag("admin")) {
          showAdminMenu(player);
        }
        break;
    }
  });
}

/*--------------------------------
 ⚙️ [Settings Menu] 
-----------------------------------*/
function showSettings(player) {
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    return;
  }

  const showBorderStatus = activeBorders.has(player.name) ? "§aเปิด" : "§cปิด";
  const bounceStatus = zone.bounceNonPlayers ? "§aเปิด" : "§cปิด";
  const visitStatus = zone.visitMode ? "§aเปิด" : "§cปิด";

  const settingsMenu = new ActionFormData()
    .title("ตั้งค่าเขตป้องกัน")
    .body("เลือกการตั้งค่า\n§7เวลาปัจจุบัน: " + formatDateTime(new Date()))
    .button("เพิ่มเพื่อน")
    .button("ลบเพื่อน")
    .button(`แสดงขอบเขต ${showBorderStatus}`)
    .button(`กระเด็นหากไม่ใช่ผู้เล่น ${bounceStatus}`)
    .button("ลบเขต")
    .button(`โหมดเยี่ยมชม ${visitStatus}`)
    .button("กลับไปเมนูหลัก");

  settingsMenu.show(player).then((response) => {
    if (response.canceled) return;
    switch (response.selection) {
      case 0:
        addFriend(player);
        break;
      case 1:
        removeFriend(player);
        break;
      case 2:
        showZoneBorder(player);
        break;
      case 3:
        toggleBounceNonPlayers(player);
        break;
      case 4:
        deleteZone(player);
        break;
      case 5:
        toggleVisitMode(player);
        break;
      case 6:
        showMainMenu(player);
        break;
    }
  });
}

/*--------------------------------
 👥 [Friend Management] 
-----------------------------------*/
function addFriend(player) {
  const allPlayers = Minecraft.world.getPlayers();
  const friendNames = allPlayers.map((p) => p.name).filter((name) => name !== player.name);
  if (friendNames.length === 0) {
    player.sendMessage("§cไม่มีใครให้เพิ่มในโลกนี้!");
    return;
  }

  const friendMenu = new ModalFormData()
    .title("เพิ่มเพื่อน")
    .dropdown("เลือกเพื่อน", friendNames, 0);
  friendMenu.show(player).then((response) => {
    if (response.canceled || !response.formValues) return;
    const friendName = friendNames[Number(response.formValues[0])];
    const permissions = allowedPlayers.get(player.name) || [];
    if (!permissions.includes(friendName)) {
      permissions.push(friendName);
      allowedPlayers.set(player.name, permissions);
      saveZones();
      player.sendMessage(`§aเพิ่ม ${friendName} เป็นผู้มีสิทธิ์แล้ว!`);
      console.warn(`Added ${friendName} to ${player.name}'s allowed players: ${permissions}`);
      const friend = Minecraft.world.getPlayers().find((p) => p.name === friendName);
      if (friend) {
        friend.sendMessage(`§aคุณได้รับการเพิ่มเป็นผู้มีสิทธิ์ในเขตของ ${player.name} แล้ว!`);
      }
    } else {
      player.sendMessage(`§e${friendName} เป็นผู้มีสิทธิ์อยู่แล้ว!`);
    }
  });
}

function removeFriend(player) {
  const permissions = allowedPlayers.get(player.name) || [];
  if (permissions.length === 0) {
    player.sendMessage("§cไม่มีเพื่อนให้ลบ!");
    return;
  }

  const friendMenu = new ModalFormData()
    .title("ลบเพื่อน")
    .dropdown("เลือกเพื่อนที่ต้องการลบ", permissions, 0);
  friendMenu.show(player).then((response) => {
    if (response.canceled || !response.formValues) return;
    const friendName = permissions[Number(response.formValues[0])];
    const index = permissions.indexOf(friendName);
    if (index !== -1) {
      permissions.splice(index, 1);
      allowedPlayers.set(player.name, permissions);
      saveZones();
      player.sendMessage(`§aลบ ${friendName} ออกจากผู้มีสิทธิ์แล้ว!`);
    }
  });
}

/*--------------------------------
 🔧 [Zone Settings] 
-----------------------------------*/
function toggleBounceNonPlayers(player) {
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    return;
  }

  zone.bounceNonPlayers = !zone.bounceNonPlayers;
  protectionZones.set(player.name, zone);
  saveZones();
  player.sendMessage(
    zone.bounceNonPlayers
      ? "§aเปิดการกระเด็นสำหรับสิ่งที่ไม่ใช่ผู้เล่นแล้ว!"
      : "§cปิดการกระเด็นสำหรับสิ่งที่ไม่ใช่ผู้เล่นแล้ว!"
  );
}

function toggleVisitMode(player) {
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    return;
  }

  zone.visitMode = !zone.visitMode;
  protectionZones.set(player.name, zone);
  saveZones();
  player.sendMessage(zone.visitMode ? "§aเปิดโหมดเยี่ยมชมแล้ว!" : "§cปิดโหมดเยี่ยมชมแล้ว!");
}

/*--------------------------------
 🗑️ [Zone Removal] 
-----------------------------------*/
function removePlayerFromZone(player, isAdmin = false) {
  const zone = protectionZones.get(player.name);
  const allZones = Array.from(protectionZones.keys());

  if (!isAdmin && !zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    return;
  }

  if (isAdmin && allZones.length === 0) {
    player.sendMessage("§cไม่มีเขตป้องกันในโลกนี้!");
    return;
  }

  let targetOwner = player.name;
  if (isAdmin) {
    const zoneMenu = new ActionFormData()
      .title("เลือกเขตเพื่อลบผู้เล่น")
      .body("เลือกเขตที่ต้องการลบผู้เล่น")
      .button("กลับไปเมนูแอดมิน");

    allZones.forEach((owner) => zoneMenu.button(owner));

    zoneMenu.show(player).then((response) => {
      if (response.canceled || response.selection === 0) {
        showAdminMenu(player);
        return;
      }
      targetOwner = allZones[response.selection - 1];
      proceedWithRemoval(player, targetOwner, isAdmin);
    });
  } else {
    proceedWithRemoval(player, targetOwner, isAdmin);
  }
}

function proceedWithRemoval(player, targetOwner, isAdmin) {
  const dimension = Minecraft.world.getDimension("minecraft:overworld");
  const playersInZone = dimension.getPlayers().filter((p) => {
    const zones = isInsideZone(p.location);
    return zones.some((z) => z.owner === targetOwner) && p.name !== targetOwner;
  });

  if (playersInZone.length === 0) {
    player.sendMessage(`§cไม่มีผู้เล่นอื่นในเขต${isAdmin ? `ของ ${targetOwner}` : "ของคุณ"}!`);
    return;
  }

  const removeMenu = new ActionFormData()
    .title(`ลบผู้เล่นในเขต${isAdmin ? `ของ ${targetOwner}` : ""}`)
    .body("เลือกผู้เล่นที่ต้องการลบออกจากเขต")
    .button(isAdmin ? "กลับไปเมนูแอดมิน" : "กลับไปเมนูหลัก");

  playersInZone.forEach((p) => removeMenu.button(p.name));

  removeMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      if (isAdmin) {
        showAdminMenu(player);
      } else {
        showMainMenu(player);
      }
      return;
    }

    const selectedPlayer = playersInZone[response.selection - 1];
    selectedPlayer.remove();
    player.sendMessage(
      `§aลบ ${selectedPlayer.name} ออกจากเขต${isAdmin ? `ของ ${targetOwner}` : ""} สำเร็จ!`
    );
    selectedPlayer.sendMessage(
      `§cคุณถูกลบออกจากเขตของ ${targetOwner} ${isAdmin ? "โดยแอดมิน" : ""}!`
    );
  });
}

/*--------------------------------
 👑 [Admin Menu] 
-----------------------------------*/
function showAdminMenu(player) {
  if (!player.hasTag("admin")) {
    player.sendMessage("§cคุณไม่มีสิทธิ์ใช้เมนูแอดมิน!");
    return;
  }

  const adminMenu = new ActionFormData()
    .title("เมนูแอดมิน")
    .body("เลือกสิ่งที่ต้องการทำ\n§7เวลาปัจจุบัน: " + formatDateTime(new Date()))
    .button("ดูข้อมูลเขต")
    .button("ลบเขต")
    .button("ลบผู้เล่นในเขต")
    .button("ดูรายงานการบุกรุก")
    .button("จัดการประวัติการบุกรุก")
    .button("กลับไปเมนูหลัก");

  adminMenu.show(player).then((response) => {
    if (response.canceled) return;
    switch (response.selection) {
      case 0:
        showAdminZoneInfo(player);
        break;
      case 1:
        deleteAdminZone(player);
        break;
      case 2:
        removePlayerFromZone(player, true);
        break;
      case 3:
        showIntrusionLog(player);
        break;
      case 4:
        manageIntrusionLog(player);
        break;
      case 5:
        showMainMenu(player);
        break;
    }
  });
}

function showIntrusionLog(player) {
  const allZones = Array.from(protectionZones.keys());
  if (allZones.length === 0) {
    player.sendMessage("§cไม่มีเขตป้องกันในโลกนี้!");
    return;
  }

  const zoneMenu = new ActionFormData()
    .title("เลือกเขตเพื่อดูรายงานการบุกรุก")
    .body("เลือกเขตที่ต้องการตรวจสอบ")
    .button("กลับไปเมนูแอดมิน");

  allZones.forEach((owner) => zoneMenu.button(owner));

  zoneMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      showAdminMenu(player);
      return;
    }

    const selectedOwner = allZones[response.selection - 1];
    const logs = intrusionLog.get(selectedOwner) || [];
    if (logs.length === 0) {
      player.sendMessage(`§eไม่มีบันทึกการบุกรุกในเขตของ ${selectedOwner}!`);
      return;
    }

    const logMenu = new ActionFormData()
      .title(`รายงานการบุกรุกของ ${selectedOwner}`)
      .body(`พบการบุกรุก ${logs.length} ครั้ง`)
      .button("กลับไปเมนูแอดมิน");

    logs.forEach((log, index) => {
      logMenu.button(
        `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
          log.location.z
        })`
      );
    });

    logMenu.show(player).then((response) => {
      if (response.canceled || response.selection === 0) {
        showAdminMenu(player);
      }
    });
  });
}

/*--------------------------------
 📜 [Intrusion Log Management] 
-----------------------------------*/
function manageIntrusionLog(player) {
  const allZones = Array.from(protectionZones.keys());
  if (allZones.length === 0) {
    player.sendMessage("§cไม่มีเขตป้องกันในโลกนี้!");
    return;
  }

  const zoneMenu = new ActionFormData()
    .title("เลือกเขตเพื่อจัดการประวัติ")
    .body("เลือกเขตที่ต้องการจัดการประวัติการบุกรุก")
    .button("กลับไปเมนูแอดมิน");

  allZones.forEach((owner) => zoneMenu.button(owner));

  zoneMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      showAdminMenu(player);
      return;
    }

    const selectedOwner = allZones[response.selection - 1];
    showIntrusionManagementOptions(player, selectedOwner);
  });
}

function showIntrusionManagementOptions(player, zoneOwner) {
  const logs = intrusionLog.get(zoneOwner) || [];
  const menu = new ActionFormData()
    .title(`จัดการประวัติของ ${zoneOwner}`)
    .body(`มีประวัติทั้งหมด ${logs.length} รายการ`)
    .button("ดูประวัติ")
    .button("ลบประวัติทีละรายการ")
    .button("ลบประวัติทั้งหมด")
    .button("ค้นหาด้วยชื่อผู้บุกรุก")
    .button("กลับไปเมนูแอดมิน");

  menu.show(player).then((response) => {
    if (response.canceled) return;
    switch (response.selection) {
      case 0:
        showIntrusionLog(player);
        break;
      case 1:
        deleteSingleIntrusion(player, zoneOwner);
        break;
      case 2:
        deleteAllIntrusions(player, zoneOwner);
        break;
      case 3:
        searchIntrusionByName(player, zoneOwner);
        break;
      case 4:
        showAdminMenu(player);
        break;
    }
  });
}

function deleteSingleIntrusion(player, zoneOwner) {
  const logs = intrusionLog.get(zoneOwner) || [];
  if (logs.length === 0) {
    player.sendMessage(`§eไม่มีประวัติการบุกรุกในเขตของ ${zoneOwner}!`);
    return;
  }

  const logMenu = new ActionFormData()
    .title(`ลบประวัติของ ${zoneOwner}`)
    .body("เลือกประวัติที่ต้องการลบ")
    .button("กลับไปเมนูจัดการ");

  logs.forEach((log, index) => {
    logMenu.button(
      `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
        log.location.z
      })`
    );
  });

  logMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const indexToDelete = response.selection - 1;
    logs.splice(indexToDelete, 1);
    intrusionLog.set(zoneOwner, logs);
    saveZones();
    player.sendMessage(`§aลบประวัติการบุกรุกรายการที่ ${indexToDelete + 1} สำเร็จ!`);
    showIntrusionManagementOptions(player, zoneOwner);
  });
}

function deleteAllIntrusions(player, zoneOwner) {
  const logs = intrusionLog.get(zoneOwner) || [];
  if (logs.length === 0) {
    player.sendMessage(`§eไม่มีประวัติการบุกรุกในเขตของ ${zoneOwner}!`);
    return;
  }

  const confirmMenu = new ActionFormData()
    .title("ยืนยันการลบทั้งหมด")
    .body(`คุณต้องการลบประวัติทั้งหมด ${logs.length} รายการของ ${zoneOwner} หรือไม่?`)
    .button("ใช่ ลบทั้งหมด")
    .button("ไม่ กลับไปเมนูจัดการ");

  confirmMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 1) {
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    intrusionLog.delete(zoneOwner);
    saveZones();
    player.sendMessage(`§aลบประวัติการบุกรุกทั้งหมดของ ${zoneOwner} สำเร็จ!`);
    showIntrusionManagementOptions(player, zoneOwner);
  });
}

function searchIntrusionByName(player, zoneOwner) {
  const logs = intrusionLog.get(zoneOwner) || [];
  if (logs.length === 0) {
    player.sendMessage(`§eไม่มีประวัติการบุกรุกในเขตของ ${zoneOwner}!`);
    return;
  }

  const searchMenu = new ModalFormData()
    .title("ค้นหาด้วยชื่อผู้บุกรุก")
    .textField("กรอกชื่อผู้บุกรุก (เช่น [Steve])", "เช่น [Steve]");

  searchMenu.show(player).then((response) => {
    if (response.canceled || !response.formValues) {
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const inputValue = response.formValues[0];
    let searchName = typeof inputValue === "string" ? inputValue.trim() : String(inputValue).trim();
    if (searchName.startsWith("[") && searchName.endsWith("]")) {
      searchName = searchName.slice(1, -1);
    }

    const filteredLogs = logs.filter((log) =>
      log.intruder.toLowerCase().includes(searchName.toLowerCase())
    );
    if (filteredLogs.length === 0) {
      player.sendMessage(`§eไม่พบประวัติการบุกรุกของ "${searchName}" ในเขตของ ${zoneOwner}!`);
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const resultMenu = new ActionFormData()
      .title(`ผลการค้นหา "${searchName}"`)
      .body(`พบ ${filteredLogs.length} รายการสำหรับ "${searchName}"`)
      .button("ลบรายการที่เลือก")
      .button("กลับไปเมนูจัดการ");

    filteredLogs.forEach((log, index) => {
      resultMenu.button(
        `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
          log.location.z
        })`
      );
    });

    resultMenu.show(player).then((response) => {
      if (response.canceled || response.selection === 1) {
        showIntrusionManagementOptions(player, zoneOwner);
        return;
      }

      if (response.selection === 0) {
        deleteFilteredIntrusion(player, zoneOwner, filteredLogs);
      }
    });
  });
}

function deleteFilteredIntrusion(player, zoneOwner, filteredLogs) {
  const deleteMenu = new ActionFormData()
    .title("ลบประวัติที่ค้นหา")
    .body("เลือกประวัติที่ต้องการลบ")
    .button("กลับไปเมนูค้นหา");

  filteredLogs.forEach((log, index) => {
    deleteMenu.button(
      `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
        log.location.z
      })`
    );
  });

  deleteMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const indexToDelete = response.selection - 1;
    const logToDelete = filteredLogs[indexToDelete];
    const logs = intrusionLog.get(zoneOwner);
    const globalIndex = logs.findIndex(
      (log) =>
        log.intruder === logToDelete.intruder &&
        log.timestamp === logToDelete.timestamp &&
        log.location.x === logToDelete.location.x &&
        log.location.y === logToDelete.location.y &&
        log.location.z === logToDelete.location.z
    );

    if (globalIndex !== -1) {
      logs.splice(globalIndex, 1);
      intrusionLog.set(zoneOwner, logs);
      saveZones();
      player.sendMessage(`§aลบประวัติการบุกรุกรายการที่ ${indexToDelete + 1} สำเร็จ!`);
    }
    showIntrusionManagementOptions(player, zoneOwner);
  });
}

function showAdminZoneInfo(player) {
  const allPlayers = Array.from(protectionZones.keys());
  const adminMenu = new ActionFormData()
    .title("ข้อมูลเขตทั้งหมด")
    .body("เลือกผู้เล่นเพื่อดูข้อมูลเขต\n§7เวลาปัจจุบัน: " + formatDateTime(new Date()))
    .button("กลับไปเมนูแอดมิน");

  allPlayers.forEach((playerName) => adminMenu.button(playerName));

  adminMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      showAdminMenu(player);
      return;
    }

    const selectedPlayer = allPlayers[response.selection - 1];
    const zone = protectionZones.get(selectedPlayer);
    if (zone) {
      const info =
        `§eข้อมูลเขตของ ${selectedPlayer}:\n` +
        `พิกัด: (${zone.coordinates.x}, ${zone.coordinates.y}, ${zone.coordinates.z})\n` +
        `สร้างเมื่อ: ${zone.createdAt}\n` +
        `สถานะขอบเขต: ${activeBorders.has(selectedPlayer) ? "§aเปิด" : "§cปิด"}\n` +
        `ระบบป้องกัน: ${zone.protectionEnabled ? "§aเปิด" : "§cปิด"}`;
      player.sendMessage(info);
    } else {
      player.sendMessage("§cไม่พบข้อมูลเขตของผู้เล่นนี้!");
    }
  });
}

function deleteAdminZone(player) {
  const allPlayers = Array.from(protectionZones.keys());
  const adminMenu = new ActionFormData()
    .title("ลบเขตผู้เล่น")
    .body("เลือกผู้เล่นที่ต้องการลบเขต")
    .button("กลับไปเมนูแอดมิน");

  allPlayers.forEach((playerName) => adminMenu.button(playerName));

  adminMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      showAdminMenu(player);
      return;
    }

    const selectedPlayer = allPlayers[response.selection - 1];
    const zone = protectionZones.get(selectedPlayer);
    if (zone) {
      const confirmMenu = new ActionFormData()
        .title("ยืนยันการลบเขต")
        .body(`คุณต้องการลบเขตของ ${selectedPlayer} จริงๆ หรือไม่?`)
        .button("ใช่ ลบเลย")
        .button("ไม่ ยกเลิก");

      confirmMenu.show(player).then((response) => {
        if (response.canceled || response.selection === 1) {
          player.sendMessage("§eยกเลิกการลบเขต!");
          return;
        }

        if (activeBorders.has(selectedPlayer)) {
          Minecraft.system.clearRun(activeBorders.get(selectedPlayer));
          activeBorders.delete(selectedPlayer);
        }

        protectionZones.delete(selectedPlayer);
        allowedPlayers.delete(selectedPlayer);
        saveZones();
        player.sendMessage(`§aลบเขตของ ${selectedPlayer} สำเร็จ!`);
      });
    } else {
      player.sendMessage("§cไม่พบเขตของผู้เล่นนี้!");
    }
  });
}

/*--------------------------------
 🏰 [Zone Creation & Deletion] 
-----------------------------------*/

// ฟังก์ชันช่วยคำนวณว่า location อยู่ในระยะ requiredDistance ของโซนหรือไม่
function isWithinRequiredDistance(location) {
  if (!location || typeof location.x !== "number") return { isWithin: false };
  const minDistanceBuffer = 50;

  for (const [, zoneData] of protectionZones) {
    const { coordinates, size, owner } = zoneData || {};
    if (!coordinates || typeof size !== "number" || !owner) continue;

    const distanceX = Math.abs(location.x - coordinates.x);
    const distanceY = Math.abs(location.y - coordinates.y);
    const distanceZ = Math.abs(location.z - coordinates.z);

    const requiredDistance = size + minDistanceBuffer;

    if (
      distanceX <= requiredDistance &&
      distanceY <= requiredDistance &&
      distanceZ <= requiredDistance
    ) {
      return { isWithin: true, owner, zone: zoneData };
    }
  }
  return { isWithin: false };
}

function createZone(player) {
  if (player.dimension.id !== "minecraft:overworld") {
    player.sendMessage("§cคุณสามารถสร้างเขตป้องกันได้เฉพาะใน Overworld เท่านั้น!");
    return;
  }

  if (protectionZones.has(player.name)) {
    player.sendMessage("§cคุณมีเขตป้องกันแล้ว! คนละ 1 เขตเท่านั้น!");
    return;
  }

  const sizeMenu = new ModalFormData()
    .title("สร้างเขตป้องกันใหม่")
    .slider("เลือกขนาดเขต (บล็อก)", 5, 30, 5, 10);

  sizeMenu.show(player).then((response) => {
    if (response.canceled || !response.formValues) return;

    const fullSize = Number(response.formValues[0]);
    const zoneSize = Math.floor(fullSize / 2);
    const pos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
    };

    const newZone = {
      start: { x: pos.x - zoneSize, y: pos.y - zoneSize, z: pos.z - zoneSize },
      end: { x: pos.x + zoneSize, y: pos.y + zoneSize, z: pos.z + zoneSize },
      owner: player.name,
      coordinates: pos,
      createdAt: formatDateTime(new Date()),
      protectionEnabled: false,
      dimension: "minecraft:overworld",
      size: zoneSize,
      scanHeight: zoneSize,
      showBorderToOthers: false,
      bounceNonPlayers: false,
      visitMode: false,
    };

    const minDistanceBuffer = 20;
    for (const [, existingZone] of protectionZones) {
      const exCenter = existingZone.coordinates;
      const distanceX = Math.abs(pos.x - exCenter.x);
      const distanceY = Math.abs(pos.y - exCenter.y);
      const distanceZ = Math.abs(pos.z - exCenter.z);

      const requiredDistance = zoneSize + existingZone.size + minDistanceBuffer;

      if (
        distanceX < requiredDistance ||
        distanceY < requiredDistance ||
        distanceZ < requiredDistance
      ) {
        player.sendMessage(
          `§cเขตนี้ใกล้เขตอื่นเกินไป (ต้องห่างจากจุดกึ่งกลางอย่างน้อย ${requiredDistance} บล็อก)!`
        );
        return;
      }
    }

    protectionZones.set(player.name, newZone);
    saveZones();
    player.sendMessage(`§aสร้างเขตป้องกันขนาด ${fullSize}x${fullSize}x${fullSize} สำเร็จ! `);
    player.sendMessage(
      `§eเริ่มสแกนไฟในเขต ${fullSize}x${fullSize}x${fullSize} ที่ (${pos.x - zoneSize}, ${
        pos.y - zoneSize
      }, ${pos.z - zoneSize}) ถึง (${pos.x + zoneSize}, ${pos.y + zoneSize}, ${pos.z + zoneSize})`
    );
  });
}

function deleteZone(player) {
  if (!protectionZones.has(player.name)) {
    player.sendMessage("§cคุณไม่มีเขตป้องกันให้ลบ!");
    return;
  }

  const confirmMenu = new ActionFormData()
    .title("ยืนยันการลบเขต")
    .body("คุณต้องการลบเขตป้องกันจริงๆ หรือไม่?")
    .button("ใช่ ลบเลย")
    .button("ไม่ ยกเลิก");

  confirmMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 1) {
      player.sendMessage("§eยกเลิกการลบเขต!");
      return;
    }

    if (activeBorders.has(player.name)) {
      Minecraft.system.clearRun(activeBorders.get(player.name));
      activeBorders.delete(player.name);
    }

    protectionZones.delete(player.name);
    allowedPlayers.delete(player.name);
    scanProgress.delete(player.name);
    saveZones();
    player.sendMessage("§aลบเขตป้องกันสำเร็จ!");
  });
}

/*--------------------------------
 🌐 [Zone Border] 
-----------------------------------*/
function showZoneBorder(player) {
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    return;
  }

  const dimension = player.dimension;
  const { start, end } = zone;

  // ถ้าขอบเขตเปิดอยู่แล้ว ให้หยุด
  if (activeBorders.has(player.name)) {
    Minecraft.system.clearRun(activeBorders.get(player.name));
    activeBorders.delete(player.name);
    player.sendMessage("§eหยุดแสดงขอบเขตแล้ว!");
    return;
  }

  // ฟังก์ชันง่ายๆ สำหรับวาดเส้นด้วยพาร์ทิเคิล
  const drawLine = (from, to, x, y, z) => {
    for (let i = from; i <= to; i++) {
      dimension.spawnParticle("minecraft:endrod", {
        x: x === null ? i + 0.5 : x + 0.5,
        y: y === null ? i + 0.5 : y + 0.5,
        z: z === null ? i + 0.5 : z + 0.5,
      });
    }
  };

  // จุดศูนย์กลางของเขตสำหรับตรวจสอบระยะทาง
  const center = {
    x: (start.x + end.x) / 2,
    z: (start.z + end.z) / 2, // ตรวจสอบเฉพาะ x และ z เพื่อความง่าย
  };

  const zoneSize = end.x - start.x; // สมมติว่าเขตเป็นลูกบาศก์เพื่อความง่าย
  const maxDistance = zoneSize; // หยุดถ้าผู้เล่นอยู่นอกขนาดเขต

  function renderBorder() {
    // ตรวจสอบว่าเขตยังคงอยู่
    if (!protectionZones.get(player.name)) {
      activeBorders.delete(player.name);
      player.sendMessage("§eหยุดแสดงขอบเขตเพราะเขตถูกลบ!");
      return;
    }

    // ตรวจสอบระยะทางของผู้เล่นจากศูนย์กลาง (เฉพาะ x และ z)
    const { x, z } = player.location;
    const distance = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);

    if (distance > maxDistance) {
      const intervalId = activeBorders.get(player.name);
      if (intervalId !== undefined) {
        Minecraft.system.clearRun(intervalId);
        activeBorders.delete(player.name);
        player.sendMessage("§eหยุดแสดงขอบเขตเพราะคุณอยู่นอกระยะ!");
      }
      return;
    }

    // วาดเส้นขอบเขต
    try {
      drawLine(start.x, end.x, null, start.y, start.z); // ขอบล่าง
      drawLine(start.x, end.x, null, start.y, end.z);
      drawLine(start.z, end.z, start.x, start.y, null);
      drawLine(start.z, end.z, end.x, start.y, null);

      drawLine(start.x, end.x, null, end.y, start.z); // ขอบบน
      drawLine(start.x, end.x, null, end.y, end.z);
      drawLine(start.z, end.z, start.x, end.y, null);
      drawLine(start.z, end.z, end.x, end.y, null);

      drawLine(start.y, end.y, start.x, null, start.z); // ขอบแนวตั้ง
      drawLine(start.y, end.y, start.x, null, end.z);
      drawLine(start.y, end.y, end.x, null, start.z);
      drawLine(start.y, end.y, end.x, null, end.z);
    } catch {
      const intervalId = activeBorders.get(player.name);
      if (intervalId !== undefined) {
        Minecraft.system.clearRun(intervalId);
        activeBorders.delete(player.name);
        player.sendMessage("§eหยุดแสดงขอบเขตเพราะเขตอยู่นอกระยะที่โหลด!");
      }
    }
  }

  // เริ่มแสดงทุกๆ 1.5 วินาที
  const intervalId = Minecraft.system.runInterval(renderBorder, 30);
  activeBorders.set(player.name, intervalId);
  player.sendMessage("§aเริ่มแสดงขอบเขต! ใช้คำสั่งนี้อีกครั้งเพื่อหยุด.");
}

/*--------------------------------
 🔄 [Game Loops] 
-----------------------------------*/

const notifiedPlayers = new Set();

Minecraft.system.runInterval(() => {
  const dimension = Minecraft.world.getDimension("minecraft:overworld");
  const players = Minecraft.world.getPlayers();
  const onlineOwners = Array.from(protectionZones.keys()).filter((owner) =>
    players.some((p) => p.name === owner)
  );

  if (onlineOwners.length === 0) return;

  const maxBlocksPerTick = 1;

  // ตรวจสอบและสแกนเขตการป้องกัน (ส่วนไฟ - คงเดิม)
  for (const owner of onlineOwners) {
    const zone = protectionZones.get(owner);
    if (!zone || !zone.protectionEnabled || !zone.coordinates) continue;

    const { coordinates, size } = zone;
    let progress = scanProgress.get(owner) || {
      x: coordinates.x - size,
      y: coordinates.y - size,
      z: coordinates.z - size,
    };

    for (let i = 0; i < maxBlocksPerTick && fireCheckQueue.length < 100; i++) {
      const blockPos = {
        x: Math.floor(Math.random() * (size * 2 + 1)) + (coordinates.x - size),
        y: Math.floor(Math.random() * (size * 2 + 1)) + (coordinates.y - size),
        z: Math.floor(Math.random() * (size * 2 + 1)) + (coordinates.z - size),
      };

      if (
        blockPos.x >= zone.start.x &&
        blockPos.x <= zone.end.x &&
        blockPos.y >= zone.start.y &&
        blockPos.y <= zone.end.y &&
        blockPos.z >= zone.start.z &&
        blockPos.z <= zone.end.z &&
        !fireCheckQueue.some(
          (queued) => queued.x === blockPos.x && queued.y === blockPos.y && queued.z === blockPos.z
        )
      ) {
        fireCheckQueue.push(blockPos);
      }
    }

    progress.x += maxBlocksPerTick;
    if (progress.x > coordinates.x + size) {
      progress.x = coordinates.x - size;
      progress.z += maxBlocksPerTick;
      if (progress.z > coordinates.z + size) {
        progress.z = coordinates.z - size;
        progress.y += 1;
        if (progress.y > coordinates.y + size) {
          progress.y = coordinates.y - size;
        }
      }
    }

    scanProgress.set(owner, progress);
  }

  // ตรวจสอบคิวสแกนไฟ (คงเดิม)
  if (fireCheckQueue.length > 1000) {
    fireCheckQueue.length = 0;
    for (const player of players) {
      if (onlineOwners.includes(player.name)) {
        player.sendMessage("§eคิวสแกนไฟถูกรีเซ็ตเนื่องจากเต็มเกิน 100 บล็อก!");
      }
    }
  }

  const blocksToCheck = fireCheckQueue.splice(0, maxBlocksPerTick);
  for (const pos of blocksToCheck) {
    const block = dimension.getBlock(pos);
    if (block && block.typeId === "minecraft:fire") {
      block.setType("minecraft:air");
      for (const player of players) {
        if (onlineOwners.includes(player.name)) {
          player.sendMessage(`§eไฟถูกลบที่ (${pos.x}, ${pos.y}, ${pos.z}) ในเขตของคุณ!`);
        }
      }
    }
  }

  // ตรวจสอบ entities (คงเดิม)
  const entities = dimension.getEntities();
  if (!entities || entities.length === 0) {
    console.error("ไม่พบ entities หรือเกิดข้อผิดพลาดในการดึงข้อมูล entities");
    return;
  }

  checkEntitiesInZone(entities);
}, 10);

function checkEntitiesInZone(entities) {
  for (const entity of entities) {
    if (!entity || !entity.location) {
      // ถ้าหาก entity ไม่มี location ให้ข้ามไป
      continue;
    }

    const zones = isInsideZone(entity.location);
    const isPlayer = entity instanceof Minecraft.Player;

    if (isPlayer) {
      // ตรวจสอบการเข้าออกเขต
      if (zones.length > 0 && zones.some((z) => z.zone.protectionEnabled)) {
        const { owner, zone } = zones[0];
        const playerName = entity.name;

        const hasAccess = canAccess(entity, owner);

        if (!hasAccess && !notifiedPlayers.has(playerName)) {
          if (zone.visitMode) {
            entity.sendMessage(`§eคุณอยู่ในโหมดเยี่ยมชมเขตของ ${owner}!`);
          } else {
            pushOutOfZone(entity, zone);
            entity.sendMessage(`§cคุณไม่มีสิทธิ์อยู่ในเขตของ ${owner}!`);
            logIntrusion(entity, owner);
          }
          notifiedPlayers.add(playerName); // บันทึกผู้เล่นที่ได้รับการแจ้งเตือนแล้ว
        }
      } else {
        notifiedPlayers.delete(entity.name); // ลบจาก Set ถ้าออกจากเขต
      }
    }
  }
}

/*--------------------------------
 ⚔️ [Event Handlers] 
-----------------------------------*/
Minecraft.world.afterEvents.entityHurt.subscribe((event) => {
  const target = event.hurtEntity;
  if (!(target instanceof Minecraft.Player)) return;

  const targetZones = isInsideZone(target.location);
  if (targetZones.length === 0) return;

  const health = target.getComponent("minecraft:health");
  if (health) health.setCurrentValue(health.effectiveMax);
  target.applyKnockback(0, 0, 0, 0);
  target.addEffect("resistance", 60, { showParticles: false, amplifier: 255 });
  target.addEffect("regeneration", 60, { showParticles: false, amplifier: 255 });
  target.sendMessage("§eคุณอยู่ในเขตป้องกัน: อมตะ!");

  const attacker = event.damageSource.damagingEntity;
  if (!attacker) return;

  if (attacker instanceof Minecraft.Player && !targetZones.some((z) => z.owner === attacker.name)) {
    const attackerHealth = attacker.getComponent("minecraft:health");
    if (attackerHealth) {
      attackerHealth.setCurrentValue(attackerHealth.currentValue - event.damage);
      attacker.applyKnockback(
        attacker.location.x - target.location.x,
        attacker.location.z - target.location.z,
        2,
        2
      );
    }
    if (attacker instanceof Minecraft.Player) {
      attacker.sendMessage("§cคุณโจมตีในเขตป้องกัน: ดาเมจสะท้อนและถูกดีด!");
    }
  }
});

Minecraft.world.afterEvents.entitySpawn.subscribe((event) => {
  const entity = event.entity;
  if (!entity || !entity.location || !entity.typeId) return;

  const zoneCheck = isWithinRequiredDistance(entity.location);
  if (!zoneCheck.isWithin) return;

  if (dEntities.includes(entity.typeId)) {
    entity.kill();
  }
});

const dEntities = [
  "minecraft:arrow",
  "minecraft:fireball",
  "minecraft:small_fireball",
  "minecraft:tnt",
  "minecraft:splash_potion",
  "minecraft:egg",
  "minecraft:snowball",
  "minecraft:ender_pearl",
  "minecraft:wind_charge_projectile",
];

Minecraft.world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const player = event.player;
  const block = event.block;
  const zones = isInsideZone(block.location);
  if (zones.length > 0 && !zones.some((z) => canAccess(player, z.owner))) {
    event.block.setType("minecraft:air");
    player.sendMessage("§cคุณไม่มีสิทธิ์วางบล็อกในเขตนี้!");
  }
});

Minecraft.world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const player = event.player;
  const block = event.block;
  const zones = isInsideZone(block.location);
  if (zones.length > 0 && !zones.some((z) => canAccess(player, z.owner))) {
    event.cancel = true;
    player.sendMessage("§cคุณไม่มีสิทธิ์ขุดบล็อกในเขตนี้!");
  }
});

Minecraft.world.beforeEvents.playerPlaceBlock.subscribe((event) => {
  const player = event.player;
  const block = event.block;
  const zones = isInsideZone(block.location);
  if (zones.length > 0 && !zones.some((z) => canAccess(player, z.owner))) {
    event.cancel = true;
    player.sendMessage("§cคุณไม่มีสิทธิ์วางบล็อกในเขตนี้!");
  }
});

Minecraft.world.beforeEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const item = event.itemStack;

  if (!player || !player.location || !player.name || !item || !item.typeId) return;

  const zoneCheck = isWithinRequiredDistance(player.location);
  if (!zoneCheck.isWithin) return;

  if (player.name !== zoneCheck.owner) {
    const { visitMode } = zoneCheck.zone || {};
    if (visitMode !== true && restrictedItems.includes(item.typeId)) {
      event.cancel = true;
      player.sendMessage(
        `§cคุณไม่สามารถใช้ ${item.typeId.replace("minecraft:", "")} ในเขตของ ${zoneCheck.owner}!`
      );
    }
  }
});

Minecraft.world.beforeEvents.itemUseOn.subscribe((event) => {
  const player = event.source;
  const block = event.block;
  const item = event.itemStack;

  if (!player || !player.name || !block || !block.location || !item) return;

  const zones = isInsideZone(block.location);
  if (zones.length === 0) return;

  if (!zones.some((z) => canAccess(player, z.owner))) {
    if (restrictedItems.includes(item.typeId)) {
      event.cancel = true;
      player.sendMessage("§cคุณไม่สามารถใช้ไอเทมอันตรายนี้ในเขตของผู้อื่น!");
      return;
    }

    if (restrictedBlocks.includes(block.typeId)) {
      event.cancel = true;
      player.sendMessage("§cคุณไม่สามารถใช้งานบล็อกประเภทนี้ในเขตของผู้อื่น!");
      return;
    }

    event.cancel = true;
    player.sendMessage("§cคุณไม่มีสิทธิ์ใช้ไอเทมในเขตนี้!");
  }
});

Minecraft.world.beforeEvents.chatSend.subscribe((event) => {
  const player = event.sender;
  const message = event.message;

  if (!player || !player.location || !player.name || !message) return;

  if (
    (message.includes("/setblock") && message.includes("tnt")) ||
    (message.includes("/fill") && message.includes("tnt"))
  ) {
    const zoneCheck = isWithinRequiredDistance(player.location); // Fixed typo
    if (!zoneCheck.isWithin) return;

    if (zoneCheck.owner !== player.name) {
      event.cancel = true;
      player.sendMessage(`§cไม่อนุญาตให้ใช้คำสั่งวาง TNT ในเขตของ ${zoneCheck.owner}!`);
    }
  }
});

Minecraft.world.beforeEvents.playerInteractWithBlock.subscribe((eventData) => {
  const { block, player } = eventData;
  const zones = isInsideZone(block.location);

  if (zones.length > 0 && !zones.some((z) => canAccess(player, z.owner))) {
    eventData.cancel = true;
    player.sendMessage("§cคุณไม่มีสิทธิ์โต้ตอบกับบล็อกในเขตนี้!");
  }
});

const restrictedEntities = {
  removeInstantly: [
    "minecraft:fireball",
    "minecraft:small_fireball",
    "minecraft:wither_skull",
    "minecraft:wither_skull_dangerous",
    "minecraft:tnt",
    "minecraft:creeper",
    "minecraft:phantom",
    "minecraft:wind_charge_projectile",
    "minecraft:wind_charge",
    "minecraft:firework_rocket",
    "minecraft:firework_star",
    "minecraft:firework",
    "minecraft:firework_charge",
    "minecraft:egg",
    "minecraft:ender_pearl",
    "minecraft:experience_bottle",
    "minecraft:snowball",
    "minecraft:splash_potion",
    "minecraft:lingering_potion",
    "minecraft:trident",
    "minecraft:arrow",
    "minecraft:thrown_trident",
    "minecraft:lightning_bolt",
    "minecraft:fishing_hook",
  ],
  preventSpawn: [
    "minecraft:zombie",
    "minecraft:skeleton",
    "minecraft:spider",
    "minecraft:enderman",
    "minecraft:witch",
    "minecraft:ghast",
    "minecraft:magma_cube",
    "minecraft:slime",
    "minecraft:blaze",
    "minecraft:evoker",
    "minecraft:wind_charge_projectile",
    "minecraft:wind_charge",
    "minecraft:fireball",
    "minecraft:small_fireball",
  ],
  bounceOnly: [
    "minecraft:wither",
    "minecraft:warden",
    "minecraft:ravager",
    "minecraft:vex",
    "minecraft:pillager",
  ],
  noInteraction: [
    "minecraft:villager",
    "minecraft:item_frame",
    "minecraft:armor_stand",
    "minecraft:wandering_trader",
    "minecraft:boat",
    "minecraft:minecart",
    "minecraft:chest_minecart",
    "minecraft:hopper_minecart",
  ],
};

const restrictedBlocks = [
  "ender_chest",
  "wheat",
  "gate",
  "trapdoor",
  "crafter",
  "anvil",
  "crafting_table",
  "candle",
  "spruce_hanging_sign",
  "minecraft:cartography_table",
  "minecraft:brewing_stand",
  "minecraft:furnace",
  "minecraft:blast_furnace",
  "minecraft:grindstone",
  "minecraft:smithing_table",
  "minecraft:ender_chest",
  "minecraft:shulker_box",
  "minecraft:hopper",
  "minecraft:flower_pot",
  "minecraft:smoker",
  "minecraft:respawn_anchor",
  "minecraft:barrel",
  "minecraft:decorated_pot",
  "minecraft:composter",
  "minecraft:room",

  "minecraft:tnt",
  "minecraft:respawn_anchor",
  "minecraft:end_portal_frame",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:dispenser",
  "minecraft:dropper",
  "minecraft:observer",
  "minecraft:chest",
  "minecraft:furnace",
  "minecraft:hopper",
  "minecraft:barrel",
  "minecraft:double_chest",
  "minecraft:ender_chest",
  "minecraft:shulker_box",
  "minecraft:beacon",
  "minecraft:brewing_stand",
  "minecraft:campfire",
  "minecraft:smoker",
  "minecraft:blast_furnace",
  "minecraft:lectern",
  "minecraft:jukebox",
  "minecraft:loom",
  "minecraft:cartography_table",
  "minecraft:stonecutter",
  "minecraft:composter",
  "minecraft:grindstone",
  "minecraft:smithing_table",
  "minecraft:anvil",
  "minecraft:enchanting_table",
  "minecraft:ender_chest",
  "minecraft:crafting_table",
  "minecraft:bell",
  "minecraft:lodestone",
  "minecraft:door",
  "minecraft:trapdoor",
  "minecraft:fence_gate",
  "minecraft:barrier",
  "minecraft:fence",
  "minecraft:iron_bars",
  "minecraft:glass_pane",
];

const restrictedItems = [
  "minecraft:tnt",
  "minecraft:flint_and_steel",
  "minecraft:fire_charge",
  "minecraft:lava_bucket",
  "minecraft:respawn_anchor",
  "minecraft:end_crystal",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:bow",
  "minecraft:crossbow",
  "minecraft:trident",
  "minecraft:fishing_rod",
  "minecraft:shield",
  "minecraft:elytra",
  "minecraft:firework_rocket",
  "minecraft:splash_potion",
  "minecraft:lingering_potion",
  "minecraft:bucket",
  "minecraft:water_bucket",
  "minecraft:flint_and_steel",
  "minecraft:fire_charge",
  "minecraft:lava_bucket",
  "minecraft:respawn_anchor",
  "minecraft:end_crystal",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:ender_pearl",
  "minecraft:eye_of_ender",
  "minecraft:goat_horn",
  "minecraft:snowball",
  "minecraft:egg",
  "minecraft:wind_charge",
];

/*--------------------------------
 🔐 [Protection Toggle] 
-----------------------------------*/
function toggleProtection(player) {
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณยังไม่มีเขตป้องกัน!");
    return;
  }

  zone.protectionEnabled = !zone.protectionEnabled;
  protectionZones.set(player.name, zone);
  saveZones();
  player.sendMessage(
    zone.protectionEnabled
      ? "§aเปิดระบบป้องกันผู้เล่นในเขตแล้ว!"
      : "§cปิดระบบป้องกันผู้เล่นในเขตแล้ว!"
  );
}

/*--------------------------------
 📜 [Intrusion Logging] 
-----------------------------------*/
function logIntrusion(player, zoneOwner) {
  const timestamp = formatDateTime(new Date());
  const logEntry = {
    intruder: player.name,
    zoneOwner: zoneOwner,
    timestamp: timestamp,
    location: {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
    },
  };

  const logs = intrusionLog.get(zoneOwner) || [];
  logs.push(logEntry);
  intrusionLog.set(zoneOwner, logs);
  saveZones();

  const ownerPlayer = Minecraft.world.getPlayers().find((p) => p.name === zoneOwner);
  if (ownerPlayer) {
    ownerPlayer.sendMessage(
      `§cผู้บุกรุก: ${player.name} เข้ามาในเขตของคุณที่ (${logEntry.location.x}, ${logEntry.location.y}, ${logEntry.location.z}) เมื่อ ${timestamp}!`
    );
  }
}
